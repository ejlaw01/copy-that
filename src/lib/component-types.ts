export type StructureType = "single_line" | "paragraph" | "multi_item";

export interface ComponentConstraint {
  label: string;
  max_chars?: number;
  min_chars?: number;
  structure: StructureType;
  guidance?: string;
}

export interface MultiItemConstraint extends ComponentConstraint {
  structure: "multi_item";
  count: number;
  per_item: Record<string, ComponentConstraint>;
}

export type ComponentType = ComponentConstraint | MultiItemConstraint;

export function isMultiItem(c: ComponentType): c is MultiItemConstraint {
  return c.structure === "multi_item";
}

export const COMPONENT_TYPES: Record<string, ComponentType> = {
  hero_headline: {
    label: "Hero Headline",
    max_chars: 60,
    structure: "single_line",
    guidance:
      "Clear, benefit-driven, no jargon. Should immediately communicate what the business does and why it matters.",
  },

  hero_subheadline: {
    label: "Hero Subheadline",
    max_chars: 140,
    structure: "single_line",
    guidance:
      "Supports the headline with a brief elaboration. Can include a specific proof point or differentiator.",
  },

  value_props: {
    label: "Value Propositions",
    structure: "multi_item",
    count: 3,
    per_item: {
      heading: {
        label: "Heading",
        max_chars: 40,
        structure: "single_line",
        guidance: "Action-oriented, specific benefit",
      },
      body: {
        label: "Body",
        max_chars: 120,
        structure: "paragraph",
        guidance: "One or two sentences expanding on the benefit",
      },
    },
  } as MultiItemConstraint,

  about_body: {
    label: "About Body",
    max_chars: 600,
    min_chars: 200,
    structure: "paragraph",
    guidance:
      "Origin story or mission statement. Should feel personal and authentic, not corporate.",
  },

  team_bio: {
    label: "Team Bio",
    max_chars: 300,
    structure: "paragraph",
    guidance:
      "Brief professional bio. Should feel human — include a personal detail or two alongside credentials.",
  },

  service_description: {
    label: "Service Description",
    max_chars: 200,
    structure: "paragraph",
    guidance:
      "Clear explanation of one service offering. Focus on what the client gets, not how it works internally.",
  },

  cta: {
    label: "Call to Action",
    structure: "multi_item",
    count: 1,
    per_item: {
      heading: {
        label: "Heading",
        max_chars: 50,
        structure: "single_line",
        guidance: "Creates urgency or invitation",
      },
      button_text: {
        label: "Button Text",
        max_chars: 25,
        structure: "single_line",
        guidance: "Action verb + benefit",
      },
      supporting_text: {
        label: "Supporting Text",
        max_chars: 100,
        structure: "single_line",
        guidance:
          "Addresses a potential objection or reinforces the offer",
      },
    },
  } as MultiItemConstraint,

  meta_title: {
    label: "Meta Title",
    max_chars: 60,
    min_chars: 30,
    structure: "single_line",
    guidance:
      "SEO page title. Include primary keyword naturally. Format: Primary Keyword — Brand Name",
  },

  meta_description: {
    label: "Meta Description",
    max_chars: 160,
    min_chars: 140,
    structure: "single_line",
    guidance:
      "SEO meta description. Summarize page content with a compelling reason to click. Include primary keyword.",
  },

  og_description: {
    label: "Social Share Description",
    max_chars: 200,
    structure: "single_line",
    guidance:
      "Social sharing description. More conversational than meta description. Should make someone want to share or click.",
  },
};

export const COMPONENT_TYPE_KEYS = Object.keys(COMPONENT_TYPES);
