import { NextRequest, NextResponse } from "next/server";
import { prompt, ServiceUnavailableError } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    business_name,
    business_description,
    audience,
    tone,
    tone_examples,
    competitors,
    source_content,
    competitor_analysis,
  } = body;

  if (!business_name && !business_description && !audience && !tone) {
    return NextResponse.json(
      { error: "At least one brand field is required" },
      { status: 400 }
    );
  }

  // Enforce character limits on inputs
  const fields = { business_name, business_description, audience, tone, tone_examples, competitors };
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === "string" && val.length > 1000) {
      return NextResponse.json(
        { error: `${key} exceeds maximum length` },
        { status: 400 }
      );
    }
  }

  let contextBlock = "";
  if (source_content?.overall_voice) {
    contextBlock += `\n- Existing website voice analysis: ${source_content.overall_voice}`;
    if (source_content.suggested_improvements) {
      contextBlock += `\n- Suggested improvements to existing copy: ${source_content.suggested_improvements}`;
    }
  }
  if (competitor_analysis) {
    contextBlock += `\n- Competitor voice analysis: ${competitor_analysis}`;
  }

  try {
    const voice_profile = await prompt(
      "You are a brand voice analyst. Return ONLY the voice profile, no preamble.",
      `Based on the following brand information, extract a compact voice profile (200-300 words max) that captures:
- Tone and register (formal/casual/playful/authoritative/etc.)
- Vocabulary level and preferred terminology
- Sentence rhythm (short and punchy vs. flowing vs. mixed)
- Key phrases or concepts that should recur
- What to avoid (jargon, clichés, competitor language)

Brand information:
${business_name ? `- Business: ${business_name}${business_description ? ` — ${business_description}` : ""}` : ""}
${audience ? `- Audience: ${audience}` : ""}
${tone ? `- Desired tone: ${tone}` : ""}
${tone_examples ? `- Copy they like: ${tone_examples}` : ""}
${competitors ? `- Competitors/inspiration: ${competitors}` : ""}${contextBlock}`,
      1024
    );

    return NextResponse.json({ voice_profile });
  } catch (err) {
    if (err instanceof ServiceUnavailableError) {
      return NextResponse.json(
        { error: err.message, service_unavailable: err.kind },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Voice extraction failed" },
      { status: 500 }
    );
  }
}
