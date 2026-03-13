# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Copy That** (`copy.bitlore.io`) — a Next.js app that generates website copy for small business clients. Portfolio piece for AI Engineering + lead gen for Bit Lore (web dev studio). Free to use.

Full v1 specification lives in `claude-code-prompt.md`. Read it before building anything.

## Stack

- **Framework:** Next.js (App Router), React, Tailwind CSS
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database & Auth:** Supabase (Postgres + magic link auth + RLS)
- **LLM:** Anthropic Claude API (Sonnet) via `@anthropic-ai/sdk`
- **Editor:** TipTap (ProseMirror-based, MIT)
- **Bot Protection:** Cloudflare Turnstile (invisible mode)
- **Hosting:** Vercel (free tier)

## Build Commands

Once scaffolded with Next.js:

```bash
npm run dev          # local dev server
npm run build        # production build
npm run lint         # ESLint
npm run test         # tests (vitest or jest, TBD)
```

## Architecture

### Version Roadmap

- **v1:** Single copy block — brand context → pick component type → generate → edit → export
- **v2:** Collaborative editor — TipTap tracked changes, AI-proposed diffs
- **v3:** Full site builder — pages, cross-page awareness, structured export

v1 data model and TipTap choice are designed to support v2/v3 without rewrites.

### Data Flow

- **Anonymous users:** all state in browser `sessionStorage`, no database
- **Authenticated users:** Postgres via Supabase
- **On auth:** `sessionStorage` payload migrates to Postgres in a single transaction
- All LLM operations are server-side via API routes

### Component Registry

The core product abstraction. Each component type (hero_headline, value_props, about_body, etc.) has a schema defining character limits, structure requirements, and generation guidance. 11 component types in v1. Content is stored in TipTap JSON format.

### LLM Pipeline (all server-side)

1. **URL content extraction** (optional) — fetch + parse via cheerio
2. **Voice profile extraction** — compact 200-300 word voice summary from brand inputs
3. **Constrained generation** — produce content matching component schema
4. **Validation** — parse JSON, validate against schema, retry on failure (max 2 retries)

### Auth & Security

- Supabase magic link (no passwords)
- RLS on all tables
- Cloudflare Turnstile on generation endpoints
- IP-based rate limiting for anonymous (5-8 generations)
- Per-account rate limiting for authenticated (50/day)
- Character limits on all user inputs + `max_tokens` caps on LLM calls

### Key Tables

`profiles`, `brand_contexts` (multiple per user), `copy_blocks`, `usage_log`

## Environment Variables

```
ANTHROPIC_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY
```
