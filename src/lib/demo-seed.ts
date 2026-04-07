import type { BrandContext, CopyBlock } from "@/lib/session-storage";
import { textToDoc } from "@/lib/tiptap-utils";

// Fixed UUIDs so demo data is deterministic and block → context FKs stay consistent.
const CTX_BAKERY = "d0000000-0001-4000-8000-000000000001";
const CTX_STUDIO = "d0000000-0002-4000-8000-000000000002";
const CTX_GYM    = "d0000000-0003-4000-8000-000000000003";

// ── Brand Contexts ─────────────────────────────────────────────

export const demoContexts: BrandContext[] = [
  {
    id: CTX_BAKERY,
    slug: "golden-crust-bakery",
    name: "Golden Crust Bakery",
    business_name: "Golden Crust Bakery",
    business_description:
      "Neighborhood artisan bakery specializing in sourdough breads, French pastries, and custom celebration cakes. Family-owned since 2018, sourcing organic flour from local farms. Known for the Saturday morning line out the door.",
    audience: "Local families, foodies, weekend brunch crowd",
    tone: "Warm, inviting, a little playful",
    tone_examples: "",
    competitors: "",
    source_url: "",
    source_content: null,
    competitor_url: "",
    competitor_analysis: "",
    voice_profile:
      "Warm and neighborly with a hint of flour-dusted charm. Sentences are short and sensory — lean on smell, texture, and the feeling of a Saturday morning. Playful but never cutesy. Speak like a passionate baker talking to a friend, not a brand talking to a customer. Favor concrete details (sourdough starter, local farms, hand-shaped loaves) over generic claims. Avoid corporate food-service language.",
  },
  {
    id: CTX_STUDIO,
    slug: "clearline-studio",
    name: "Clearline Studio",
    business_name: "Clearline Studio",
    business_description:
      "Boutique web design and development studio building marketing sites and e-commerce platforms for growing brands. Three-person team with 12 years combined experience. Emphasis on performance, accessibility, and clean visual design.",
    audience: "Small business owners, DTC brands, startup founders",
    tone: "Confident, clear, modern",
    tone_examples: "",
    competitors: "",
    source_url: "",
    source_content: null,
    competitor_url: "",
    competitor_analysis: "",
    voice_profile:
      "Direct and assured without being slick. Sentences land with clarity — no hedging, no jargon. Technical credibility shows through specifics (load times, accessibility scores, conversion lifts) rather than buzzwords. Tone is peer-to-peer: we're experts, and we respect that you are too. One-sentence paragraphs for emphasis. Occasional dry wit. Never say 'leverage' or 'synergy'.",
  },
  {
    id: CTX_GYM,
    slug: "iron-path-fitness",
    name: "Iron Path Fitness",
    business_name: "Iron Path Fitness",
    business_description:
      "Strength-focused gym with personal training, small group classes, and an open floor for self-directed lifters. No mirrors on the main floor. Programming rooted in powerlifting and functional movement. Community-driven, not a globo-gym.",
    audience: "Intermediate to advanced lifters, people tired of commercial gyms",
    tone: "Gritty, motivating, no-nonsense",
    tone_examples: "",
    competitors: "",
    source_url: "",
    source_content: null,
    competitor_url: "",
    competitor_analysis: "",
    voice_profile:
      "Stripped-back and real. Short declarative sentences. No exclamation marks — intensity comes from the words, not punctuation. Speak to people who already train and respect the work. Zero tolerance for fitness-bro hype or guilt-trip marketing. Concrete over aspirational: chalk, iron, programming, recovery. Community is earned, not sold.",
  },
];

// ── Copy Blocks ────────────────────────────────────────────────

const now = new Date().toISOString();

