export interface ContentCategory {
  label: string;
  guidance: string;
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
    singleLine: true,
  },
  body_copy: {
    label: "Body Copy",
    guidance:
      "Longer-form website copy: about sections, service descriptions, landing page blocks. Authentic and readable.",
  },
  email: {
    label: "Email",
    guidance:
      "Email content: subject lines, body copy, CTAs. Conversational, scannable, action-oriented.",
  },
  social: {
    label: "Social Media",
    guidance:
      "Social media posts and captions. Platform-aware, engaging, concise. Include hooks and calls to action where appropriate.",
  },
  seo: {
    label: "SEO",
    guidance:
      "Search-optimized content: meta titles, descriptions, alt text. Natural keyword integration, compelling click-through copy.",
    singleLine: true,
  },
  cta: {
    label: "Call to Action",
    guidance:
      "Conversion-focused copy: button text, banner headlines, urgency messaging. Action verbs, clear value proposition.",
    singleLine: true,
  },
};

export const CATEGORY_KEYS = Object.keys(CONTENT_CATEGORIES);
