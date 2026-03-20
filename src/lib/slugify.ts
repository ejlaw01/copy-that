/**
 * Converts text to a URL-friendly slug.
 * Lowercase, non-alphanumeric → hyphens, collapsed, trimmed.
 * Truncates to `maxLen` on a word boundary (hyphen-delimited).
 */
export function slugify(text: string, maxLen = 40): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) return "";
  if (slug.length <= maxLen) return slug;

  // Truncate on a hyphen boundary so we don't cut mid-word
  const truncated = slug.slice(0, maxLen);
  const lastHyphen = truncated.lastIndexOf("-");
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}

/**
 * Returns a slug guaranteed unique within `existing`.
 * Appends `-2`, `-3`, etc. if the base slug is taken.
 */
export function uniqueSlug(base: string, existing: string[]): string {
  if (!base) return "";
  if (!existing.includes(base)) return base;

  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
