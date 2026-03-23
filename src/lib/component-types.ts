export interface ContentCategory {
  label: string;
  guidance: string;
  default_max_words?: number;
  default_min_words?: number;
  singleLine?: boolean;
}

export const CONTENT_CATEGORIES: Record<string, ContentCategory> = {
  general: {
    label: "General",
    guidance:
      "Flexible copy for any purpose. Follow the user's prompt closely.",
  },
  headline: {
    label: "Headline",
    guidance:
      "Short, punchy, attention-grabbing. Typically under 80 characters. Clear benefit or hook.",
    default_max_words: 13,
    singleLine: true,
  },
  body_copy: {
    label: "Body Copy",
    guidance:
      "Longer-form website copy: about sections, service descriptions, landing page blocks. Authentic and readable.",
    default_max_words: 250,
    default_min_words: 30,
  },
  email: {
    label: "Email",
    guidance:
      "Email content: subject lines, body copy, CTAs. Conversational, scannable, action-oriented.",
    default_max_words: 170,
  },
  social: {
    label: "Social Media",
    guidance:
      "Social media posts and captions. Platform-aware, engaging, concise. Include hooks and calls to action where appropriate.",
    default_max_words: 50,
  },
  seo: {
    label: "SEO",
    guidance:
      "Search-optimized content: meta titles, descriptions, alt text. Natural keyword integration, compelling click-through copy.",
    default_max_words: 27,
    default_min_words: 5,
    singleLine: true,
  },
  cta: {
    label: "Call to Action",
    guidance:
      "Conversion-focused copy: button text, banner headlines, urgency messaging. Action verbs, clear value proposition.",
    default_max_words: 25,
    singleLine: true,
  },
};

export const CATEGORY_KEYS = Object.keys(CONTENT_CATEGORIES);
