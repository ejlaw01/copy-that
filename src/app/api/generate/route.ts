import { NextRequest, NextResponse } from "next/server";
import { prompt } from "@/lib/anthropic";
import {
  COMPONENT_TYPES,
  COMPONENT_TYPE_KEYS,
  isMultiItem,
  type MultiItemConstraint,
} from "@/lib/component-types";
import { textToDoc } from "@/lib/tiptap-utils";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, incrementRateLimit } from "@/lib/rate-limit";
import { logUsage } from "@/lib/usage-log";

const MAX_RETRIES = 2;

function buildConstraintInstructions(componentType: string): string {
  const schema = COMPONENT_TYPES[componentType];
  const lines: string[] = [];

  if (isMultiItem(schema)) {
    const multi = schema as MultiItemConstraint;
    lines.push(`Structure: Generate exactly ${multi.count} item(s).`);
    for (const [field, constraint] of Object.entries(multi.per_item)) {
      lines.push(`- "${field}": ${constraint.guidance ?? ""}`);
      if (constraint.max_chars) lines.push(`  Max ${constraint.max_chars} characters.`);
      if (constraint.min_chars) lines.push(`  Min ${constraint.min_chars} characters.`);
    }
  } else {
    if (schema.guidance) lines.push(schema.guidance);
    if (schema.max_chars) lines.push(`Maximum ${schema.max_chars} characters.`);
    if (schema.min_chars) lines.push(`Minimum ${schema.min_chars} characters.`);
    if (schema.structure === "single_line") lines.push("Must be a single line — no line breaks.");
  }

  return lines.join("\n");
}

function buildJsonSchema(componentType: string): string {
  const schema = COMPONENT_TYPES[componentType];

  if (isMultiItem(schema)) {
    const multi = schema as MultiItemConstraint;
    const fields = Object.keys(multi.per_item)
      .map((f) => `"${f}": "string"`)
      .join(", ");
    const item = `{ ${fields} }`;
    const items = Array(multi.count).fill(item).join(", ");
    return `{ "items": [${items}] }`;
  }

  return `"string"`;
}

function parseResponse(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
  return JSON.parse(cleaned);
}

function validateContent(
  parsed: Record<string, unknown>,
  componentType: string
): { valid: boolean; errors: string[] } {
  const schema = COMPONENT_TYPES[componentType];
  const errors: string[] = [];

  if (isMultiItem(schema)) {
    const multi = schema as MultiItemConstraint;
    const data = parsed as { content?: { items?: Record<string, string>[] } };
    const items = data.content?.items;
    if (!Array.isArray(items)) {
      errors.push("Missing items array");
      return { valid: false, errors };
    }
    if (items.length !== multi.count) {
      errors.push(`Expected ${multi.count} items, got ${items.length}`);
    }
    for (const [i, item] of items.entries()) {
      for (const [field, constraint] of Object.entries(multi.per_item)) {
        const val = item[field];
        if (!val) {
          errors.push(`Item ${i + 1} missing "${field}"`);
          continue;
        }
        if (constraint.max_chars && val.length > constraint.max_chars) {
          errors.push(
            `Item ${i + 1} "${field}" is ${val.length} chars (max ${constraint.max_chars})`
          );
        }
      }
    }
  } else {
    const data = parsed as { content?: string };
    const content = data.content;
    if (typeof content !== "string") {
      errors.push("Missing content string");
      return { valid: false, errors };
    }
    if (schema.max_chars && content.length > schema.max_chars) {
      errors.push(`Content is ${content.length} chars (max ${schema.max_chars})`);
    }
    if (schema.min_chars && content.length < schema.min_chars) {
      errors.push(`Content is ${content.length} chars (min ${schema.min_chars})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function toTipTapContent(
  parsed: Record<string, unknown>,
  componentType: string
) {
  const schema = COMPONENT_TYPES[componentType];

  if (isMultiItem(schema)) {
    const data = parsed as { content: { items: Record<string, string>[] } };
    return {
      items: data.content.items.map((item) => {
        const result: Record<string, unknown> = {};
        for (const field of Object.keys(item)) {
          result[field] = textToDoc(item[field]);
        }
        return result;
      }),
    };
  }

  const data = parsed as { content: string };
  return textToDoc(data.content);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { component_type, voice_profile, business_name, source_content, turnstile_token } = body;

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

  if (!component_type || !COMPONENT_TYPE_KEYS.includes(component_type)) {
    return NextResponse.json(
      { error: "Invalid component type" },
      { status: 400 }
    );
  }

  if (!voice_profile || !business_name) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const constraintInstructions = buildConstraintInstructions(component_type);
  const jsonSchema = buildJsonSchema(component_type);

  // Check for existing copy to improve
  let existingCopyBlock = "";
  if (source_content?.identified_components) {
    const existing = (
      source_content.identified_components as Array<{
        type: string;
        existing_copy: string;
        quality: string;
        notes: string;
      }>
    ).find((c) => c.type === component_type);

    if (existing) {
      existingCopyBlock = `
EXISTING COPY TO IMPROVE (rewrite this — preserve what works, fix what doesn't):
${existing.existing_copy}
Quality assessment: ${existing.quality}
Issues: ${existing.notes}`;
    }
  }

  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const retryContext =
      attempt > 0
        ? `\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${lastErrors.join("; ")}. Fix these issues.`
        : "";

    try {
      const result = await prompt(
        `You are a professional copywriter generating website content for ${business_name}. Respond with ONLY valid JSON, no preamble or markdown fences.`,
        `VOICE PROFILE:
${voice_profile}
${existingCopyBlock}
TASK: Generate a "${component_type}" component.

CONSTRAINTS:
${constraintInstructions}

Respond with ONLY valid JSON matching this exact structure:
{
  "content": ${jsonSchema},
  "notes": {
    "reasoning": "Brief explanation of your copywriting choices (1-2 sentences)",
    "suggestions": ["Optional improvement suggestions the user might consider"]
  }
}${retryContext}`,
        2048
      );

      const parsed = parseResponse(result);
      const validation = validateContent(parsed, component_type);

      if (validation.valid || attempt === MAX_RETRIES) {
        const content = toTipTapContent(parsed, component_type);
        const notes = parsed.notes as Record<string, unknown> | undefined;

        const constraintNotes: { type: string; constraint: string }[] =
          validation.errors.map((e) => ({ type: "failed", constraint: e }));

        if (validation.valid) {
          constraintNotes.push({ type: "passed", constraint: "All constraints met" });
        }

        // Increment rate limit and log usage
        await incrementRateLimit(req, rateLimit.userId);
        logUsage({
          userId: rateLimit.userId,
          eventType: "generation",
          componentType: component_type,
        });

        return NextResponse.json({
          content,
          ai_notes: {
            generation_reasoning: notes?.reasoning ?? "",
            constraint_notes: constraintNotes,
            suggestions: notes?.suggestions ?? [],
          },
          validation_passed: validation.valid,
        });
      }

      lastErrors = validation.errors;
    } catch {
      if (attempt === MAX_RETRIES) {
        return NextResponse.json(
          { error: "Generation failed after retries" },
          { status: 500 }
        );
      }
      lastErrors = ["Failed to parse JSON response"];
    }
  }

  return NextResponse.json({ error: "Generation failed" }, { status: 500 });
}
