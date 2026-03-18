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
  const { category, user_prompt, voice_profile, business_name, source_content, turnstile_token } = body;

  // Turnstile verification
  if (turnstile_token) {
    const valid = await verifyTurnstile(turnstile_token);
    if (!valid) {
      return NextResponse.json({ error: "Bot verification failed" }, { status: 403 });
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

  if (!user_prompt || typeof user_prompt !== "string" || user_prompt.length > 1000) {
    return NextResponse.json(
      { error: "Prompt is required (max 1000 characters)" },
      { status: 400 }
    );
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

  try {
    const result = await prompt(
      `You are a professional copywriter generating content for ${business_name}. Respond with ONLY valid JSON, no preamble or markdown fences.`,
      `VOICE PROFILE:
${voice_profile}
${existingCopyContext}
CONTENT CATEGORY: ${categoryInfo.label}
CATEGORY GUIDANCE: ${categoryInfo.guidance}

USER REQUEST:
${user_prompt}

Respond with ONLY valid JSON matching this exact structure:
{
  "content": "Your generated copy here. Use \\n for line breaks if multiple paragraphs are appropriate.",
  "notes": {
    "reasoning": "Brief explanation of your copywriting choices (1-2 sentences)",
    "suggestions": ["Optional improvement suggestions the user might consider"]
  }
}`,
      2048
    );

    const parsed = parseResponse(result);
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
      content,
      ai_notes: {
        generation_reasoning: notes?.reasoning ?? "",
        suggestions: notes?.suggestions ?? [],
      },
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
