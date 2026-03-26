/**
 * Parse JSON from an LLM response, stripping markdown code fences if present.
 * Claude sometimes wraps JSON output in ```json ... ``` blocks even when
 * instructed not to — this normalizes that before parsing.
 */
export function parseJson(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
  return JSON.parse(cleaned);
}
