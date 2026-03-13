import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { prompt, ServiceUnavailableError } from "@/lib/anthropic";

const MAX_BODY_SIZE = 1_000_000; // 1MB
const FETCH_TIMEOUT = 10_000; // 10s

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CopyThat/1.0 (content extraction)" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      throw new Error("Response too large");
    }

    const text = await res.text();
    return text.slice(0, MAX_BODY_SIZE);
  } finally {
    clearTimeout(timeout);
  }
}

function extractText(html: string): string {
  const $ = cheerio.load(html);
  $("nav, footer, header, script, style, noscript, iframe, svg").remove();
  $('[class*="nav"], [class*="footer"], [class*="cookie"], [class*="banner"]').remove();

  const text = $("body").text();
  // Collapse whitespace
  return text.replace(/\s+/g, " ").trim().slice(0, 5000);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, type } = body;

  if (!url || !isValidUrl(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (type !== "source" && type !== "competitor") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  let html: string;
  try {
    html = await fetchPage(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch URL";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const extractedText = extractText(html);

  if (!extractedText || extractedText.length < 50) {
    return NextResponse.json(
      { error: "Could not extract meaningful content" },
      { status: 422 }
    );
  }

  try {
    if (type === "source") {
      const result = await prompt(
        "You are analyzing an existing website's content. Respond with valid JSON only, no preamble.",
        `Given the following extracted text from a web page, identify the content that maps to these component types: hero_headline, hero_subheadline, value_props, about_body, service_description, cta.

For each component you identify, extract the existing copy and note its approximate quality (strong/adequate/weak) and any issues (too long, too vague, off-brand, etc.).

Extracted text:
${extractedText}

Respond with JSON:
{
  "identified_components": [
    { "type": "hero_headline", "existing_copy": "...", "quality": "weak", "notes": "..." }
  ],
  "overall_voice": "Brief description of the current site's voice and tone",
  "suggested_improvements": "2-3 sentence summary of what the copy most needs"
}`,
        2048
      );

      const parsed = parseJson(result);
      return NextResponse.json(parsed);
    } else {
      const analysis = await prompt(
        "You are analyzing a competitor website's copy for voice and messaging patterns. Return ONLY the analysis, no preamble.",
        `Based on the following extracted text, provide a concise analysis (150-200 words) covering:
- Tone and register
- How they position themselves
- Key messaging patterns
- Effective techniques worth adopting
- Weaknesses or gaps to differentiate against

Extracted text:
${extractedText}`,
        1024
      );

      return NextResponse.json({ analysis });
    }
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

function parseJson(text: string): Record<string, unknown> {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
  return JSON.parse(cleaned);
}
