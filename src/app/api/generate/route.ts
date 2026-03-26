import { NextRequest, NextResponse } from "next/server";
import { prompt, streamPrompt, ServiceUnavailableError } from "@/lib/anthropic";
import { parseJson } from "@/lib/parse-json";
import {
  CONTENT_CATEGORIES,
  CATEGORY_KEYS,
} from "@/lib/component-types";
import { textToDoc } from "@/lib/tiptap-utils";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, incrementRateLimit } from "@/lib/rate-limit";
import { logUsage } from "@/lib/usage-log";

const NOTES_DELIMITER = "---NOTES---";
const MAX_RETRIES = 2;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category, user_prompt, voice_profile, business_name, source_content, turnstile_token, feedback, current_copy, max_chars } = body;
  const isRefining = !!feedback && !!current_copy;

  const maxChars = typeof max_chars === "number" ? max_chars : undefined;

  // ── Validation (all before opening the stream) ────────────────

  if (turnstile_token) {
    const valid = await verifyTurnstile(turnstile_token);
    if (!valid) {
      return NextResponse.json({ error: "Verification expired — please refresh the page and try again." }, { status: 403 });
    }
  }

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

  if (!category || typeof category !== "string" || category.length > 100) {
    return NextResponse.json(
      { error: "Invalid content category" },
      { status: 400 }
    );
  }

  if (!isRefining && (!user_prompt || typeof user_prompt !== "string" || user_prompt.length > 4000)) {
    return NextResponse.json(
      { error: "Prompt is required (max 4000 characters)" },
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

  const categoryInfo = CONTENT_CATEGORIES[category] ?? {
    label: category,
    guidance: "Follow the user's prompt closely.",
  };

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

  const constraintSection = maxChars
    ? `\nCONSTRAINTS:\n- Maximum length: ${maxChars} characters. This is a hard limit.`
    : "";

  // ── Build prompts ─────────────────────────────────────────────

  const systemMsg = `You are a professional copywriter generating content for ${business_name}. Output the copy as plain text first, then metadata as JSON after a delimiter.`;

  const userMsg = `VOICE PROFILE:
${voice_profile}
${existingCopyContext}
CONTENT CATEGORY: ${categoryInfo.label}
CATEGORY GUIDANCE: ${categoryInfo.guidance}${constraintSection}

USER REQUEST:
${user_prompt || "(see refinement feedback below)"}
${isRefining ? `\nCURRENT COPY (revise this based on the feedback below):\n${current_copy}\n\nFEEDBACK:\n${feedback}` : ""}

Write the copy as natural text. Use line breaks to separate sections or paragraphs.
After the copy, output exactly this delimiter on its own line:
${NOTES_DELIMITER}
Then output ONLY valid JSON (no markdown fences):
{
  "title": "1-4 word title for this copy block",
  "reasoning": "Brief explanation of your copywriting choices (1-2 sentences)",
  "suggestions": ["Optional improvement suggestions the user might consider"]
}`;

  // ── Stream the response ───────────────────────────────────────

  const encoder = new TextEncoder();

  // Helper: write an SSE event to the stream controller.
  // SSE format is "data: <json>\n\n" — the double newline signals end of event.
  function sendEvent(
    controller: ReadableStreamDefaultController,
    event: Record<string, unknown>,
  ) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Streaming first pass ──────────────────────────────
        const messageStream = streamPrompt(systemMsg, userMsg, 2048);
        let fullText = "";

        // The Anthropic SDK's stream object emits 'text' events for each
        // token. We forward them as SSE delta events so the client can
        // render text as it arrives.
        for await (const event of messageStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullText += text;

            // Only forward text that comes before the delimiter — the notes
            // section is metadata, not user-visible copy.
            if (!fullText.includes(NOTES_DELIMITER)) {
              sendEvent(controller, { type: "delta", text });
            }
          }
        }

        // ── Parse the completed response ──────────────────────
        const { copyText, notes } = parseStreamedResponse(fullText);

        // ── Constraint validation + retry ─────────────────────
        let finalCopyText = copyText;
        let finalNotes = notes;
        let constraintWarning: string | undefined;

        if (maxChars && copyText.length > maxChars) {
          // Non-streaming retry — don't stream the correction, just show
          // a brief "Refining..." indicator on the client side.
          const retryResult = await retryForConstraint(
            systemMsg, copyText, finalNotes, maxChars
          );
          finalCopyText = retryResult.copyText;
          finalNotes = retryResult.notes;
          constraintWarning = retryResult.constraintWarning;
        }

        // ── Finalize ──────────────────────────────────────────
        await incrementRateLimit(req, rateLimit.userId);
        logUsage({
          userId: rateLimit.userId,
          eventType: "generation",
          componentType: category,
        });

        sendEvent(controller, {
          type: "complete",
          title: finalNotes.title ?? "",
          content: textToDoc(finalCopyText),
          ai_notes: {
            generation_reasoning: finalNotes.reasoning ?? "",
            suggestions: finalNotes.suggestions ?? [],
          },
          ...(maxChars !== undefined && { max_chars: maxChars }),
          ...(constraintWarning && { constraint_warning: constraintWarning }),
        });
      } catch (err) {
        if (err instanceof ServiceUnavailableError) {
          sendEvent(controller, {
            type: "error",
            error: err.message,
            service_unavailable: err.kind,
          });
        } else {
          sendEvent(controller, {
            type: "error",
            error: "Generation failed",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────

interface ParsedNotes {
  title?: string;
  reasoning?: string;
  suggestions?: string[];
}

/**
 * Split the streamed LLM output on the NOTES delimiter.
 * Uses lastIndexOf for robustness — if the LLM echoes the delimiter
 * inside the copy text, we split on the final occurrence.
 */
function parseStreamedResponse(fullText: string): {
  copyText: string;
  notes: ParsedNotes;
} {
  const delimIndex = fullText.lastIndexOf(NOTES_DELIMITER);

  if (delimIndex === -1) {
    // No delimiter found — treat entire output as copy, no notes
    return { copyText: fullText.trim(), notes: {} };
  }

  const copyText = fullText.slice(0, delimIndex).trim();
  const notesRaw = fullText.slice(delimIndex + NOTES_DELIMITER.length).trim();

  let notes: ParsedNotes = {};
  try {
    notes = parseJson(notesRaw) as ParsedNotes;
  } catch {
    // Notes parsing failed — copy is still usable
  }

  return { copyText, notes };
}

/**
 * Non-streaming retry loop for constraint violations.
 * Uses the original (non-streaming) prompt() function since we don't want
 * to stream the correction — the client shows a brief "Refining..." state.
 */
async function retryForConstraint(
  systemMsg: string,
  copyText: string,
  notes: ParsedNotes,
  maxChars: number,
): Promise<{
  copyText: string;
  notes: ParsedNotes;
  constraintWarning?: string;
}> {
  let bestCopy = copyText;
  let bestNotes = notes;
  let bestDistance = copyText.length - maxChars;
  let constraintWarning: string | undefined =
    `Output is ${copyText.length} chars, exceeding the ${maxChars}-character limit`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const retryMsg = `The previous output was ${bestCopy.length} characters, exceeding the ${maxChars}-character limit.

Previous output:
${bestCopy}

Please revise to fit within ${maxChars} characters.

Write the revised copy as natural text. Use line breaks to separate sections.
After the copy, output exactly this delimiter on its own line:
${NOTES_DELIMITER}
Then output ONLY valid JSON (no markdown fences):
{
  "title": "${bestNotes.title ?? "1-4 word title"}",
  "reasoning": "Brief explanation of your revision choices (1-2 sentences)",
  "suggestions": ["Optional improvement suggestions"]
}`;

    const result = await prompt(systemMsg, retryMsg, 2048);
    const parsed = parseStreamedResponse(result);

    if (parsed.copyText.length <= maxChars) {
      return {
        copyText: parsed.copyText,
        notes: parsed.notes,
        constraintWarning: undefined,
      };
    }

    const distance = parsed.copyText.length - maxChars;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCopy = parsed.copyText;
      bestNotes = parsed.notes;
      constraintWarning = `Output is ${parsed.copyText.length} chars, exceeding the ${maxChars}-character limit`;
    }
  }

  // All retries failed — return the closest attempt with a warning
  return { copyText: bestCopy, notes: bestNotes, constraintWarning };
}
