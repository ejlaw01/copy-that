"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ComponentEditor, type ComponentEditorHandle } from "@/components/ComponentEditor";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { AnimatedEllipsis } from "@/components/AnimatedEllipsis";
import { CONTENT_CATEGORIES, CATEGORY_KEYS } from "@/lib/component-types";
import type { TipTapDoc } from "@/lib/tiptap-utils";
import {
  saveCopyBlock,
  saveCopyBlockWithSync,
  deleteCopyBlock,
  deleteCopyBlockWithSync,
  incrementGenerationCount,
  getSession,
  getActiveBlock,
  setActiveBlock,
  type BrandContext,
  type CopyBlock,
} from "@/lib/session-storage";

function getDocumentKey(block: CopyBlock): string {
  return `${block.component_type}::${(block.user_prompt || "").trim().toLowerCase()}`;
}

interface DocumentGroup {
  key: string;
  label: string;
  promptPreview: string;
  versions: CopyBlock[];
  latest: CopyBlock;
}

function groupBlocksIntoDocuments(blocks: CopyBlock[]): DocumentGroup[] {
  const map = new Map<string, CopyBlock[]>();
  for (const block of blocks) {
    const key = getDocumentKey(block);
    const existing = map.get(key);
    if (existing) {
      existing.push(block);
    } else {
      map.set(key, [block]);
    }
  }

  const groups: DocumentGroup[] = [];
  for (const [key, versions] of map) {
    const sorted = versions.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const latest = sorted[0];
    const prompt = latest.user_prompt || "";
    groups.push({
      key,
      label:
        CONTENT_CATEGORIES[latest.component_type]?.label ??
        latest.component_type,
      promptPreview: prompt.length > 30 ? prompt.slice(0, 30) + "…" : prompt,
      versions: sorted,
      latest,
    });
  }

  return groups;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface DiffSpan {
  type: "same" | "added" | "removed";
  text: string;
}

function tokenize(text: string): string[] {
  return text
    .split(/(\n)|( +)|([.!?,;:]+)/)
    .filter((t) => t !== undefined && t !== "");
}

function diffWords(oldText: string, newText: string): DiffSpan[] {
  const oldWords = tokenize(oldText.trim());
  const newWords = tokenize(newText.trim());
  const oldLen = oldWords.length;
  const newLen = newWords.length;

  // LCS via DP table
  const dp: number[][] = Array.from({ length: oldLen + 1 }, () =>
    new Array(newLen + 1).fill(0),
  );
  for (let i = 1; i <= oldLen; i++) {
    for (let j = 1; j <= newLen; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build edit sequence
  const edits: Array<{ type: "same" | "added" | "removed"; word: string }> = [];
  let i = oldLen;
  let j = newLen;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      edits.unshift({ type: "same", word: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: "added", word: newWords[j - 1] });
      j--;
    } else {
      edits.unshift({ type: "removed", word: oldWords[i - 1] });
      i--;
    }
  }

  // Merge consecutive spans of same type, rejoining with spaces
  const isPunct = (s: string) => /^[.!?,;:]+$/.test(s);
  const spans: DiffSpan[] = [];
  for (const edit of edits) {
    const isNewline = edit.word === "\n";
    const last = spans[spans.length - 1];
    if (last && last.type === edit.type) {
      const sep = isNewline ? "\n" : isPunct(edit.word) ? "" : " ";
      last.text += sep + edit.word;
    } else {
      const needsSpace =
        !isNewline &&
        !isPunct(edit.word) &&
        spans.length > 0 &&
        !spans[spans.length - 1].text.endsWith("\n");
      spans.push({
        type: edit.type,
        text: (needsSpace ? " " : "") + edit.word,
      });
    }
  }
  return spans;
}

interface GenerationWorkspaceProps {
  context: BrandContext | null;
  form: BrandContext;
  canGenerate: boolean;
  ensureContext: () => Promise<BrandContext | null>;
  onGenerate?: () => void;
  isAuthenticated?: boolean;
  onSyncStatus?: (status: "saving" | "saved" | "error") => void;
}

interface AiNotes {
  generation_reasoning?: string;
  suggestions?: string[];
}

export function GenerationWorkspace({
  context,
  form,
  canGenerate,
  ensureContext,
  onGenerate,
  isAuthenticated = false,
  onSyncStatus,
}: GenerationWorkspaceProps) {
  const [generating, setGenerating] = useState(false);
  const editorRef = useRef<ComponentEditorHandle>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const turnstileTokenRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [softLimit, setSoftLimit] = useState(false);
  const [serviceDown, setServiceDown] = useState(false);

  // Fire-and-forget sync for copy blocks. Drives the parent's status indicator
  // without blocking any UI. The sessionStorage write happens synchronously
  // inside saveCopyBlockWithSync before the fetch fires.
  function syncBlock(block: CopyBlock) {
    if (!isAuthenticated) return;
    onSyncStatus?.("saving");
    saveCopyBlockWithSync(block, true).then(({ syncError }) => {
      onSyncStatus?.(syncError ? "error" : "saved");
    });
  }

  function syncDeleteBlock(id: string) {
    if (!isAuthenticated) return;
    onSyncStatus?.("saving");
    deleteCopyBlockWithSync(id, true).then(({ syncError }) => {
      onSyncStatus?.(syncError ? "error" : "saved");
    });
  }

  // Restore state from session storage
  const [history, setHistory] = useState<CopyBlock[]>(() => {
    if (!context) return [];
    const session = getSession();
    return session.copy_blocks.filter((b) => b.brand_context_id === context.id);
  });
  const [currentBlock, setCurrentBlock] = useState<CopyBlock | null>(() => {
    if (!context) return null;
    return getActiveBlock();
  });
  const [category, setCategory] = useState(() => {
    const block = context ? getActiveBlock() : null;
    return block?.component_type ?? "general";
  });
  const [userPrompt, setUserPrompt] = useState(() => {
    const block = context ? getActiveBlock() : null;
    return block?.user_prompt ?? "";
  });
  const [aiNotes, setAiNotes] = useState<AiNotes | null>(() => {
    const block = context ? getActiveBlock() : null;
    return (block?.ai_notes as AiNotes | null) ?? null;
  });

  const [feedback, setFeedback] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set(),
  );

  const documentGroups = useMemo(
    () => groupBlocksIntoDocuments(history),
    [history],
  );

  const activeDocKey = currentBlock ? getDocumentKey(currentBlock) : null;
  const activeGroup = activeDocKey
    ? (documentGroups.find((g) => g.key === activeDocKey) ?? null)
    : null;
  const activeVersionIndex =
    activeGroup && currentBlock
      ? activeGroup.versions.findIndex((v) => v.id === currentBlock.id)
      : -1;

  // Restore state when context becomes available after mount
  const restoredContextRef = useRef<string | null>(null);
  useEffect(() => {
    if (!context || restoredContextRef.current === context.id) return;
    restoredContextRef.current = context.id;
    const session = getSession();
    const blocks = session.copy_blocks.filter(
      (b) => b.brand_context_id === context.id,
    );
    setHistory(blocks);
    const block = getActiveBlock();
    if (block && block.brand_context_id === context.id) {
      setCurrentBlock(block);
      setCategory(block.component_type);
      setUserPrompt(block.user_prompt ?? "");
      setAiNotes((block.ai_notes as AiNotes | null) ?? null);
    } else {
      setCurrentBlock(null);
      setAiNotes(null);
    }
  }, [context]);

  async function handleGenerate() {
    const isRefining = !!currentBlock && !!feedback.trim();
    if (!isRefining && !userPrompt.trim()) return;
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    setSoftLimit(false);

    // Auto-save current RTE content as a version before regenerating
    let updatedHistory = history;
    if (isRefining && currentBlock) {
      const snapshot: CopyBlock = {
        ...currentBlock,
        id: crypto.randomUUID(),
        version: (currentBlock.version ?? 1) + 1,
        created_at: new Date().toISOString(),
      };
      saveCopyBlock(snapshot);
      syncBlock(snapshot);
      updatedHistory = [snapshot, ...history];
      setHistory(updatedHistory);
    }

    try {
      // Ensure voice profile exists (lazy creation)
      const ctx = await ensureContext();
      if (!ctx) {
        setError("Please fill in all required brand fields first.");
        setGenerating(false);
        return;
      }

      // Build the prompt: original request + feedback context if refining
      let effectivePrompt = userPrompt;
      if (isRefining) {
        const currentText = docToPlainText(currentBlock!.content as TipTapDoc);
        effectivePrompt = `${userPrompt}\n\nCURRENT COPY (revise this based on the feedback below):\n${currentText}\n\nFEEDBACK:\n${feedback.trim()}`;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          user_prompt: effectivePrompt,
          voice_profile: ctx.voice_profile,
          business_name: ctx.business_name,
          source_content: ctx.source_content,
          turnstile_token: turnstileTokenRef.current,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.limit_reached && !data.soft_limit) {
          onGenerate?.();
        }
        if (data.soft_limit) {
          setSoftLimit(true);
        }
        if (data.service_unavailable === "spend_limit") {
          setServiceDown(true);
          throw new Error(data.error);
        }
        if (data.service_unavailable === "temporary") {
          throw new Error(
            "The AI service is busy. Please try again in a moment.",
          );
        }
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      incrementGenerationCount();

      const block: CopyBlock = {
        id: crypto.randomUUID(),
        brand_context_id: ctx.id,
        component_type: category,
        user_prompt: userPrompt,
        content: data.content,
        ai_notes: data.ai_notes,
        version: 1,
        created_at: new Date().toISOString(),
      };

      saveCopyBlock(block);
      syncBlock(block);
      setActiveBlock(block.id);
      setCurrentBlock(block);
      setAiNotes(data.ai_notes);
      setFeedback("");
      setHistory((prev) => [block, ...prev]);
      onGenerate?.();
    } catch (err) {
      if (err instanceof Error && err.message === "service_unavailable") {
        setServiceDown(true);
      } else {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setGenerating(false);
      turnstileRef.current?.reset();
    }
  }

  const handleContentChange = useCallback(
    (json: TipTapDoc) => {
      if (!currentBlock) return;
      const updated = { ...currentBlock, content: json };
      setCurrentBlock(updated);
      saveCopyBlock(updated);
      syncBlock(updated);
    },
    // syncBlock is stable (depends on isAuthenticated/onSyncStatus from props,
    // not on state that changes per-keystroke), so including it here is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentBlock],
  );

  function loadBlock(block: CopyBlock) {
    setActiveBlock(block.id);
    setCurrentBlock(block);
    setCategory(block.component_type);
    setUserPrompt(block.user_prompt ?? "");
    setAiNotes(block.ai_notes as AiNotes | null);
    setFeedback("");
  }

  async function handleCopy() {
    if (!currentBlock) return;
    const doc = currentBlock.content as TipTapDoc;
    const text = docToPlainText(doc);
    await navigator.clipboard.writeText(text);
  }

  function handleDownloadMarkdown() {
    if (!currentBlock) return;
    const text = docToPlainText(currentBlock.content as TipTapDoc);
    const categoryLabel =
      CONTENT_CATEGORIES[currentBlock.component_type]?.label ??
      currentBlock.component_type;
    const blob = new Blob([`# ${categoryLabel}\n\n${text}\n`], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentBlock.component_type}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSaveVersion() {
    if (!currentBlock) return;
    editorRef.current?.exitSourceView();
    const newBlock: CopyBlock = {
      ...currentBlock,
      id: crypto.randomUUID(),
      ai_notes: null,
      version: (currentBlock.version ?? 1) + 1,
      created_at: new Date().toISOString(),
    };
    saveCopyBlock(newBlock);
    syncBlock(newBlock);
    setActiveBlock(newBlock.id);
    setCurrentBlock(newBlock);
    setAiNotes(null);
    setHistory((prev) => [newBlock, ...prev]);
  }

  function handleDeleteBlock() {
    if (!currentBlock) return;
    if (!confirm("Delete this block?")) return;

    const blockId = currentBlock.id;
    deleteCopyBlock(blockId);
    syncDeleteBlock(blockId);

    const remaining = history.filter((b) => b.id !== blockId);
    setHistory(remaining);
    setActiveBlock(null);
    setCurrentBlock(null);
    setAiNotes(null);
    setCategory("general");
    setUserPrompt("");
    setFeedback("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  }

  function handleFeedbackKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  }

  async function handleAnalyze() {
    if (!currentBlock || !context) return;
    setAnalyzing(true);

    try {
      const currentText = docToPlainText(currentBlock.content as TipTapDoc);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_copy: currentText,
          voice_profile: context.voice_profile,
          business_name: context.business_name,
          user_prompt: userPrompt,
          turnstile_token: turnstileTokenRef.current,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      const data = await res.json();
      const notes = data.ai_notes as AiNotes;
      setAiNotes(notes);

      // Persist to current block in session storage
      const updated = { ...currentBlock, ai_notes: notes };
      setCurrentBlock(updated);
      saveCopyBlock(updated);
      syncBlock(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      <Turnstile
        ref={turnstileRef}
        onToken={(token) => {
          turnstileTokenRef.current = token;
        }}
      />

      {/* Copy Blocks — Document Picker Strip */}
      {documentGroups.length > 0 && (
        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-t border-ct-rule pt-5">
          {documentGroups.map((group) => (
            <button
              key={group.key}
              onClick={() => {
                loadBlock(group.latest);
                setShowVersions(false);
              }}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs transition-colors ${
                activeDocKey === group.key
                  ? "bg-ct-ink text-ct-paper"
                  : "bg-ct-cream text-ct-muted hover:bg-ct-rule hover:text-ct-ink"
              }`}
            >
              <span className="font-medium">{group.label}</span>
              {group.promptPreview && (
                <span
                  className={
                    activeDocKey === group.key
                      ? "text-ct-paper/60"
                      : "text-ct-rule"
                  }
                >
                  {" "}
                  — {group.promptPreview}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => {
              setCurrentBlock(null);
              setActiveBlock(null);
              setCategory("general");
              setUserPrompt("");
              setFeedback("");
              setAiNotes(null);
              setShowVersions(false);
            }}
            className="shrink-0 rounded-full border border-dashed border-ct-rule px-4 py-1.5 text-xs font-ui text-ct-muted hover:text-ct-ink hover:border-ct-muted transition-colors"
          >
            + New
          </button>
        </div>
      )}

      {/* Category + Prompt */}
      <div className="mb-6 space-y-5 border-t border-ct-rule pt-5">
        {!currentBlock && (
          <div>
            <label className="ct-label">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="ct-input"
            >
              {CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {CONTENT_CATEGORIES[key].label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-ct-muted">
              {CONTENT_CATEGORIES[category].guidance}
            </p>
          </div>
        )}

        <div>
          <label className="ct-label">
            Prompt
          </label>
          {currentBlock ? (
            <p className="text-sm text-ct-muted">{userPrompt}</p>
          ) : (
            <textarea
              id="user-prompt"
              name="user-prompt"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='What do you need? e.g., "Write a hero headline that emphasizes our fast turnaround"'
              rows={3}
              maxLength={1000}
              className="ct-input resize-none"
            />
          )}
        </div>

        {!currentBlock && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-ct-rule">
              {typeof navigator !== "undefined" &&
              navigator.platform?.includes("Mac")
                ? "⌘"
                : "Ctrl"}
              +Enter to generate
            </span>
            <button
              onClick={handleGenerate}
              disabled={generating || !userPrompt.trim() || !canGenerate}
              className="ct-btn ct-btn-primary disabled:opacity-30"
            >
              {generating ? <>Generating<AnimatedEllipsis /></> : "Generate"}
            </button>
          </div>
        )}
      </div>

      {/* Output — Editor (full width) */}
      {currentBlock && (
        <div className="space-y-4">
          <ComponentEditor
            ref={editorRef}
            content={currentBlock.content as TipTapDoc}
            onChange={handleContentChange}
          />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="ct-btn ct-btn-secondary text-xs"
            >
              Copy Text
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="ct-btn ct-btn-secondary text-xs"
            >
              Download .md
            </button>
            <button
              onClick={handleSaveVersion}
              className="ml-auto ct-btn ct-btn-secondary text-xs"
            >
              Save Version
            </button>
            <button
              onClick={handleDeleteBlock}
              className="ct-btn ct-btn-secondary text-xs text-ct-rule hover:text-ct-strike transition-colors"
            >
              Delete
            </button>
          </div>

          {/* Version History */}
          {activeGroup && (
            <div>
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="text-xs text-ct-muted hover:text-ct-ink transition-colors"
              >
                Version {activeGroup.versions.length - activeVersionIndex} of{" "}
                {activeGroup.versions.length} {showVersions ? "▼" : "▶"}
              </button>
              {showVersions && (
                <div className="mt-2 space-y-1">
                  {activeGroup.versions.map((version, i) => {
                    const versionNum = activeGroup.versions.length - i;
                    const prevVersion = activeGroup.versions[i + 1];
                    const currentText = docToPlainText(
                      version.content as TipTapDoc,
                    );
                    const hasDiff = !!prevVersion;
                    const spans = hasDiff
                      ? diffWords(
                          docToPlainText(prevVersion.content as TipTapDoc),
                          currentText,
                        )
                      : [{ type: "same" as const, text: currentText }];

                    // Split spans into lines for preview truncation
                    const allLines: Array<{ spans: DiffSpan[] }> = [
                      { spans: [] },
                    ];
                    for (const span of spans) {
                      const parts = span.text.split("\n");
                      for (let p = 0; p < parts.length; p++) {
                        if (p > 0) allLines.push({ spans: [] });
                        if (parts[p]) {
                          allLines[allLines.length - 1].spans.push({
                            type: span.type,
                            text: parts[p],
                          });
                        }
                      }
                    }
                    const nonEmptyLines = allLines.filter((l) =>
                      l.spans.some((s) => s.text.trim().length > 0),
                    );

                    const isExpanded = expandedVersions.has(version.id);
                    const hasMore = nonEmptyLines.length > 3;
                    const visibleLines = isExpanded
                      ? nonEmptyLines
                      : nonEmptyLines.slice(0, 3);

                    return (
                      <div
                        key={version.id}
                        onClick={() => loadBlock(version)}
                        className={`rounded-[--radius-md] px-3 py-2 text-xs transition-colors cursor-pointer no-underline ${
                          currentBlock?.id === version.id
                            ? "bg-ct-cream text-ct-ink"
                            : "text-ct-muted hover:bg-ct-cream"
                        }`}
                      >
                        <div>
                          <span className="font-medium">
                            Version {versionNum}
                          </span>
                          <span className="text-ct-rule ml-2">
                            {relativeTime(version.created_at)}
                          </span>
                        </div>
                        <div className="mt-0.5">
                          {visibleLines.length === 0 && (
                            <span className="text-ct-rule">(empty)</span>
                          )}
                          {visibleLines.map((line, li) => (
                            <div key={li} className="text-ct-rule">
                              {line.spans.map((s, si) =>
                                s.type === "added" ? (
                                  <span
                                    key={si}
                                    className="bg-ct-positive-bg text-ct-positive"
                                  >
                                    {s.text}
                                  </span>
                                ) : s.type === "removed" ? (
                                  <span
                                    key={si}
                                    className="bg-ct-strike-bg text-ct-strike line-through"
                                  >
                                    {s.text}
                                  </span>
                                ) : (
                                  <span key={si}>{s.text}</span>
                                ),
                              )}
                            </div>
                          ))}
                          {hasMore && !isExpanded && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedVersions((prev) => {
                                  const next = new Set(prev);
                                  next.add(version.id);
                                  return next;
                                });
                              }}
                              className="text-ct-muted hover:text-ct-muted transition-colors"
                            >
                              ...
                            </button>
                          )}
                          {hasMore && isExpanded && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedVersions((prev) => {
                                  const next = new Set(prev);
                                  next.delete(version.id);
                                  return next;
                                });
                              }}
                              className="block text-ct-muted hover:text-ct-muted transition-colors mt-0.5"
                            >
                              show less
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI area — notes + adjustments */}
      {currentBlock && (
        <div className="mt-6 rounded-[--radius-md] bg-ct-cream p-4 space-y-4">
          {/* Analysis */}
          {aiNotes?.generation_reasoning ? (
            <div>
              <label className="ct-label">
                Analysis
              </label>
              <div className="text-xs text-ct-muted space-y-2">
                <p>{aiNotes.generation_reasoning}</p>
                {aiNotes.suggestions && aiNotes.suggestions.length > 0 && (
                  <div>
                    <p className="font-medium text-ct-muted mb-1">
                      Suggestions:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {aiNotes.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="ct-btn ct-btn-secondary text-xs disabled:opacity-30"
            >
              {analyzing ? <>Analyzing<AnimatedEllipsis /></> : "Get Feedback"}
            </button>
          )}

          {/* Adjustments */}
          <div>
            <label className="ct-label">
              Adjustments
            </label>
            <textarea
              id="feedback-prompt"
              name="feedback-prompt"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleFeedbackKeyDown}
              placeholder='e.g., "Make it shorter", "More casual tone", "Emphasize the guarantee"'
              rows={2}
              maxLength={1000}
              className="ct-input resize-none"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-ct-rule">
                {typeof navigator !== "undefined" &&
                navigator.platform?.includes("Mac")
                  ? "⌘"
                  : "Ctrl"}
                +Enter to regenerate
              </span>
              <button
                onClick={handleGenerate}
                disabled={generating || !feedback.trim() || !canGenerate}
                className="ct-btn ct-btn-primary disabled:opacity-30"
              >
                {generating ? <>Working<AnimatedEllipsis /></> : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !softLimit && (
        <p className="mt-3 text-sm text-ct-strike">{error}</p>
      )}

      {softLimit && (
        <div className="mt-4 rounded-[--radius-md] border border-ct-rule bg-ct-cream p-4 text-sm text-ct-muted space-y-2">
          <p>
            You&apos;ve hit today&apos;s generation limit. This tool is a free
            project by <strong>Bit Lore</strong>, a custom web development
            studio in Portland.
          </p>
          <p>
            If you&apos;re finding this useful, or if you need help building the
            site this content is going to live on, I&apos;d love to hear from
            you.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a
              href="mailto:hello@bitlore.io"
              className="ct-btn ct-btn-primary text-xs"
            >
              Get in touch
            </a>
            <a
              href="https://bitlore.io"
              className="text-xs text-ct-muted hover:text-ct-ink transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              bitlore.io
            </a>
          </div>
        </div>
      )}

      {serviceDown && (
        <ServiceUnavailable onDismiss={() => setServiceDown(false)} />
      )}
    </div>
  );
}

function docToPlainText(doc: TipTapDoc): string {
  return doc.content
    .map((node) =>
      (node.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join(""),
    )
    .join("\n");
}

function getContentLines(block: CopyBlock): string[] {
  const doc = block.content as TipTapDoc;
  const text = docToPlainText(doc);
  return text.split("\n").filter((l) => l.trim().length > 0);
}
