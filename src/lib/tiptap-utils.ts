export interface TipTapDoc {
  type: "doc";
  content: Array<{
    type: string;
    content?: Array<{ type: string; text?: string; marks?: Array<{ type: string }> }>;
  }>;
}

export interface MultiItemContent {
  items: Array<Record<string, TipTapDoc>>;
}

export function textToDoc(text: string): TipTapDoc {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

export function docToText(doc: TipTapDoc): string {
  return doc.content
    .map((node) =>
      (node.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("")
    )
    .join("\n");
}

export function emptyDoc(): TipTapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [] }],
  };
}
