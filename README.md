# Copy That

AI-powered website copy generator for small businesses. Built as a portfolio piece for AI engineering and lead generation for [Bit Lore](https://bitlore.io), a web development studio in Portland.

**Live at [copy.bitlore.io](https://copy.bitlore.io)**

## What it does

Users describe their business — name, audience, tone, existing website URL — and the app generates website copy: headlines, body copy, CTAs, SEO metadata, social posts, and email content. Generated copy loads into a rich text editor for immediate editing, then exports as plain text, HTML, or markdown.

No signup required. Anonymous users get 6 free generations per day. Magic link auth unlocks 50/day and persistent storage.

## Architecture

This isn't a chat wrapper. The LLM pipeline has four stages:

1. **URL extraction** — Fetches and parses the user's existing site (and optionally a competitor) via Cheerio, strips nav/footer/scripts, extracts voice and messaging patterns
2. **Voice profile** — Condenses brand inputs into a 200-300 word voice summary that seeds every generation
3. **Constrained generation** — Produces copy within category-specific word limits, with per-category guidance baked into the prompt
4. **Validation and retry** — Parses JSON output, validates against constraints, retries up to 2x, returns the closest-to-valid attempt with a warning if constraints can't be met

All LLM calls are server-side. Content is stored in TipTap JSON format to support the v2 tracked-changes editor without a data migration.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, Tailwind CSS 4 |
| Editor | TipTap (ProseMirror) |
| Database & Auth | Supabase (Postgres, magic link, RLS) |
| LLM | Anthropic Claude API (Sonnet) |
| Bot Protection | Cloudflare Turnstile (invisible) |
| Email | Resend (contact form) |
| Hosting | Vercel |

## Engineering decisions

**Soft validation with retry heuristics** — The generation pipeline doesn't reject LLM output that misses word constraints. It tracks the closest-to-valid attempt across up to 2 retries, feeds the specific violation back to the LLM as a correction prompt, and always returns usable copy with an optional warning. Output is never discarded.

**Lazy voice extraction** — Voice profiles aren't generated at brand context setup. They're deferred to first generation via `ensureContext()`. Profiles are cheap to save; LLM calls are expensive. If the user abandons before generating, no tokens are spent.

**Transitive RLS** — Copy blocks don't denormalize `user_id`. The row-level security policy checks ownership transitively through brand contexts: `brand_context_id IN (SELECT id FROM brand_contexts WHERE user_id = auth.uid())`. Cleaner schema, naturally extends to v3's deeper hierarchy without policy rewrites.

**Document identity without a documents table** — "Documents" are a UI grouping pattern (`component_type::user_prompt`), not a schema entity. Regenerating the same prompt creates a version; changing the prompt starts a new document. Version history works without a dedicated table, and extends to v2 diffs without migration.

**Atomic session migration with UUID remapping** — Anonymous state uses client-generated UUIDs in `sessionStorage`. On magic link auth, the entire session migrates to Postgres in one transaction, remapping client UUIDs to server-generated IDs and updating all foreign key references. Re-authentication is idempotent — if server data already exists, migration is skipped.

**User-editable constraints** — Word limits aren't rigid per category. Categories set defaults; users can override per block before generating. The override persists across regenerations. Constraints are guidelines, not walls.

## Development

Requires API keys for Anthropic, Supabase, Cloudflare Turnstile, and Resend. See `CLAUDE.md` for the full environment variable list.

```bash
npm install
npm run dev
```

## Roadmap

- **v1** (current) — Single copy block: brand context, generate, edit, export
- **v2** — TipTap tracked changes, AI-proposed diffs, inline annotations
- **v3** — Multi-page site builder, cross-page awareness, structured export

## License

[AGPL-3.0](LICENSE)
