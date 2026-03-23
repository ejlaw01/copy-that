# Claude Code Prompt: Copy That (copy.bitlore.io)

## Project Overview

Build **Copy That**, a Next.js application that generates website copy for small business clients. This is a portfolio piece for an AI Engineering role — it needs to demonstrate real LLM orchestration, not just be a chat wrapper.

Copy That lives at `copy.bitlore.io` and is free to use. It exists to:

1. Demonstrate AI engineering skills (LLM orchestration, context management, structured output, streaming)
2. Generate leads for Bit Lore, a custom web development studio
3. Be genuinely useful for small businesses generating site content

### Version Roadmap

- **v1: Single Copy Block** — Brand context setup → pick a component type → generate → edit in rich text editor → copy/export. One piece of copy at a time. Ship fast, get users, prove the concept.
- **v2: Collaborative Editor** — TipTap tracked changes, AI-proposed diffs, inline annotations, notes panel. Upgrade the single-block experience from "generate and manually edit" to "AI proposes changes and I accept/reject inline." The "writing partner" experience.
- **v3: Full Site Builder** — Pages, component-per-page structure, cross-page awareness, structured export (JSON/HTML/markdown), project persistence. The "generate your whole site" experience.

**This prompt specs v1 fully, with architectural decisions that enable v2 and v3 without rewrites.**

---

## Stack

- **Framework:** Next.js (App Router)
- **Frontend:** React, Tailwind CSS
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database & Auth:** Supabase (Postgres + built-in magic link auth + row-level security)
- **LLM:** Anthropic Claude API (Sonnet) via `@anthropic-ai/sdk`
- **Editor:** TipTap (rich text editing via ProseMirror, MIT open source)
- **Bot Protection:** Cloudflare Turnstile (invisible mode)
- **Hosting:** Vercel (free tier)

---

## v1 User Flow

### The Funnel

No signup wall. Users start generating immediately and are prompted to save only after they've invested effort.

1. **Anonymous session:** User lands on site, fills in brand context, generates copy. All data lives in `sessionStorage`. Protected by Cloudflare Turnstile and IP-based rate limiting.
2. **Low anonymous limit:** Anonymous users get 5–8 generation calls. Enough to set up brand context and generate a few pieces of copy — enough to experience real value.
3. **Email capture trigger:** When an anonymous user hits the generation limit, OR enters input and attempts to navigate away, prompt them to enter their email to save progress and unlock more generations. Frame this as saving their work, not a paywall. Users with multiple brand contexts have invested more effort and have more to lose — stronger trigger.
4. **Magic link verification:** User enters email → Supabase sends magic link automatically → user clicks it → Supabase creates/authenticates user → client detects auth state change → `sessionStorage` data migrates to Postgres → more generations unlocked.
5. **Authenticated usage:** Per-account rate limiting. Generous — enough to generate dozens of copy blocks across sessions.
6. **Soft limit message:** At some reasonable ceiling, show a friendly message: *"This tool is a free project by Bit Lore, a custom web development studio in Portland. If you're finding this useful, or if you need help building the site this content is going to live on, I'd love to hear from you."* Include a mailto link and a simple contact form.

### Email Capture UI

The save prompt includes:
- Email input field
- A visible checkbox: **"Keep me posted on new features"** — checked by default. Must be visible and clearly labeled for GDPR/CAN-SPAM compliance.
- A plain-language privacy note: **"I will never sell your personal information. Your email is used to save your project and, if you opt in, to hear about updates. That's it."** Link to `/privacy` for the full policy.

### Important Notes on `beforeunload`

The `beforeunload` event is unreliable on mobile browsers. Don't rely on it as the sole email capture trigger. Also surface the save prompt:
- After the first successful content generation
- After 5 minutes of active use
- As a subtle persistent UI element (e.g., "unsaved — session only" indicator)

---

## v1 Data Model

### Entities

**User**
- Managed by Supabase Auth (`auth.users` table). No custom user table needed.
- Supabase provides `id` (uuid), `email`, `created_at` automatically.
- Create a `profiles` table linked via `id` foreign key to `auth.users`:
  - `id` (uuid, primary key, references auth.users)
  - `last_active_at` (timestamp)
  - `marketing_consent` (boolean, default true)
  - `marketing_consent_date` (timestamp — when they opted in, for GDPR/CAN-SPAM compliance)
  - `generation_count_today` (integer, default 0 — for daily rate limiting. Reset on first request of a new day: store a `generation_count_date` field, and if it doesn't match today's date, reset the count to 0 and update the date. This avoids needing a cron job.)
  - `total_generations` (integer, default 0 — lifetime count for analytics)

**Usage Log** (for analytics and rate limiting)
- `id` (uuid, primary key)
- `user_id` (foreign key, nullable — null for anonymous)
- `session_id` (text — anonymous session identifier for pre-auth tracking)
- `event_type` (enum: generation, voice_extraction, url_extraction, export, auth)
- `component_type` (text, nullable — which component was generated)
- `tokens_in` (integer, nullable — input tokens used)
- `tokens_out` (integer, nullable — output tokens used)
- `created_at` (timestamp)

