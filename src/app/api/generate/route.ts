import { NextRequest, NextResponse } from "next/server";
import { prompt, ServiceUnavailableError } from "@/lib/anthropic";
import {
  CONTENT_CATEGORIES,
  CATEGORY_KEYS,
} from "@/lib/component-types";
import { textToDoc } from "@/lib/tiptap-utils";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, incrementRateLimit } from "@/lib/rate-limit";
import { logUsage } from "@/lib/usage-log";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category, user_prompt, voice_profile, business_name, source_content, turnstile_token, feedback, current_copy, max_words, min_words } = body;
  const isRefining = !!feedback && !!current_copy;

  // Convert user-facing word limits to character limits for validation.
  // 6 chars/word accounts for average word length plus spaces/punctuation.
  const maxChars = typeof max_words === "number" ? max_words * 6 : undefined;
  const minChars = typeof min_words === "number" ? min_words * 6 : undefined;

  // Turnstile verification
  if (turnstile_token) {
    const valid = await verifyTurnstile(turnstile_token);
    if (!valid) {
      return NextResponse.json({ error: "Verification expired — please refresh the page and try again." }, { status: 403 });
    }
  }

  // Rate limiting
  const rateLimit = await checkRateLimit(req);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: rateLimit.isAuthenticated
          ? "You've hit today's generation limit. This tool is a free project by Bit Lore, a custom web development studio in Portland. If you're finding this useful, or if you need help building the site this content is going to live on, I'd love to hear from you."
          : "Generation limit reached. Save your work to unlock more.",
        limit_reached: true,
        soft_limit: rateLimit.isAuthenticated,
      },
      { status: 429 }
    );
  }

  if (!category || !CATEGORY_KEYS.includes(category)) {
    return NextResponse.json(
      { error: "Invalid content category" },
      { status: 400 }
    );
  }

  // For refinement, user_prompt can be empty (the original prompt may be lost
  // on older blocks). The feedback field is what matters.
  if (!isRefining && (!user_prompt || typeof user_prompt !== "string" || user_prompt.length > 1000)) {
    return NextResponse.json(
      { error: "Prompt is required (max 1000 characters)" },
      { status: 400 }
    );
  }
  if (isRefining) {
    if (typeof feedback !== "string" || feedback.length > 1000) {
      return NextResponse.json(
        { error: "Feedback is required (max 1000 characters)" },
        { status: 400 }
      );
    }
    if (typeof current_copy !== "string" || current_copy.length > 50000) {
      return NextResponse.json(
        { error: "Current copy is too long" },
        { status: 400 }
      );
    }
  }

  if (!voice_profile || !business_name) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const categoryInfo = CONTENT_CATEGORIES[category];

  // Check for existing copy context from URL extraction
  let existingCopyContext = "";
  if (source_content?.identified_components) {
    const components = source_content.identified_components as Array<{
      type: string;
      existing_copy: string;
      quality: string;
      notes: string;
    }>;
    if (components.length > 0) {
      existingCopyContext = `\nEXISTING WEBSITE COPY (for reference — use as context, improve where appropriate):\n${components
        .map((c) => `${c.type}: ${c.existing_copy}`)
        .join("\n")}`;
    }
  }

  // Build the constraints section for the prompt
  const constraintLines: string[] = [];
  if (max_words) constraintLines.push(`- Maximum length: ${max_words} words (~${maxChars} characters). This is a hard limit.`);
  if (min_words) constraintLines.push(`- Minimum length: ${min_words} words (~${minChars} characters).`);
  const constraintSection = constraintLines.length > 0
    ? `\nCONSTRAINTS:\n${constraintLines.join("\n")}`
    : "";

  try {
    const systemMsg = `You are a professional copywriter generating content for ${business_name}. Respond with ONLY valid JSON, no preamble or markdown fences.`;
    const userMsg = `VOICE PROFILE:
${voice_profile}
${existingCopyContext}
CONTENT CATEGORY: ${categoryInfo.label}
CATEGORY GUIDANCE: ${categoryInfo.guidance}${constraintSection}

USER REQUEST:
${user_prompt || "(see refinement feedback below)"}
${isRefining ? `\nCURRENT COPY (revise this based on the feedback below):\n${current_copy}\n\nFEEDBACK:\n${feedback}` : ""}

Respond with ONLY valid JSON matching this exact structure:
{
  "title": "1-4 word title for this copy block",
  "content": "Your generated copy here. Use \\n for line breaks if multiple paragraphs are appropriate.",
  "notes": {
    "reasoning": "Brief explanation of your copywriting choices (1-2 sentences)",
    "suggestions": ["Optional improvement suggestions the user might consider"]
  }
}`;

    // Generate with retry loop for constraint validation.
    // On constraint failure, we send a corrective prompt asking the model to
    // revise. Max 2 retries — after that we return the closest attempt with a
    // warning. This is "soft validation": usable copy is never discarded.
    const MAX_RETRIES = 2;
    let bestParsed: Record<string, unknown> | null = null;
    let bestDistance = Infinity;
    let constraintWarning: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const msgToSend = attempt === 0
        ? userMsg
        : buildRetryPrompt(bestParsed!, maxChars, minChars, max_words, min_words);

      const result = await prompt(systemMsg, msgToSend, 2048);
      const parsed = parseResponse(result);
      const contentStr = typeof parsed.content === "string"
        ? parsed.content
        : String(parsed.content ?? "");
      const contentLen = contentStr.length;

      // Check constraints
      const overMax = maxChars && contentLen > maxChars;
      const underMin = minChars && contentLen < minChars;

      if (!overMax && !underMin) {
        bestParsed = parsed;
        constraintWarning = undefined;
        break;
      }

      // Track the attempt closest to the constraints
      const distance = overMax
        ? contentLen - maxChars!
        : minChars! - contentLen;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestParsed = parsed;
        constraintWarning = overMax
          ? `Output is ~${Math.ceil(contentLen / 6)} words (${contentLen} chars), exceeding the ${max_words}-word limit`
          : `Output is ~${Math.ceil(contentLen / 6)} words (${contentLen} chars), under the ${min_words}-word minimum`;
      }

      if (attempt === MAX_RETRIES) break;
    }

    const parsed = bestParsed!;
    const title = typeof parsed.title === "string" ? parsed.title : "";
    const content = typeof parsed.content === "string"
      ? textToDoc(parsed.content)
      : textToDoc(String(parsed.content ?? ""));
    const notes = parsed.notes as Record<string, unknown> | undefined;

    // Increment rate limit and log usage
    await incrementRateLimit(req, rateLimit.userId);
    logUsage({
      userId: rateLimit.userId,
      eventType: "generation",
      componentType: category,
    });

    return NextResponse.json({
      title,
      content,
      ai_notes: {
        generation_reasoning: notes?.reasoning ?? "",
        suggestions: notes?.suggestions ?? [],
      },
      ...(max_words !== undefined && { max_words }),
      ...(min_words !== undefined && { min_words }),
      ...(constraintWarning && { constraint_warning: constraintWarning }),
    });
  } catch (err) {
    if (err instanceof ServiceUnavailableError) {
      return NextResponse.json(
        { error: err.message, service_unavailable: err.kind },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 500 }
    );
  }
}

