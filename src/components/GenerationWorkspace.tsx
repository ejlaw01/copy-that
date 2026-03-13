"use client";

import { useState, useCallback, useRef } from "react";
import { ComponentEditor } from "@/components/ComponentEditor";
import { Turnstile } from "@/components/Turnstile";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import {
  COMPONENT_TYPES,
  COMPONENT_TYPE_KEYS,
  isMultiItem,
  type MultiItemConstraint,
} from "@/lib/component-types";
import { emptyDoc, type TipTapDoc } from "@/lib/tiptap-utils";
import {
  saveCopyBlock,
  incrementGenerationCount,
  getSession,
  type BrandContext,
  type CopyBlock,
} from "@/lib/session-storage";

interface GenerationWorkspaceProps {
  context: BrandContext;
  onGenerate?: () => void;
}

interface AiNotes {
  generation_reasoning?: string;
  constraint_notes?: { type: string; constraint: string }[];
  suggestions?: string[];
}

export function GenerationWorkspace({ context, onGenerate }: GenerationWorkspaceProps) {
  const [selectedType, setSelectedType] = useState(COMPONENT_TYPE_KEYS[0]);
  const [generating, setGenerating] = useState(false);
  const turnstileTokenRef = useRef<string | null>(null);
  const [currentBlock, setCurrentBlock] = useState<CopyBlock | null>(null);
  const [aiNotes, setAiNotes] = useState<AiNotes | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [softLimit, setSoftLimit] = useState(false);
  const [serviceDown, setServiceDown] = useState(false);
  const [history, setHistory] = useState<CopyBlock[]>(() => {
    const session = getSession();
    return session.copy_blocks.filter(
      (b) => b.brand_context_id === context.id
    );
  });

  const schema = COMPONENT_TYPES[selectedType];

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          component_type: selectedType,
          voice_profile: context.voice_profile,
          business_name: context.business_name,
          source_content: context.source_content,
          turnstile_token: turnstileTokenRef.current,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.limit_reached && !data.soft_limit) {
          onGenerate?.(); // Trigger save prompt for anonymous users
        }
        if (data.soft_limit) {
          setSoftLimit(true);
        }
        if (data.service_unavailable === "spend_limit") {
          setServiceDown(true);
          throw new Error(data.error);
        }
        if (data.service_unavailable === "temporary") {
          throw new Error("The AI service is busy. Please try again in a moment.");
        }
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      incrementGenerationCount();

      const block: CopyBlock = {
        id: crypto.randomUUID(),
        brand_context_id: context.id,
        component_type: selectedType,
        content: data.content,
        ai_notes: data.ai_notes,
        version: 1,
        created_at: new Date().toISOString(),
      };

      saveCopyBlock(block);
      setCurrentBlock(block);
      setAiNotes(data.ai_notes);
      setHistory((prev) => [block, ...prev]);
      onGenerate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const handleContentChange = useCallback(
    (json: TipTapDoc) => {
      if (!currentBlock) return;
      const updated = { ...currentBlock, content: json };
      setCurrentBlock(updated);
      saveCopyBlock(updated);
    },
    [currentBlock]
  );

  function handleMultiItemChange(index: number, field: string, json: TipTapDoc) {
    if (!currentBlock) return;
    const content = currentBlock.content as { items: Record<string, unknown>[] };
    const items = [...content.items];
    items[index] = { ...items[index], [field]: json };
    const updated = { ...currentBlock, content: { items } };
    setCurrentBlock(updated);
    saveCopyBlock(updated);
  }

  function loadBlock(block: CopyBlock) {
    setCurrentBlock(block);
    setSelectedType(block.component_type);
    setAiNotes(block.ai_notes as AiNotes | null);
  }

  async function handleCopy(format: "text" | "html") {
    if (!currentBlock) return;

    if (format === "html") {
      // For multi-item, build a simple HTML representation
      if (isMultiItem(COMPONENT_TYPES[currentBlock.component_type])) {
        const content = currentBlock.content as { items: Record<string, TipTapDoc>[] };
        const html = content.items
          .map((item) =>
            Object.entries(item)
              .map(([, doc]) => docToPlainText(doc))
              .join("\n")
          )
          .join("\n\n");
        await navigator.clipboard.writeText(html);
      } else {
        const doc = currentBlock.content as TipTapDoc;
        await navigator.clipboard.writeText(docToPlainText(doc));
      }
    } else {
      const text = extractPlainText(currentBlock);
      await navigator.clipboard.writeText(text);
    }
  }

  function handleDownloadMarkdown() {
    if (!currentBlock) return;
    const text = extractPlainText(currentBlock);
    const blob = new Blob([`# ${schema.label}\n\n${text}\n`], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentBlock.component_type}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl flex gap-8">
      <Turnstile onToken={(token) => { turnstileTokenRef.current = token; }} />
      {/* Main area */}
      <div className="flex-1 min-w-0">
        {/* Component type selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground/70 mb-2">
            Component Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setCurrentBlock(null);
              setAiNotes(null);
              setError(null);
            }}
            className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
          >
            {COMPONENT_TYPE_KEYS.map((key) => (
              <option key={key} value={key}>
                {COMPONENT_TYPES[key].label}
              </option>
            ))}
          </select>
          {schema.guidance && (
            <p className="mt-1.5 text-xs text-foreground/40">{schema.guidance}</p>
          )}
        </div>

        {/* Editor area */}
        {currentBlock ? (
          <div className="space-y-4">
            {isMultiItem(schema) ? (
              <MultiItemEditor
                block={currentBlock}
                schema={schema as MultiItemConstraint}
                onChange={handleMultiItemChange}
              />
            ) : (
              <ComponentEditor
                content={currentBlock.content as TipTapDoc}
                maxChars={schema.max_chars}
                minChars={schema.min_chars}
                singleLine={schema.structure === "single_line"}
                onChange={handleContentChange}
              />
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="rounded-lg border border-foreground/10 px-3 py-1.5 text-xs text-foreground/60 hover:text-foreground transition-colors disabled:opacity-30"
              >
                {generating ? "Regenerating..." : "Regenerate"}
              </button>
              <button
                onClick={() => handleCopy("text")}
                className="rounded-lg border border-foreground/10 px-3 py-1.5 text-xs text-foreground/60 hover:text-foreground transition-colors"
              >
                Copy Text
              </button>
              <button
                onClick={() => handleCopy("html")}
                className="rounded-lg border border-foreground/10 px-3 py-1.5 text-xs text-foreground/60 hover:text-foreground transition-colors"
              >
                Copy HTML
              </button>
              <button
                onClick={handleDownloadMarkdown}
                className="rounded-lg border border-foreground/10 px-3 py-1.5 text-xs text-foreground/60 hover:text-foreground transition-colors"
              >
                Download .md
              </button>
            </div>

            {/* AI Notes */}
            {aiNotes?.generation_reasoning && (
              <div>
                <button
                  onClick={() => setShowNotes(!showNotes)}
                  className="text-xs text-foreground/40 hover:text-foreground transition-colors"
                >
                  {showNotes ? "Hide" : "Why this copy?"}
                </button>
                {showNotes && (
                  <div className="mt-2 rounded-lg bg-foreground/5 p-3 text-xs text-foreground/60 space-y-2">
                    <p>{aiNotes.generation_reasoning}</p>
                    {aiNotes.suggestions && aiNotes.suggestions.length > 0 && (
                      <div>
                        <p className="font-medium text-foreground/50 mb-1">Suggestions:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {aiNotes.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Empty state */
          <div className="rounded-lg border border-dashed border-foreground/10 p-12 text-center">
            <p className="text-sm text-foreground/30 mb-4">
              Generate a {schema.label.toLowerCase()} for {context.business_name}
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>
        )}

        {error && !softLimit && (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        )}

        {softLimit && (
          <div className="mt-4 rounded-lg border border-foreground/10 bg-foreground/5 p-4 text-sm text-foreground/70 space-y-2">
            <p>
              You&apos;ve hit today&apos;s generation limit. This tool is a free project by{" "}
              <strong>Bit Lore</strong>, a custom web development studio in Portland.
            </p>
            <p>
              If you&apos;re finding this useful, or if you need help building the site
              this content is going to live on, I&apos;d love to hear from you.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href="mailto:hello@bitlore.io"
                className="rounded-lg bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
              >
                Get in touch
              </a>
              <a
                href="https://bitlore.io"
                className="text-xs text-foreground/50 hover:text-foreground transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                bitlore.io
              </a>
            </div>
          </div>
        )}
      </div>

      {/* History sidebar */}
      {history.length > 0 && (
        <div className="w-56 shrink-0">
          <h3 className="text-xs font-medium text-foreground/40 mb-3 uppercase tracking-wider">
            History
          </h3>
          <div className="space-y-1.5">
            {history.map((block) => (
              <button
                key={block.id}
                onClick={() => loadBlock(block)}
                className={`w-full text-left rounded-lg px-3 py-2 text-xs transition-colors ${
                  currentBlock?.id === block.id
                    ? "bg-foreground/10 text-foreground"
                    : "text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                <span className="block font-medium truncate">
                  {COMPONENT_TYPES[block.component_type]?.label ?? block.component_type}
                </span>
                <span className="block text-foreground/30 truncate">
                  {previewContent(block)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {serviceDown && (
        <ServiceUnavailable onDismiss={() => setServiceDown(false)} />
      )}
    </div>
  );
}

function MultiItemEditor({
  block,
  schema,
  onChange,
}: {
  block: CopyBlock;
  schema: MultiItemConstraint;
  onChange: (index: number, field: string, json: TipTapDoc) => void;
}) {
  const content = block.content as { items: Record<string, TipTapDoc>[] };

  return (
    <div className="space-y-4">
      {content.items.map((item, i) => (
        <div key={i} className="space-y-2">
          {i > 0 && <hr className="border-foreground/5" />}
          <p className="text-xs font-medium text-foreground/40">Item {i + 1}</p>
          {Object.entries(schema.per_item).map(([field, constraint]) => (
            <div key={field}>
              <label className="block text-xs text-foreground/50 mb-1">
                {constraint.label}
              </label>
              <ComponentEditor
                content={item[field] ?? emptyDoc()}
                maxChars={constraint.max_chars}
                minChars={constraint.min_chars}
                singleLine={constraint.structure === "single_line"}
                onChange={(json) => onChange(i, field, json)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function docToPlainText(doc: TipTapDoc): string {
  return doc.content
    .map((node) =>
      (node.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("")
    )
    .join("\n");
}

function extractPlainText(block: CopyBlock): string {
  if (isMultiItem(COMPONENT_TYPES[block.component_type])) {
    const content = block.content as { items: Record<string, TipTapDoc>[] };
    return content.items
      .map((item) =>
        Object.entries(item)
          .map(([key, doc]) => `${key}: ${docToPlainText(doc)}`)
          .join("\n")
      )
      .join("\n\n");
  }
  return docToPlainText(block.content as TipTapDoc);
}

function previewContent(block: CopyBlock): string {
  const text = extractPlainText(block);
  return text.slice(0, 60) || "(empty)";
}