**Brand Context** (multiple per user — each represents a distinct brand voice)
- `id` (uuid, primary key)
- `user_id` (foreign key, nullable for anonymous migration)
- `name` (text — user-facing label, e.g., "Bit Lore", "Rioja Wine", "Personal")
- `is_default` (boolean, default false — the last-used context loads automatically. Enforce single-default in application logic: when setting one context as default, unset all others for that user.)
- `business_name`
- `business_description`
- `audience`
- `tone` (e.g., "professional but warm", "casual and playful")
- `tone_examples` (text — sample copy they like)
- `competitors` (text — sites they admire)
- `source_url` (text, nullable — URL of user's existing site for copy extraction)
- `source_content` (jsonb, nullable — extracted and structured content from source_url)
- `competitor_url` (text, nullable — URL of a competitor/inspiration site)
- `competitor_analysis` (text, nullable — LLM-extracted voice and messaging analysis from competitor)
- `voice_profile` (text — LLM-extracted compact voice summary, ~200–300 tokens)
- `created_at`
- `updated_at`

**Copy Block** (individual generated copy pieces — the core v1 unit)
- `id` (uuid, primary key)
- `brand_context_id` (foreign key)
- `component_type` (string — references the component type registry)
- `content` (jsonb — TipTap-compatible document format)
- `ai_notes` (jsonb, nullable — AI reasoning, suggestions, and constraint feedback)
- `version` (integer)
- `created_at`
- `updated_at`

### sessionStorage Structure (Anonymous Users)

```json
{
  "brand_contexts": [
    {
      "id": "local-uuid-1",
      "name": "Bit Lore",
      "business_name": "...",
      "business_description": "...",
      "audience": "...",
      "tone": "...",
      "tone_examples": "...",
      "competitors": "...",
      "source_url": "https://example.com",
      "source_content": { ... },
      "competitor_url": "https://competitor.com",
      "competitor_analysis": "...",
      "voice_profile": "..."
    }
  ],
  "active_context_id": "local-uuid-1",
  "copy_blocks": [
    {
      "id": "local-uuid",
      "brand_context_id": "local-uuid-1",
      "component_type": "hero_headline",
      "content": { "type": "doc", "content": [...] },
      "ai_notes": { ... },
      "version": 1
    }
  ],
  "generation_count": 3
}
```

When the user authenticates, POST the entire payload to `POST /api/migrate` which creates all records in Postgres in a single transaction.

### How v1 Data Model Evolves

v2 (collaborative editor) adds no new tables — it enhances the interaction with existing `copy_block` records by adding tracked changes and a notes panel UI. The `ai_notes` field already exists from v1.

v3 (site builder) adds structural expansion: `brand_context` renames to `project` (each brand context becomes a project), a new `page` table is added, and `copy_block` gains a `page_id` foreign key. v1/v2 blocks without a `page_id` still work (backwards compatible). The multi-brand-context support from v1 naturally becomes multi-project support in v3.

---

## Content Category System

Instead of rigid per-section component types (hero_headline, team_bio, etc.), the tool uses flexible **content categories** organized around writing tasks. The user's prompt communicates the specific context (e.g., "Write an about section for my landscaping business") while the category sets constraints and editor behavior. This covers more use cases — the same "Headline" category works for hero banners, email subject lines, sidebar headers, etc.

Categories with `singleLine: true` suppress Enter in the TipTap editor, disable block-level nodes (lists, blockquotes, headings), and hide the formatting toolbar — appropriate for short-form copy where line breaks don't make sense.

### Content Category Registry

```typescript
interface ContentCategory {
  label: string;
  guidance: string;
  default_max_words?: number;
  default_min_words?: number;
  singleLine?: boolean;
}

const CONTENT_CATEGORIES: Record<string, ContentCategory> = {

  general: {
    label: 'General',
    guidance: 'Flexible copy for any purpose. Follow the user\'s prompt closely.'
  },

  headline: {
    label: 'Headline',
    guidance: 'Short, punchy, attention-grabbing. Typically under 80 characters. Clear benefit or hook.',
    default_max_words: 13,
    singleLine: true
  },

  body_copy: {
    label: 'Body Copy',
    guidance: 'Longer-form website copy: about sections, service descriptions, landing page blocks. Authentic and readable.',
    default_max_words: 250,
    default_min_words: 30
  },

  email: {
    label: 'Email',
    guidance: 'Email content: subject lines, body copy, CTAs. Conversational, scannable, action-oriented.',
    default_max_words: 170
  },

  social: {
    label: 'Social Media',
    guidance: 'Social media posts and captions. Platform-aware, engaging, concise. Include hooks and calls to action where appropriate.',
    default_max_words: 50
  },

  seo: {
    label: 'SEO',
    guidance: 'Search-optimized content: meta titles, descriptions, alt text. Natural keyword integration, compelling click-through copy.',
    default_max_words: 27,
    default_min_words: 5,
    singleLine: true
  },

  cta: {
    label: 'Call to Action',
    guidance: 'Conversion-focused copy: button text, banner headlines, urgency messaging. Action verbs, clear value proposition.',
    default_max_words: 25,
    singleLine: true
  }
};
```

Word limits are user-editable per block (category defaults are starting points). Constraints are enforced in the generation pipeline with a retry loop (max 2 retries), and the closest-to-valid attempt is returned with a warning if retries are exhausted.

Structured multi-item output (e.g., 3 value props with heading + body pairs) is deferred to v3 alongside structured export to CMS/page builders. In v1, users get multi-item results as formatted text within a single block — the prompt handles the structure.

---

## Content Format & Editor

**Store content in TipTap JSON document format. Use TipTap as the editor in v1.** A TipTap editor is a better textarea: proper cursor behavior, undo/redo, live character count, and the user can edit AI output immediately in a real rich text environment.

### Content Storage Format

All content is stored as TipTap JSON documents:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Your headline goes here" }
      ]
    }
  ]
}
```

### Data Flow

1. LLM returns plain text strings inside a JSON response (keep the LLM's job simple — produce good copy, not markup)
2. API layer wraps the plain text in TipTap document structure before storing
3. Stored as JSON in Postgres `content` jsonb field (or sessionStorage for anonymous users)
4. TipTap editor reads the JSON directly via `editor.commands.setContent(json)`
5. User edits in the rich text editor
6. Changes saved back as JSON via `editor.getJSON()` (debounced)
7. On export, convert to HTML via `editor.getHTML()` or extract plain text for copy-paste

### TipTap Editor Setup

Install `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-character-count`. Create one reusable `ComponentEditor` React component:

```typescript
interface ComponentEditorProps {
  content: TipTapDoc          // JSON from database/sessionStorage
  maxChars?: number           // From component type constraint
  minChars?: number
  onChange: (json: TipTapDoc) => void  // Debounced save
  singleLine?: boolean        // For headlines — suppress Enter key
}
```

Configuration:
- `immediatelyRender: false` (required for Next.js SSR)
- StarterKit with minimal features — disable most block-level nodes for single-line components, allow paragraphs and basic marks (bold, italic) for longer content
- CharacterCount extension configured with the component's max_chars limit
- Show current/max character count beneath the editor, with color indicators (green under limit, yellow approaching, red over)
- No toolbar for single-line components. Minimal toolbar (bold, italic) for paragraph components. Keep it clean.
- Style the editor to match your design system

### HTML Source View Toggle

Add a small toggle that switches between the rich text TipTap view and a raw HTML source view. The source view shows `editor.getHTML()` in a monospace textarea. Edits in the HTML view parse back via `editor.commands.setContent(htmlString)`. Stored format stays JSON regardless.

Power-user feature — most users never touch it, but a developer pasting copy into a CMS template will appreciate it.

### AI Notes Structure

The `ai_notes` field stores the AI's reasoning and suggestions separately from the content.

```json
{
  "generation_reasoning": "Led with benefit over feature because the voice profile emphasizes customer-first language. Kept under 60 chars (currently 54).",
  "constraint_notes": [
    { "type": "passed", "constraint": "max_chars", "value": 54, "limit": 60 }
  ],
  "suggestions": [
    { "text": "Consider testing a question-format headline for higher engagement", "priority": "low" }
  ]
}
```

In v1, show `generation_reasoning` as a collapsible "Why this copy?" below the editor. Show `constraint_notes` as the character count indicators. Store `suggestions` but surface them minimally — a tooltip or expandable section. The full notes panel is v2.

---

## LLM Orchestration Pipeline

### Step 0: URL Content Extraction (Optional)

If the user provides a URL during brand context setup, extract and analyze the content before voice profile generation. Runs server-side.

**For the user's existing site (`source_url`):**

1. Fetch the URL server-side via `fetch()` in a Next.js API route
2. Parse the HTML with `cheerio` — strip `<nav>`, `<footer>`, `<header>`, `<script>`, `<style>`, and common boilerplate selectors
3. Extract the remaining text content, preserving structural hints
4. Pass the extracted text to the LLM to identify and map to component types:

```
You are analyzing an existing website's content. Given the following extracted text from a web page, identify the content that maps to these component types: hero_headline, hero_subheadline, value_props, about_body, service_description, cta.