export const demoBlocks: CopyBlock[] = [
  // --- Golden Crust Bakery ---
  {
    id: "d1000000-0001-4000-8000-000000000001",
    slug: "fresh-every-morning",
    brand_context_id: CTX_BAKERY,
    component_type: "headline",
    title: "Fresh Every Morning",
    user_prompt: "Write a hero headline that captures the early-morning bakery experience",
    content: textToDoc("Fresh bread, warm ovens, and the kind of morning worth waking up for."),
    ai_notes: {
      generation_reasoning: "Led with sensory details to evoke the bakery experience rather than making a generic quality claim.",
      suggestions: ["Could swap 'fresh bread' for a specific product like 'sourdough' to be more distinctive"],
    },
    version: 1,
    created_at: now,
  },
  {
    id: "d1000000-0002-4000-8000-000000000002",
    slug: "our-story",
    brand_context_id: CTX_BAKERY,
    component_type: "body_copy",
    title: "Our Story",
    user_prompt: "Write an about section for the homepage, 2-3 short paragraphs",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Golden Crust started with a 20-year-old sourdough starter and a rented kitchen. In 2018, we opened the shop on Elm Street with one goal: bake bread worth crossing town for." }] },
        { type: "paragraph", content: [{ type: "text", text: "Every loaf is hand-shaped. Our flour comes from Ridge Valley Farm, fifteen miles up the road. We don't rush the process — our doughs proof overnight because that's what makes them taste like this." }] },
        { type: "paragraph", content: [{ type: "text", text: "Stop in on a Saturday morning. You'll know the place by the line." }] },
      ],
    },
    ai_notes: {
      generation_reasoning: "Three short paragraphs with a narrative arc: origin, method, invitation. Ended with the Saturday line detail from the brief — it's the most memorable and specific.",
      suggestions: ["Consider adding the founders' names for a personal touch"],
    },
    version: 1,
    created_at: now,
  },
  {
    id: "d1000000-0003-4000-8000-000000000003",
    slug: "weekly-email",
    brand_context_id: CTX_BAKERY,
    component_type: "email",
    title: "Weekly Specials Email",
    user_prompt: "Write a short weekly email announcing this week's special: lavender honey croissants",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Subject: This week — lavender honey croissants" }] },
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [{ type: "text", text: "They're back, and they won't last." }] },
        { type: "paragraph", content: [{ type: "text", text: "This week's special is our lavender honey croissant — flaky layers, wildflower honey glaze, and just enough lavender to make you close your eyes. Available Thursday through Sunday, or until we run out (Saturday, usually)." }] },
        { type: "paragraph", content: [{ type: "text", text: "Grab one warm. You'll thank us." }] },
      ],
    },
    ai_notes: {
      generation_reasoning: "Kept it short and urgent — the scarcity angle ('won't last', 'until we run out') is authentic for a small bakery and drives action.",
    },
    version: 1,
    created_at: now,
  },

  // --- Clearline Studio ---
  {
    id: "d1000000-0004-4000-8000-000000000004",
    slug: "websites-that-work",
    brand_context_id: CTX_STUDIO,
    component_type: "headline",
    title: "Websites That Work",
    user_prompt: "Hero headline emphasizing performance and results, not just aesthetics",
    content: textToDoc("Your website should close deals while you sleep."),
    ai_notes: {
      generation_reasoning: "Focused on outcome (closing deals) rather than process (design, code). The 'while you sleep' framing positions the website as an employee, not a brochure.",
    },
    version: 1,
    created_at: now,
  },
  {
    id: "d1000000-0005-4000-8000-000000000005",
    slug: "what-we-do",
    brand_context_id: CTX_STUDIO,
    component_type: "body_copy",
    title: "What We Do",
    user_prompt: "Services overview — web design, development, e-commerce. Keep it tight.",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "We design and build marketing sites, e-commerce stores, and web applications for brands that are ready to grow. Three people, no layers, no handoffs to juniors." }] },
        { type: "paragraph", content: [{ type: "text", text: "Every project ships fast, scores 90+ on Core Web Vitals, and meets WCAG accessibility standards. Not because it's trendy — because it's how you reach more customers." }] },
        { type: "paragraph", content: [{ type: "text", text: "We've been doing this for twelve years. We'll tell you what works, what doesn't, and what's not worth your budget." }] },
      ],
    },
    ai_notes: {
      generation_reasoning: "Led with scope, followed with credibility signals (Web Vitals, WCAG), closed with the honest-advisor positioning that differentiates a boutique from an agency.",
    },
    version: 1,
    created_at: now,
  },
  {
    id: "d1000000-0006-4000-8000-000000000006",
    slug: "book-a-call",
    brand_context_id: CTX_STUDIO,
    component_type: "cta",
    title: "Book a Call CTA",
    user_prompt: "CTA for the bottom of the homepage — push toward a discovery call",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [
          { type: "text", text: "Ready to build something that actually performs? " },
          { type: "text", text: "Let's talk.", marks: [{ type: "bold" }] },
        ]},
        { type: "paragraph", content: [{ type: "text", text: "Book a free 30-minute call. No pitch deck, no pressure — just an honest conversation about what your site needs." }] },
      ],
    },
    ai_notes: {
      generation_reasoning: "The 'no pitch deck' line defuses sales resistance. Framing it as 'honest conversation' matches the peer-to-peer voice.",
    },
    version: 1,
    created_at: now,
  },

  // --- Iron Path Fitness ---
  {
    id: "d1000000-0007-4000-8000-000000000007",
    slug: "the-floor-is-yours",
    brand_context_id: CTX_GYM,
    component_type: "headline",
    title: "The Floor Is Yours",
    user_prompt: "Homepage headline — speak to serious lifters, not beginners",
    content: textToDoc("No mirrors. No music. Just iron and the work."),
    ai_notes: {
      generation_reasoning: "Three short negations followed by what IS there. The 'no mirrors' detail is distinctive and signals this isn't a commercial gym. Rhythm is punchy without exclamation marks.",
    },
    version: 1,
    created_at: now,
  },
  {
    id: "d1000000-0008-4000-8000-000000000008",
    slug: "about-iron-path",
    brand_context_id: CTX_GYM,
    component_type: "body_copy",
    title: "About Iron Path",
    user_prompt: "About section — what makes this gym different, who it's for",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Iron Path is a strength gym. Barbells, racks, platforms, chalk. We program around powerlifting and functional movement because that's what builds people who can do things." }] },
        { type: "paragraph", content: [{ type: "text", text: "We're not for everyone. If you want a smoothie bar and a sauna, there are plenty of options. If you want to get stronger with people who take the work seriously, this is the place." }] },
        { type: "paragraph", content: [{ type: "text", text: "Open floor, small group classes, and one-on-one coaching. No contracts. Show up, lift, leave better." }] },
      ],
    },
    ai_notes: {
      generation_reasoning: "Leaned into exclusivity — 'not for everyone' filters the right audience in. Concrete details (barbells, racks, chalk) over abstract promises. Final line is the value prop in six words.",
    },
    version: 1,
    created_at: now,
  },
  {
    id: "d1000000-0009-4000-8000-000000000009",
    slug: "new-member-post",
    brand_context_id: CTX_GYM,
    component_type: "social",
    title: "New Member Post",
    user_prompt: "Instagram post welcoming new members this month, keep it on-brand",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Twelve new members walked in this month. No fanfare, no transformation photos. Just people who decided to do the work." }] },
        { type: "paragraph", content: [{ type: "text", text: "Welcome to Iron Path. The bar doesn't care what you lifted last week. It only knows what you're lifting today." }] },
      ],
    },
    ai_notes: {
      generation_reasoning: "Avoided the typical gym-social hype. 'The bar doesn't care' personifies the equipment in a way that's motivating without being cheesy. No hashtags — they can add those.",
    },
    version: 1,
    created_at: now,
  },
];