function parseResponse(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
  return JSON.parse(cleaned);
}

function buildRetryPrompt(
  previousParsed: Record<string, unknown>,
  maxChars: number | undefined,
  minChars: number | undefined,
  maxWords: number | undefined,
  minWords: number | undefined,
): string {
  const contentStr = typeof previousParsed.content === "string"
    ? previousParsed.content
    : String(previousParsed.content ?? "");
  const actualChars = contentStr.length;
  const overMax = maxChars && actualChars > maxChars;

  const direction = overMax ? "over" : "under";
  const limit = overMax ? "maximum" : "minimum";
  const limitChars = overMax ? maxChars : minChars;
  const limitWords = overMax ? maxWords : minWords;

  return `The previous output was ${direction} the ${limit} limit (~${Math.ceil(actualChars / 6)} words / ${actualChars} chars, limit is ${limitWords} words / ${limitChars} chars).

Previous output:
${contentStr}

Please revise to fit within the constraints. Return the same JSON structure:
{
  "title": "1-4 word title for this copy block",
  "content": "Your revised copy here. Use \\n for line breaks if multiple paragraphs are appropriate.",
  "notes": {
    "reasoning": "Brief explanation of your copywriting choices (1-2 sentences)",
    "suggestions": ["Optional improvement suggestions the user might consider"]
  }
}`;
}