For each component you identify, extract the existing copy and note its approximate quality (strong/adequate/weak) and any issues (too long, too vague, off-brand, etc.).

Extracted text:
{extracted_text}

Respond with JSON:
{
  "identified_components": [
    { "type": "hero_headline", "existing_copy": "...", "quality": "weak", "notes": "Generic, doesn't communicate specific value" }
  ],
  "overall_voice": "Brief description of the current site's voice and tone",
  "suggested_improvements": "2-3 sentence summary of what the copy most needs"
}
```

5. Store in `source_content`. This pre-populates the component type dropdown with suggestions ("Your current hero headline could be stronger — want to regenerate it?") and feeds into voice profile extraction.

**For competitor/inspiration URLs (`competitor_url`):**

1. Same fetch + cheerio extraction
2. Pass to the LLM for voice and messaging analysis only:

```
You are analyzing a competitor website's copy for voice and messaging patterns. Based on the following extracted text, provide a concise analysis (150-200 words) covering:
- Tone and register
- How they position themselves
- Key messaging patterns
- Effective techniques worth adopting
- Weaknesses or gaps to differentiate against

Extracted text:
{extracted_text}

Return ONLY the analysis, no preamble.
```

3. Store in `competitor_analysis`. Fed into voice profile extraction.

**Technical notes:**
- Use `cheerio` for HTML parsing — lightweight, serverless-friendly
- Set a 5-10 second timeout and 1MB max response size
- Handle failures gracefully — don't block the setup flow on a failed extraction
- Single-page only for v1. No link following, no sitemap parsing.
- **IMPORTANT: Vercel's network egress may restrict fetching arbitrary external URLs.** Check your Vercel project's network configuration — if outbound requests are limited to an allowlist, you'll need to either add a wildcard/open policy for the extraction routes, use a separate serverless function outside Vercel's restrictions, or defer URL extraction to a client-side approach (less ideal). Test this early in development.

### Step 1: Voice Extraction

On brand context setup completion, extract a compact voice profile from all inputs.

```
You are a brand voice analyst. Based on the following brand information, extract a compact voice profile (200-300 words max) that captures:
- Tone and register (formal/casual/playful/authoritative/etc.)
- Vocabulary level and preferred terminology
- Sentence rhythm (short and punchy vs. flowing vs. mixed)
- Key phrases or concepts that should recur
- What to avoid (jargon, clichés, competitor language)

