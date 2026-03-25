import { NextRequest, NextResponse } from "next/server";
import { prompt, ServiceUnavailableError } from "@/lib/anthropic";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, checkAnalysisRateLimit, incrementAnalysisRateLimit } from "@/lib/rate-limit";
import { logUsage } from "@/lib/usage-log";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { current_copy, previous_copy, voice_profile, business_name, user_prompt, turnstile_token } = body;

  // Turnstile verification
  if (turnstile_token) {
    const valid = await verifyTurnstile(turnstile_token);
    if (!valid) {
      return NextResponse.json({ error: "Bot verification failed" }, { status: 403 });
    }
  }

  // Check auth status for rate limit tier, then check analysis limit
  const authCheck = await checkRateLimit(req);
  const rateLimit = checkAnalysisRateLimit(req, authCheck.isAuthenticated);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Analysis limit reached. Try again tomorrow." },
      { status: 429 }
    );
  }

  if (!current_copy || typeof current_copy !== "string" || current_copy.length > 5000) {
    return NextResponse.json(
      { error: "Copy text is required (max 5000 characters)" },
      { status: 400 }
    );
  }

  if (!voice_profile || !business_name) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    const previousSection = previous_copy
      ? `\nPREVIOUS VERSION:\n${previous_copy}\n`
      : "";

    const diffInstruction = previous_copy
      ? " If a previous version is provided, note what improved or regressed compared to it."
      : "";

    const result = await prompt(
      `You are a professional copywriter reviewing content for ${business_name}. Respond with ONLY valid JSON, no preamble or markdown fences.`,
      `VOICE PROFILE:
${voice_profile}

ORIGINAL REQUEST:
${user_prompt || "(no specific request)"}
${previousSection}
CURRENT COPY:
${current_copy}

Analyze this copy against the voice profile and original request. What's working, what could be stronger?${diffInstruction}

Respond with ONLY valid JSON:
{
  "reasoning": "2-3 sentences on what's working and what could improve",
  "suggestions": ["Specific, actionable suggestion 1", "Suggestion 2"]
}`,
      512
    );

    const parsed = parseResponse(result);

    incrementAnalysisRateLimit(req);
    logUsage({
      userId: authCheck.userId,
      eventType: "analysis",
    });

    return NextResponse.json({
      ai_notes: {
        generation_reasoning: parsed.reasoning ?? "",
        suggestions: parsed.suggestions ?? [],
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
      { error: "Analysis failed" },
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