Brand information:
- Business: {business_name} — {business_description}
- Audience: {audience}
- Desired tone: {tone}
- Copy they like: {tone_examples}
- Competitors/inspiration: {competitors}
{if source_content}
- Existing website voice analysis: {source_content.overall_voice}
- Suggested improvements to existing copy: {source_content.suggested_improvements}
{/if}
{if competitor_analysis}
- Competitor voice analysis: {competitor_analysis}
{/if}

Return ONLY the voice profile, no preamble.
```

### Step 2: Constrained Generation

In v1, there's no cross-page context (that's v3). The generation prompt is simpler:

```
You are a professional copywriter generating website content for {business_name}.

VOICE PROFILE:
{voice_profile}

{if existing_copy_for_component}
EXISTING COPY TO IMPROVE (rewrite this — preserve what works, fix what doesn't):
{existing_copy}
Quality assessment: {quality_rating}
Issues: {quality_notes}
{/if}

TASK: Generate a "{component_type}" component.

CONSTRAINTS:
{component_schema_as_instructions}

Respond with ONLY valid JSON matching this exact structure:
{
  "content": {json_schema},
  "notes": {
    "reasoning": "Brief explanation of your copywriting choices (1-2 sentences)",
    "suggestions": ["Optional improvement suggestions the user might consider"]
  }
}

Do not include any text outside the JSON object.
```

### Step 3: Validation & Retry

1. Parse JSON (handle markdown code fences the LLM might wrap it in)
2. Validate against component schema: character counts, required fields, correct structure
3. If validation fails, retry with a more explicit prompt referencing the specific failure
4. Cap retries at 2. On final failure, return the best attempt with a UI flag noting which constraints weren't met.

---

## Streaming

For v1: show a loading state in the editor while generating, then populate on completion. Structured JSON output makes mid-stream rendering impractical. Add streaming as a v3 feature for longer-form components in the site builder.

---

## v1 Frontend Architecture

### Views

**1. Landing / Brand Context Setup**

A clean, stepped form (3-4 steps):
- Step 1: Name this voice (e.g., "Bit Lore", "Personal", "Client — Rioja Wine") + Business name + what you do (short description)
- Step 2: Who's your audience? + Desired tone (with examples, not just a dropdown)
- Step 3: Optional URLs — "Do you have an existing website?" + "Any website whose voice you admire?" Also: paste a paragraph of writing you like as a fallback.
- Step 4: Review extracted insights (if URLs provided) + generate voice profile

Design should feel like a design tool onboarding, not a form. Minimal, generous whitespace, one question per view. Progress indicator.

**2. Generation Workspace**

The core v1 view. Simple layout:
- **Brand context switcher** — dropdown or tab bar at the top showing saved brand contexts by name (e.g., "Bit Lore", "Rioja Wine", "Personal"), with the active one highlighted and a "+ New Voice" option that opens the brand context setup flow. Switching contexts reloads the voice profile for all subsequent generations. Previously generated copy blocks stay associated with the context they were created under.
- **Component type selector** — dropdown or card grid showing available component types (hero headline, about body, value props, etc.). If URL extraction identified existing components, flag them: "Your current hero headline is weak — regenerate?"
- **TipTap editor** — the `ComponentEditor` instance for the selected component type. Empty state shows a "Generate" button. After generation, shows editable content with character count, regenerate button, HTML source toggle, and "Why this copy?" collapsible.
- **History sidebar or list** — previously generated copy blocks for the active brand context, clickable to reload into the editor. Each shows component type and a preview of the content.
- **Export options** — copy to clipboard (plain text or HTML), download as markdown.

This is a single-screen experience. No pages, no sidebar navigation, no site builder. Just: pick a component type, generate, edit, copy.

**3. Privacy Page** (`/privacy`)

Plain-language privacy policy in first person. Covers:
- What's collected (email, brand context, generated content, anonymous usage analytics)
- What's NOT collected (no tracking cookies, no third-party analytics, no data selling)
- LLM usage (content sent to Anthropic API, which doesn't train on API data — link to their policy)
- Data retention (persists while account exists, delete by emailing you)
- Marketing emails (opt-in only, unsubscribe anytime)
- Contact info

Tone: *"This is a one-person project. I built it, I run it, and I take your privacy seriously."*

### UI Notes

- Portfolio piece — design quality matters as much as engineering. Should feel crafted, not generic.
- Subtle animations for state transitions (generating, content appearing).
- Bit Lore brand present but not overwhelming. Small logo, consistent with bitlore.io aesthetic.
- Pick one mode (dark or light) and do it well.

---

## Auth & Security

### Supabase Magic Link Flow

1. User enters email in the save prompt (with marketing consent checkbox and privacy note)
2. Client calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })` — the `emailRedirectTo` is important: it ensures the magic link redirects back to the correct environment (localhost in dev, copy.bitlore.io in production). Also configure the redirect URL in the Supabase dashboard under Auth > URL Configuration.
3. User clicks link → Supabase verifies and creates/authenticates user
4. Client listens via `supabase.auth.onAuthStateChange()` → detects `SIGNED_IN`
5. On auth, create the user's `profiles` row with `marketing_consent` and `marketing_consent_date`. **Recommended:** set up a Supabase database trigger on `auth.users` INSERT that auto-creates a `profiles` row with default values. This avoids race conditions where the app tries to read a profile before it's been created. The marketing consent fields can then be updated in a follow-up call after the UI captures the checkbox state.
6. Migrate sessionStorage data to Postgres via `POST /api/migrate`
7. All subsequent API requests include the Supabase session token

Users can change marketing consent later via a settings page or unsubscribe link.

### Supabase Client Setup

```typescript
// lib/supabase/client.ts (browser)
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// lib/supabase/server.ts (API routes)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )
}
```

### Row-Level Security (RLS)

```sql
-- Brand contexts: users can only CRUD their own
ALTER TABLE brand_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own brand contexts"
  ON brand_contexts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Copy blocks: users can access blocks belonging to their brand contexts
ALTER TABLE copy_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own copy blocks"
  ON copy_blocks FOR ALL
  USING (brand_context_id IN (SELECT id FROM brand_contexts WHERE user_id = auth.uid()))
  WITH CHECK (brand_context_id IN (SELECT id FROM brand_contexts WHERE user_id = auth.uid()));

-- Profiles: users can only read/update their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile"
  ON profiles FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Usage log: authenticated users can insert their own logs.
-- Anonymous usage logging should go through a server-side API route using
-- the SUPABASE_SERVICE_ROLE_KEY to bypass RLS (since anonymous users have
-- no auth.uid()). Admin reads all logs via service role key.
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert own usage logs"
  ON usage_log FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

### Cloudflare Turnstile

- Register in Cloudflare dashboard (standalone, no Cloudflare DNS needed)
- Embed invisible widget on frontend
- All `/api/generate/*` routes validate the Turnstile token server-side via `https://challenges.cloudflare.com/turnstile/v0/siteverify`

### Rate Limiting

- **Anonymous users:** 5–8 generation calls, tracked server-side via IP fingerprint (not client-side `generation_count` in sessionStorage, which users could reset by closing the tab). The `generation_count` in sessionStorage is for UI display only — the server is the source of truth for enforcement.
- **Authenticated users:** 50 generation calls per day, tracked per account in Postgres
- **API route protection:** All generation routes require either a valid Turnstile token (anonymous) or a valid Supabase session (authenticated)

### Security Checklist

**Input validation on all API routes.** Every route that accepts user input (brand context fields, component type selection, URLs) must validate before processing. Validate `category` against `CATEGORY_KEYS` — don't pass arbitrary strings into LLM prompts. Set character limits on all brand context text fields (business_description, tone, audience, tone_examples, competitors) to prevent token-wasting abuse.

**Prompt injection via brand context.** Users type free text that gets injected into LLM prompts. Someone could enter adversarial instructions as their business description. For this use case the worst outcome is weird copy and wasted API credits, not a data breach. Mitigation: character limits on inputs, `max_tokens` set on every Anthropic API call to cap runaway responses, and validation/retry logic that caps at 2 retries.

**URL extraction is the biggest attack surface.** When fetching user-provided URLs server-side:
- Validate URL scheme is `https` or `http` only — reject `file://`, `ftp://`, and other schemes
- Don't follow redirects to internal/private IPs (e.g., `169.254.169.254` for cloud metadata endpoints — Vercel likely blocks this but verify)
- Set strict timeout (5-10 seconds) and cap response size (1MB) before parsing
- Rate limit the extraction endpoint more aggressively than generation — it's heavier and more abusable

**Supabase anon key is public by design.** The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is visible in client-side JavaScript. RLS policies are what protect data. Ensure every table has RLS enabled — a table without RLS is wide open to anyone with the anon key.

**Service role key must never leak.** `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS. Never prefix with `NEXT_PUBLIC_`, never commit to git, never log in error messages. Use only in server-side API routes for anonymous usage logging, admin dashboard queries, and data migration.

**CORS.** Next.js API routes on Vercel default to same-origin. Verify no route accidentally sets `Access-Control-Allow-Origin: *`, especially routes using the service role key.

**Anthropic spend cap.** Set a hard monthly budget limit in the Anthropic dashboard before deploying. This is the final backstop if rate limiting is bypassed. $50-100 during development, adjust based on real usage.

---

## Analytics & Admin Dashboard

Log every generation call to `usage_log` with event type, component type, and token counts.

Build a protected page at `copy.bitlore.io/admin` (your email only). Shows:
- Today / this week / this month: total generations, unique users, new signups
- Cost tracking: total tokens consumed → estimated Anthropic spend
- Signup funnel: anonymous sessions → email captures → verified accounts
- Marketing consent count
- Top component types generated

For v1, just numbers in a clean layout. No charting library needed.

---

## Environment Variables

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

---

## v1 Build Priority

### Week 1: Foundation & Generation

**Priority order if time runs short:** Get the core loop working first (brand context setup → generate one component → edit in TipTap → copy to clipboard). URL extraction and LLM analysis routes can slip to Week 2 without blocking the demo.

- [ ] Next.js project scaffolding with App Router
- [ ] Component type registry and schema system
- [ ] TipTap editor — install packages, create `ComponentEditor` with character count, single-line mode, HTML source toggle
- [ ] Plain text → TipTap JSON wrapping utility
- [ ] Brand context setup flow UI (3-4 step form, including URL inputs)
- [ ] URL content extraction API route (`POST /api/extract`) — fetch, parse with cheerio, strip boilerplate
- [ ] LLM analysis routes — existing site component mapping + competitor voice analysis
- [ ] Voice profile extraction API route + Anthropic SDK integration
- [ ] Generation API route with constraint enforcement and validation
- [ ] Generation workspace UI — brand context switcher, component type picker, editor, generate/regenerate, "Why this copy?" display
- [ ] sessionStorage service layer
- [ ] Copy block history list
- [ ] Export: copy to clipboard (plain text + HTML)

### Week 2: Persistence, Auth & Polish
- [ ] Supabase project setup (Postgres schema, RLS policies, magic link auth config)
- [ ] Supabase client setup (browser + server with `@supabase/ssr`)
- [ ] Auth state listener + save prompt UI triggers
- [ ] Email capture form with marketing consent checkbox and privacy note
- [ ] sessionStorage → Postgres migration endpoint
- [ ] Cloudflare Turnstile integration
- [ ] Rate limiting (anonymous + authenticated)
- [ ] Usage logging on all generation routes
- [ ] Admin dashboard at `/admin`
- [ ] Soft limit message with Bit Lore lead capture
- [ ] Privacy page at `/privacy`
- [ ] UI polish — animations, responsive design, loading/error states
- [ ] Deploy to Vercel, configure `copy.bitlore.io` subdomain
- [ ] Test full user flow end-to-end

### Week 3 (Post-Launch Hardening)
- [ ] Enable pgvector in Supabase, create `brand_embeddings` table
- [ ] Embedding generation at brand context creation time (chunk tone_examples, source_content, competitor_analysis)
- [ ] Similarity search retrieval step before generation — dynamic voice context per component type
- [ ] Eval harness: fixtures (5-10 brand contexts × component types), runner script, LLM-as-judge scoring
- [ ] Baseline eval run against current prompts, store results
- [ ] Optional: review agent (second LLM call post-generation for voice/constraint check)

---

## v2 Scope: Collaborative Editor

The upgrade that transforms the tool from a generation tool into a writing partner. This builds directly on the v1 single-block experience — same data model, same `copy_block` table, just richer interaction with each block.

### Core Concept

Upgrade the v1 generate/regenerate pattern to a split-view collaborative editor. Left panel is the TipTap editor (already in place from v1) where both user and AI edit the same document. Right panel is a notes/conversation panel.

### Editor (Left Panel)

- Same TipTap instance from v1 — no editor swap, just feature additions
- AI edits appear as tracked changes (custom ProseMirror plugin): added text highlighted green, removed text red
- User accepts or rejects individual changes
- Character count and constraint indicators at the editor edge

### Notes Panel (Right Panel)

- Displays `ai_notes` data (already stored since v1)
- Notes pinned to specific text ranges via ProseMirror decorations
- User types feedback: "make this warmer", "too formal", "three alternatives for this line"
- AI responds with inline suggestions, one-click accept into the editor
- Resolved notes dismissed to keep panel clean

### AI Interaction Model Shift (Agent Architecture)

v1 is a pipeline: generate → validate → retry. v2 introduces a genuine agent pattern where the AI decides what action to take based on user feedback.

- "Make this warmer" → `rewrite_section` tool (modify tone, preserve structure)
- "Too long" → `trim_to_constraint` tool (condense, preserve meaning)
- "Give me three alternatives" → `generate_alternatives` tool (produce variations)
- "This doesn't match our voice" → `retrieve_voice_context` tool (pull fresh brand examples via RAG) → then rewrite

Implementation uses Anthropic's tool-use API. The agent receives current document content + user feedback, decides which tools to call, executes them, and returns a structured diff applied as tracked changes in TipTap. See the "Agents" section in the AI Engineering Addendum for the full tool definitions.

### Why v2 Before the Site Builder

The collaborative editor is what makes the tool *feel* different from everything else. It's the technically impressive feature (custom ProseMirror plugins, structured diffs) that gets attention in a portfolio. And it builds naturally on v1's single-block experience without requiring new data tables or a new UI paradigm. The site builder is structural expansion — more useful, but less exciting to demo and less technically differentiated.

---

## v3 Scope: Full Site Builder

Expands the tool from individual copy blocks to full website content generation. Builds on top of whatever the editing experience is at that point (v2 collaborative editor).

### New Data

- **Project** — rename `brand_context` to `project`, add fields for site-level settings. Each v1/v2 brand context naturally becomes a project — users who set up multiple brand voices already have multiple projects.
- **Page** — new table: `id`, `project_id`, `page_type` (home, about, services, contact, faq), `page_digest`, `sort_order`
- **Copy blocks get a `page_id`** — foreign key linking each block to a page. v1/v2 blocks without a page_id still work (backwards compatible)

### Default Components Per Page Type

```typescript
const PAGE_DEFAULTS: Record<string, string[]> = {
  home: ['hero_headline', 'hero_subheadline', 'value_props', 'cta', 'meta_title', 'meta_description', 'og_description'],
  about: ['about_body', 'team_bio', 'cta', 'meta_title', 'meta_description', 'og_description'],
  services: ['hero_headline', 'service_description', 'cta', 'meta_title', 'meta_description', 'og_description'],
  contact: ['hero_headline', 'hero_subheadline', 'meta_title', 'meta_description'],
  faq: ['hero_headline', 'meta_title', 'meta_description']
};
```

### New Features

- **Site builder UI:** Left sidebar with page list, center panel with component cards per page (each using the v2 collaborative editor), batch "Generate All Empty" per page
- **Cross-page awareness:** Before generating, assemble a context payload with a digest of content on other pages to prevent repetition
- **Cross-page digest system:** After a component is accepted, update the page digest (programmatic initially, LLM-generated later)
- **Structured export:** JSON (ACF-style, Contentful, generic), HTML (via `editor.getHTML()`), markdown — organized by page and component
- **Multiple projects per account** (potential paid tier)
- **Model routing:** Haiku for SEO metadata, Sonnet for primary content
- **Streaming responses** for long-form components
- **Multi-page site crawling** for deeper URL extraction

### Generation Prompt Changes for v3

The generation prompt adds cross-page context:

```
CONTEXT — CONTENT ALREADY ON OTHER PAGES (do not repeat):
{cross_page_digest}

CONTEXT — CONTENT ALREADY ON THIS PAGE (do not repeat):
{same_page_content}
```

And `ai_notes` gains `cross_page_flags`:

```json
{
  "cross_page_flags": [
    { "text": "Similar phrasing appears in the Services hero", "reference_page": "services", "reference_component": "hero_headline" }
  ]
}
```

---

## Key Architectural Decisions

1. **sessionStorage first, database second.** Anonymous users work entirely client-side. Database enters after email verification.

2. **The component type registry is the product.** The constraint system ensures output is actually usable in a real website. Invest time getting the schemas right.

3. **Design quality matters.** Portfolio piece for a developer-designer. If it looks like a hackathon project, the engineering underneath doesn't matter.

4. **The funnel is the business model.** Anonymous → email capture → lead. Every UX decision optimizes for engaged users handing over their email without feeling coerced.

5. **Supabase for auth and data, Next.js for LLM orchestration.** Supabase handles commodity infrastructure. All LLM logic lives in your API routes — the core engineering is entirely yours.

6. **TipTap from day one.** The rich text editor is the v1 editing experience. v2 adds collaborative features (tracked changes, notes panel) to an editor that already exists — not a swap to a new system. v3 expands to multi-page with the same editor.

7. **v1 data model supports v2 and v3 without migration.** v2 (collaborative editor) adds no new tables — it enhances the existing `copy_block` interaction. v3 (site builder) renames `brand_context` to `project` (multi-brand-context from v1 naturally becomes multi-project), adds `page` table, and adds `page_id` on `copy_block`. No existing data is restructured.

8. **Multiple brand voices from day one.** Persistent brand voice is the core differentiator. Locking users into one voice undermines it. Supporting multiple brand contexts in v1 is a small data model change that strengthens the product, the email capture funnel, and the natural evolution into v3's multi-project site builder.

---

## Addendum: AI Engineering Stack (RAG, Agents, Evals)

The existing architecture already demonstrates real AI engineering: structured output with validation/retry, constraint enforcement, multi-step LLM orchestration (URL extraction → voice profiling → constrained generation), and context management (voice profile as compressed retrieval). The additions below layer on three core AI Engineering concepts without requiring rearchitecture.

### RAG — v1 Enhancement (Post-Core Loop)

The voice profile is already a form of manual RAG — brand context compressed into a retrievable artifact injected at generation time. The upgrade makes retrieval dynamic and component-aware.

**What changes:**

Enable `pgvector` extension in Supabase (one-click). Add a `brand_embeddings` table:

- `id` (uuid, primary key)
- `brand_context_id` (foreign key)
- `chunk_text` (text — the source content chunk)
- `chunk_type` (enum: tone_example, source_content, competitor_analysis, voice_profile)
- `embedding` (vector(1536) — or whatever dimension the embedding model uses)
- `created_at` (timestamp)

**How it works:**

1. At brand context creation time (after voice extraction), chunk `tone_examples`, `source_content`, and `competitor_analysis` into meaningful segments and generate embeddings via a lightweight embedding model (Anthropic's or OpenAI's embedding endpoint).
2. Store chunks + embeddings in `brand_embeddings`.
3. At generation time, before building the prompt, embed the component type + its guidance text as a query vector. Run a similarity search against `brand_embeddings` for that brand context. Retrieve the 3-5 most relevant voice examples.
4. The generation prompt changes from a static `{voice_profile}` injection to: the voice profile summary (still included for overall tone) + dynamically retrieved relevant examples. A hero headline generation pulls different voice examples than an about page body.

**What this means for the product:** Generation quality improves because the LLM sees the most relevant voice context for each specific component, not a one-size-fits-all summary.

**What this means for the portfolio:** You can talk about chunking strategies, embedding models, similarity search, and the tradeoff between static context injection and dynamic retrieval — all grounded in a real problem (voice profiles don't capture enough nuance for different component types).

**Disruption level:** Low. Additive layer between voice extraction and generation. No schema changes to existing tables. No UI changes required (though you could surface "matched examples" in `ai_notes`). 2-3 days of work after the core loop is solid.

### Evals — Parallel Workstream (Start Anytime)

Evals don't change the architecture at all. They're a testing layer that wraps around the existing system.

**What to build:**

Create an `evals/` directory with:

- **Fixtures:** 5-10 brand contexts covering different tones (corporate, playful, technical, warm, bilingual). For each, a set of component types to generate.
- **Rubric:** For each brand context + component type combination: does it meet character constraints? (automated check). Does the voice match? (LLM-as-judge). Is it actually usable copy, not generic filler? (LLM-as-judge).
- **Runner script:** Executes the generation pipeline against all fixtures, collects outputs, scores them.
- **LLM-as-judge scoring:** A separate Claude call per output that rates voice consistency (1-5), constraint adherence (pass/fail), and copy quality (1-5). Use a cheaper model (Haiku) for judging to keep eval costs low.
- **Score matrix output:** JSON or CSV showing scores per brand context × component type. Re-run after any prompt change to compare.

**Optional: Admin eval dashboard** at `/admin/evals` showing historical eval runs and score trends. Portfolio gold — shows you think about AI quality systematically.

**When to run evals:**
- After any change to generation prompts
- After adding the RAG retrieval layer (compare scores with/without RAG)
- After changing models (e.g., testing Haiku vs. Sonnet for specific component types)
- Before each deploy as a smoke test

**Disruption level:** Zero. Sits outside application code entirely. Can be built in parallel with any other work.

### Agents — v2 Architecture (Collaborative Editor)

v1 is correctly scoped as a pipeline. Generate → validate → retry is orchestration, not an agent loop. Forcing agent patterns into v1 would over-complicate it.

**Where agents fit naturally — v2's collaborative editing:**

The "user gives feedback → AI proposes edits" loop is a genuine agent pattern. The AI needs to decide what action to take based on the feedback:

- "Make this warmer" → rewrite action (modify tone, preserve structure)
- "Too long" → trim action (condense, preserve meaning)
- "Give me three alternatives" → branch action (generate variations)
- "This doesn't match our voice" → re-retrieve action (pull fresh brand context via RAG, then rewrite)

That decision-making step — where the model routes between different strategies based on input — is what makes it an agent rather than a pipeline.

**Implementation approach for v2:**

Use Anthropic's tool-use API. Define tools the agent can call:

- `rewrite_section(text, instruction)` — modify specific text based on feedback
- `trim_to_constraint(text, max_chars)` — condense while preserving meaning
- `generate_alternatives(text, count)` — produce variations
- `retrieve_voice_context(query)` — pull relevant brand examples via RAG
- `check_voice_consistency(text, voice_profile)` — verify against brand voice

The agent receives the current document content + user feedback, decides which tools to use, executes them, and returns a structured diff. Diffs are applied as tracked changes in TipTap.

**Optional v1 addition — review agent:** A lightweight second LLM call after generation that checks the output against brand voice constraints before surfacing it to the user. Simple tool-use pattern (the agent has access to `voice_check` and `constraint_check` tools). One additional API call in the pipeline. Low disruption, gives you something concrete to talk about in interviews.

**Disruption level for review agent:** Low — one additional API call. **Disruption level for full v2 agent loop:** Medium, but that's already planned work framed through an agent architecture lens.

### Interview Framing

The key insight: these aren't bolted-on concepts to check boxes. RAG solves a real problem (static voice profiles don't capture enough nuance for different component types). Evals solve a real problem (how do you know your generation prompts are actually good). Agents solve a real problem in v2 (the AI needs to decide what action to take based on user feedback). Every technical choice is grounded in a genuine product need.

---

## Claude Code Workflow Notes

**Add the following to CLAUDE.md (or the project's memory/notes file) at project initialization:**

```markdown
## Git Conventions

- Separate commits by concern. Do not bundle unrelated changes into a single commit.
- Use a simple one-sentence commit message. No co-author tags.
```
