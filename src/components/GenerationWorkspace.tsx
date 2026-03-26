"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import {
  ComponentEditor,
  type ComponentEditorHandle,
} from "@/components/ComponentEditor";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { Button } from "@/components/Button";
import { AnimatedEllipsis } from "@/components/AnimatedEllipsis";
import { CONTENT_CATEGORIES, CATEGORY_KEYS } from "@/lib/component-types";
import { slugify, uniqueSlug } from "@/lib/slugify";
import type { TipTapDoc } from "@/lib/tiptap-utils";
import { withViewTransition } from "@/lib/view-transition";
import {
  saveCopyBlock,
  saveCopyBlockWithSync,
  deleteCopyBlock,
  deleteCopyBlockWithSync,
  incrementGenerationCount,
  getSession,
  getActiveBlockForContext,
  setActiveBlockForContext,
  saveDraft,
  getDraft,
  type BrandContext,
  type CopyBlock,
} from "@/lib/session-storage";

function getDocumentKey(block: CopyBlock): string {
  return `${block.component_type}::${(block.user_prompt || "").trim().toLowerCase()}`;
}

interface DocumentGroup {
  key: string;
  title: string;
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
      title: latest.title || "",
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
  blockId: string | null;
  onBlockChange: (blockId: string | null) => void;
  form: BrandContext;
  canGenerate: boolean;
  ensureContext: () => Promise<BrandContext | null>;
  onGenerate?: () => void;
  isAuthenticated?: boolean;
  userEmail?: string | null;
  onSyncStatus?: (status: "saving" | "saved" | "error") => void;
  onConfirm?: (message: string, onConfirm: () => void) => void;
  /** When true, hide the workspace UI but keep mounted for portal/state */
  hidden?: boolean;
  /** DOM element where the document picker should be portaled */
  pickerSlot?: HTMLDivElement | null;
}

interface AiNotes {
  generation_reasoning?: string;
  suggestions?: string[];
}

export function GenerationWorkspace({
  context,
  blockId,
  onBlockChange,
  form,
  canGenerate,
  ensureContext,
  onGenerate,
  isAuthenticated = false,
  userEmail,
  onSyncStatus,
  onConfirm,
  hidden = false,
  pickerSlot,
}: GenerationWorkspaceProps) {
  const [generating, setGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [copied, setCopied] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const categoryRef = useRef<HTMLDivElement>(null);
  const ignoreNextChangeRef = useRef(false);
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

  // All active-block changes go through onBlockChange, which updates the
  // hash and syncs to sessionStorage in the parent.
  function setActiveBlock(id: string | null) {
    onBlockChange(id);
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

  // Resolve the slug from the hash to a full block ID against current history.
  // "new" is treated as null (show +New form). Falls back to startsWith for
  // legacy blocks that may still be referenced by short UUID prefixes.
  const resolvedBlockId =
    blockId === "new"
      ? null
      : blockId
        ? (history.find((b) => b.slug === blockId)?.id ??
          history.find((b) => b.id.startsWith(blockId))?.id ??
          blockId)
        : null;

  const [currentBlock, setCurrentBlock] = useState<CopyBlock | null>(() => {
    if (!context) return null;
    return getActiveBlockForContext(context.id);
  });
  const [category, setCategory] = useState(() => {
    if (!context) return "general";
    const block = getActiveBlockForContext(context.id);
    if (block) return block.component_type;
    const draft = getDraft(context.id);
    return draft?.category ?? "general";
  });
  const [userPrompt, setUserPrompt] = useState(() => {
    if (!context) return "";
    const block = getActiveBlockForContext(context.id);
    if (block) return block.user_prompt ?? "";
    const draft = getDraft(context.id);
    return draft?.user_prompt ?? "";
  });
  const [aiNotes, setAiNotes] = useState<AiNotes | null>(() => {
    if (!context) return null;
    const block = getActiveBlockForContext(context.id);
    return (block?.ai_notes as AiNotes | null) ?? null;
  });

  // Constraint state — optional max character limit, user-adjustable.
  const [maxChars, setMaxChars] = useState<number | undefined>(() => {
    if (!context) return undefined;
    const block = getActiveBlockForContext(context.id);
    if (block) return block.max_chars;
    const draft = getDraft(context.id);
    return draft?.max_chars;
  });

  const [constraintWarning, setConstraintWarning] = useState<string | null>(
    null,
  );

  const [feedback, setFeedback] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set(),
  );

  // Save the draft on page unload so "+New" form values survive refresh.
  // Navigation state is now in the URL hash, but draft text still needs
  // persisting to sessionStorage. We use a ref-to-latest pattern so the
  // handler reads current values without re-registering the listener.
  const draftRef = useRef({
    context,
    currentBlock,
    category,
    userPrompt,
    maxChars,
  });
  draftRef.current = {
    context,
    currentBlock,
    category,
    userPrompt,
    maxChars,
  };

  // Close category dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        categoryRef.current &&
        !categoryRef.current.contains(e.target as Node)
      ) {
        setCategoryOpen(false);
      }
    }
    if (categoryOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [categoryOpen]);

  useEffect(() => {
    function handleBeforeUnload() {
      const {
        context: ctx,
        currentBlock: block,
        category: cat,
        userPrompt: prompt,
        maxChars: mc,
      } = draftRef.current;
      if (ctx && !block) {
        saveDraft(ctx.id, {
          category: cat,
          user_prompt: prompt,
          max_chars: mc,
        });
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

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

  // Restore state when context changes, or clear when context is null (new profile).
  // Saves the current draft prompt before switching so it persists across
  // profile switches and tab closes (sessionStorage).
  const restoredContextRef = useRef<string | null>(null);
  useEffect(() => {
    // Save draft from the previous context before switching
    const prevId = restoredContextRef.current;
    if (prevId && !currentBlock) {
      saveDraft(prevId, {
        category,
        user_prompt: userPrompt,
        max_chars: maxChars,
      });
    }

    if (!context) {
      restoredContextRef.current = null;
      setHistory([]);
      setCurrentBlock(null);
      setCategory("general");
      setUserPrompt("");
      setMaxChars(undefined);
      setAiNotes(null);
      setFeedback("");
      setCanSave(false);
      setShowVersions(false);
      setConstraintWarning(null);
      return;
    }
    if (restoredContextRef.current === context.id) return;
    restoredContextRef.current = context.id;
    const session = getSession();
    const blocks = session.copy_blocks.filter(
      (b) => b.brand_context_id === context.id,
    );
    setHistory(blocks);

    // Resolve which block to show. The hash's blockId (slug) takes
    // priority; if null/new, fall back to sessionStorage, then +New.
    let resolvedBlock: CopyBlock | null = null;
    if (blockId && blockId !== "new") {
      resolvedBlock =
        blocks.find((b) => b.slug === blockId) ??
        blocks.find((b) => b.id.startsWith(blockId)) ??
        null;
    }
    if (!resolvedBlock && !blockId) {
      // No block in hash — check sessionStorage fallback
      resolvedBlock = getActiveBlockForContext(context.id);
      if (resolvedBlock && resolvedBlock.brand_context_id === context.id) {
        // Sync hash to match the resolved block
        onBlockChange(resolvedBlock.id);
      } else {
        resolvedBlock = null;
      }
    }

    if (resolvedBlock) {
      ignoreNextChangeRef.current = true;
      setCurrentBlock(resolvedBlock);
      setCategory(resolvedBlock.component_type);
      setUserPrompt(resolvedBlock.user_prompt ?? "");
      setMaxChars(resolvedBlock.max_chars);
      setAiNotes((resolvedBlock.ai_notes as AiNotes | null) ?? null);
    } else {
      setCurrentBlock(null);
      setAiNotes(null);
      // Restore draft prompt for this profile's +New form
      const draft = getDraft(context.id);
      const draftCat = draft?.category ?? "general";
      setCategory(draftCat);
      setUserPrompt(draft?.user_prompt ?? "");
      setMaxChars(draft?.max_chars);
      onBlockChange(null);
    }
    setCanSave(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  // Block-change effect: responds to hash changes from browser back/forward.
  // The context-switch effect handles initial load; this handles in-profile
  // navigation where the context stays the same but the block segment changes.
  useEffect(() => {
    if (!context) return;
    const currentId = currentBlock?.id ?? null;
    if (resolvedBlockId === currentId) return;

    if (resolvedBlockId === null) {
      // Navigated back to +New form
      saveDraftIfNeeded();
      setCurrentBlock(null);
      setAiNotes(null);
      const draft = getDraft(context.id);
      const draftCat = draft?.category ?? "general";
      setCategory(draftCat);
      setUserPrompt(draft?.user_prompt ?? "");
      setMaxChars(draft?.max_chars);
      setFeedback("");
      setCanSave(false);
      setShowVersions(false);
      setConstraintWarning(null);
    } else {
      const block = history.find((b) => b.id === resolvedBlockId);
      if (block) {
        loadBlockInternal(block);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedBlockId]);

  // Internal block loader — sets all block-related state without triggering
  // onBlockChange (which would create a circular update). Used by the
  // blockId-change effect for back/forward navigation.
  function loadBlockInternal(block: CopyBlock, { markDirty = false } = {}) {
    if (!markDirty) ignoreNextChangeRef.current = true;
    setCurrentBlock(block);
    setCategory(block.component_type);
    setUserPrompt(block.user_prompt ?? "");
    setMaxChars(block.max_chars);
    setAiNotes(block.ai_notes as AiNotes | null);
    setFeedback("");
    setCanSave(markDirty);
    setConstraintWarning(null);
  }

  async function handleGenerate() {
    const isRefining = !!currentBlock && !!feedback.trim();
    if (!isRefining && !userPrompt.trim()) return;
    if (!canGenerate) return;
    setGenerating(true);
    // Only stream fresh generations — refinement keeps the editor visible
    // with a spinner, since wiping and rewriting feels like starting over.
    const shouldStream = !isRefining;
    if (shouldStream) {
      setIsStreaming(true);
      setStreamText("");
    }
    setError(null);
    setSoftLimit(false);
    setConstraintWarning(null);

    // On a fresh generation, set a placeholder block so the UI switches
    // from the +New form (category/prompt) to the block view (editor area)
    // before streaming starts. The placeholder is never persisted — it's
    // replaced by the real block on completion.
    if (!isRefining) {
      setCurrentBlock({
        id: "__streaming__",
        slug: "",
        brand_context_id: context!.id,
        component_type: category,
        user_prompt: userPrompt,
        content: { type: "doc", content: [] },
        ai_notes: null,
        version: 1,
        created_at: new Date().toISOString(),
      });
    }

    // Auto-save current RTE content as a version before regenerating.
    let updatedHistory = history;
    if (isRefining && currentBlock) {
      const snapshot: CopyBlock = {
        ...currentBlock,
        id: crypto.randomUUID(),
        slug: currentBlock.slug,
        version: (currentBlock.version ?? 1) + 1,
        created_at: new Date().toISOString(),
      };
      saveCopyBlock(snapshot);
      syncBlock(snapshot);
      updatedHistory = [snapshot, ...history];
      setHistory(updatedHistory);
    }

    try {
      const ctx = await ensureContext();
      if (!ctx) {
        setError("Please fill in all required brand fields first.");
        setGenerating(false);
        if (shouldStream) setIsStreaming(false);
        if (!isRefining) setCurrentBlock(null);
        return;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          user_prompt: userPrompt,
          voice_profile: ctx.voice_profile,
          business_name: ctx.business_name,
          source_content: ctx.source_content,
          turnstile_token: turnstileTokenRef.current,
          ...(maxChars !== undefined && { max_chars: maxChars }),
          ...(isRefining && {
            feedback: feedback.trim(),
            current_copy: docToPlainText(currentBlock!.content as TipTapDoc),
          }),
        }),
      });

      // Non-streaming error responses (rate limit, validation) come back as
      // regular JSON with a non-200 status. Handle them before trying to read
      // the SSE stream.
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

      // ── Read the SSE stream ─────────────────────────────────
      // We use getReader() + manual SSE line parsing rather than EventSource
      // because EventSource only supports GET requests — we need POST.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // rAF batching: accumulate delta text between animation frames
      // to avoid one React render per token (~100+/sec). Instead we
      // flush once per frame (~60fps) — a 40x reduction in renders.
      let deltaBuffer = "";
      let rafId: number | null = null;

      function flushDeltaBuffer() {
        if (deltaBuffer) {
          const chunk = deltaBuffer;
          deltaBuffer = "";
          setStreamText((prev) => prev + chunk);
        }
        rafId = null;
      }

      let sseBuffer = "";
      interface StreamComplete {
        title: string;
        content: TipTapDoc;
        ai_notes: { generation_reasoning: string; suggestions: string[] };
        max_chars?: number;
        constraint_warning?: string;
      }
      let completeData: StreamComplete | null = null;
      // Tracks errors from SSE error events so we can propagate them
      // after cleaning up the reader — avoids fragile string matching.
      let streamError: Error | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);
            if (!json) continue;

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(json);
            } catch {
              // Malformed JSON line — skip it
              continue;
            }

            if (event.type === "delta") {
              if (shouldStream) {
                deltaBuffer += event.text;
                if (!rafId) {
                  rafId = requestAnimationFrame(flushDeltaBuffer);
                }
              }
            } else if (event.type === "complete") {
              completeData = event as unknown as StreamComplete;
            } else if (event.type === "error") {
              if (event.service_unavailable === "spend_limit") {
                setServiceDown(true);
              }
              streamError = new Error((event.error as string) || "Generation failed");
            }
          }
        }
      } finally {
        // Always close the reader and clean up the rAF — whether the
        // loop completed normally, threw, or hit a stream error.
        reader.cancel();
        if (rafId) cancelAnimationFrame(rafId);
        flushDeltaBuffer();
      }

      if (streamError) throw streamError;

      if (!completeData) {
        throw new Error("Stream ended without completion data");
      }

      // ── Finalize: same post-response logic as before ────────
      // setIsStreaming(false) must come AFTER all state updates.
      // setActiveBlock triggers onBlockChange → URL hash update →
      // resolvedBlockId change → block-change effect. If the new block
      // isn't in history yet when that effect runs, it won't find it.
      // Batching everything before the streaming flag ensures one clean render.
      incrementGenerationCount();

      if (completeData.constraint_warning) {
        setConstraintWarning(completeData.constraint_warning);
      }

      const blockSlug = uniqueSlug(
        slugify(completeData.title || category),
        updatedHistory.map((b) => b.slug).filter(Boolean),
      );

      const block: CopyBlock = {
        id: crypto.randomUUID(),
        slug: blockSlug,
        brand_context_id: ctx.id,
        component_type: category,
        title: completeData.title || "",
        user_prompt: userPrompt,
        content: completeData.content,
        ai_notes: completeData.ai_notes,
        ...(maxChars !== undefined && { max_chars: maxChars }),
        version: 1,
        created_at: new Date().toISOString(),
      };

      saveCopyBlock(block);
      syncBlock(block);
      setHistory((prev) => [block, ...prev]);
      setActiveBlock(block.id);
      ignoreNextChangeRef.current = true;
      setCurrentBlock(block);
      setAiNotes(completeData.ai_notes);
      setUserPrompt(block.user_prompt ?? "");
      setFeedback("");
      setCanSave(false);
      onGenerate?.();
    } catch (err) {
      // If we set a placeholder block for a fresh generation, clear it
      // so the UI falls back to the +New form.
      if (!isRefining) {
        setCurrentBlock(null);
      }
      if (err instanceof Error && err.message === "service_unavailable") {
        setServiceDown(true);
      } else {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setGenerating(false);
      setIsStreaming(false);
      turnstileRef.current?.reset();
    }
  }

  const handleContentChange = useCallback(
    (json: TipTapDoc) => {
      if (!currentBlock) return;
      const updated = { ...currentBlock, content: json };
      setCurrentBlock(updated);
      if (ignoreNextChangeRef.current) {
        ignoreNextChangeRef.current = false;
      } else {
        setCanSave(true);
      }
      saveCopyBlock(updated);
      syncBlock(updated);
    },
    // syncBlock is stable (depends on isAuthenticated/onSyncStatus from props,
    // not on state that changes per-keystroke), so including it here is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentBlock],
  );

  function saveDraftIfNeeded() {
    if (!currentBlock && context) {
      saveDraft(context.id, {
        category,
        user_prompt: userPrompt,
        max_chars: maxChars,
      });
    }
  }

  function loadBlock(block: CopyBlock, { markDirty = false } = {}) {
    saveDraftIfNeeded();
    withViewTransition(() => {
      setActiveBlock(block.id);
      loadBlockInternal(block, { markDirty });
    });
  }

  async function handleCopy() {
    if (!currentBlock) return;
    if (editorRef.current?.isSourceView()) {
      const html = editorRef.current?.getHTML();
      if (html) await navigator.clipboard.writeText(html);
    } else {
      const text = docToPlainText(currentBlock.content as TipTapDoc);
      await navigator.clipboard.writeText(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
      slug: currentBlock.slug, // versions share the same URL slug
      ai_notes: null,
      version: (currentBlock.version ?? 1) + 1,
      created_at: new Date().toISOString(),
    };
    saveCopyBlock(newBlock);
    syncBlock(newBlock);
    setActiveBlock(newBlock.id);
    ignoreNextChangeRef.current = true;
    setCurrentBlock(newBlock);
    setAiNotes(null);
    setCanSave(false);
    // Find the previous version of this document (most recent in history with same key)
    const docKey = getDocumentKey(newBlock);
    const previousVersion = history.find((b) => getDocumentKey(b) === docKey);
    setHistory((prev) => [newBlock, ...prev]);
    handleAnalyze(newBlock, previousVersion);
  }

  function executeDeleteBlock() {
    if (!currentBlock) return;

    const docKey = getDocumentKey(currentBlock);
    const toDelete = history.filter((b) => getDocumentKey(b) === docKey);
    const remaining = history.filter((b) => getDocumentKey(b) !== docKey);

    for (const block of toDelete) {
      deleteCopyBlock(block.id);
      syncDeleteBlock(block.id);
    }

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

  async function handleAnalyze(block?: CopyBlock, previousBlock?: CopyBlock) {
    const target = block ?? currentBlock;
    if (!target || !context) return;
    setAnalyzing(true);

    try {
      const currentText = docToPlainText(target.content as TipTapDoc);
      const previousText = previousBlock
        ? docToPlainText(previousBlock.content as TipTapDoc)
        : undefined;
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_copy: currentText,
          previous_copy: previousText,
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
      const updated = { ...target, ai_notes: notes };
      setCurrentBlock(updated);
      saveCopyBlock(updated);
      syncBlock(updated);
    } catch {
      // Auto-analyze failures are non-blocking — the save already succeeded
    } finally {
      setAnalyzing(false);
      turnstileRef.current?.reset();
    }
  }

  // Document picker pills — rendered via portal into the nav bar
  const documentPicker = (
    <>
      {documentGroups.map((group) => {
        const isActive = activeDocKey === group.key;
        return (
          <div
            key={group.key}
            className={`relative shrink-0 rounded-t-[4px] text-xs border h-[30px] mt-1 transition-colors ${
              isActive
                ? "bg-ct-paper text-ct-ink border-ct-rule border-b-transparent"
                : "bg-ct-cream text-ct-muted hover:bg-ct-rule hover:text-ct-ink border-transparent border-b-ct-rule"
            }`}
          >
            <button
              onClick={() => {
                loadBlock(group.latest);
                setShowVersions(false);
              }}
              className="pl-3 pr-7 h-full rounded-t-[4px] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span className="font-medium">{group.title || group.label}</span>
            </button>
            <button
              onClick={() => {
                const docKey = group.key;
                if (onConfirm) {
                  onConfirm("Delete this block and all its versions?", () => {
                    const toDelete = history.filter(
                      (b) => getDocumentKey(b) === docKey,
                    );
                    const remaining = history.filter(
                      (b) => getDocumentKey(b) !== docKey,
                    );
                    for (const block of toDelete) {
                      deleteCopyBlock(block.id);
                      syncDeleteBlock(block.id);
                    }
                    setHistory(remaining);
                    if (isActive) {
                      setActiveBlock(null);
                      setCurrentBlock(null);
                      setAiNotes(null);
                      setCategory("general");
                      setUserPrompt("");
                      setFeedback("");
                    }
                  });
                }
              }}
              className={`absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full transition-colors cursor-pointer ${
                isActive
                  ? "text-ct-rule hover:text-ct-strike hover:bg-ct-strike/10"
                  : "opacity-0 pointer-events-none"
              }`}
              aria-label={`Delete ${group.title || group.label}`}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
            </button>
          </div>
        );
      })}
      <button
        onClick={() => {
          setCurrentBlock(null);
          setActiveBlock(null);
          const draft = context ? getDraft(context.id) : null;
          const draftCat = draft?.category ?? "general";
          if (context) {
            saveDraft(context.id, {
              category: draftCat,
              user_prompt: draft?.user_prompt ?? "",
              max_chars: draft?.max_chars,
            });
          }
          setCategory(draftCat);
          setUserPrompt(draft?.user_prompt ?? "");
          setMaxChars(draft?.max_chars);
          setFeedback("");
          setAiNotes(null);
          setCanSave(false);
          setShowVersions(false);
          setConstraintWarning(null);
        }}
        className={`shrink-0 rounded-t-[4px] px-3 text-xs font-ui border h-[30px] mt-1 flex items-center transition-colors ${
          !currentBlock
            ? "bg-ct-paper text-ct-ink border-ct-rule border-b-transparent"
            : "border-dashed border-ct-rule text-ct-muted hover:text-ct-ink hover:border-ct-muted bg-transparent border-b-solid border-b-ct-rule"
        }`}
      >
        + New
      </button>
    </>
  );

  return (
    <div>
      <Turnstile
        ref={turnstileRef}
        onToken={(token) => {
          turnstileTokenRef.current = token;
        }}
      />

      {/* Portal document picker into the nav bar slot */}
      {pickerSlot && createPortal(documentPicker, pickerSlot)}

      {/* Everything below is hidden when the profile form is open */}
      {!hidden && (
        <>
          {/* Category + Prompt */}
          <div className="mt-2 mb-6 pb-6 space-y-4">
            {!currentBlock && (
              <>
                <label className="ct-label pb-3">Settings</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div ref={categoryRef} className="relative">
                    <button
                      onClick={() => setCategoryOpen((prev) => !prev)}
                      className="flex items-center gap-1.5 text-base font-semibold font-ui text-ct-ink hover:text-ct-accent border border-ct-rule rounded-[--radius-md] px-3 py-1.5 transition-colors cursor-pointer"
                    >
                      {CONTENT_CATEGORIES[category]?.label ?? category}
                      <ChevronDown
                        size={14}
                        className={`text-ct-muted transition-transform ${categoryOpen ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                    {categoryOpen && (
                      <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-ct-paper border border-ct-rule rounded-[--radius-md] shadow-md z-30 py-1">
                        {CATEGORY_KEYS.map((key) => (
                          <button
                            key={key}
                            onClick={() => {
                              setCategory(key);
                              setMaxChars(undefined);
                              setCategoryOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-sm font-ui transition-colors ${
                              category === key
                                ? "text-ct-ink font-medium bg-ct-cream"
                                : "text-ct-muted hover:text-ct-ink hover:bg-ct-cream"
                            }`}
                          >
                            {CONTENT_CATEGORIES[key].label}
                          </button>
                        ))}
                        <div className="border-t border-ct-rule my-1" />
                        <div className="px-3 py-1.5">
                          <input
                            id="custom-category"
                            name="custom-category"
                            type="text"
                            value={customCategory}
                            onChange={(e) => setCustomCategory(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customCategory.trim()) {
                                setCategory(customCategory.trim());
                                setMaxChars(undefined);
                                setCustomCategory("");
                                setCategoryOpen(false);
                              }
                            }}
                            placeholder="Custom…"
                            className="w-full text-sm font-ui bg-transparent border-b border-ct-rule text-ct-ink placeholder:text-ct-rule focus:outline-none focus:border-ct-muted py-0.5"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-ct-muted flex-1 basis-48">
                    {CONTENT_CATEGORIES[category]?.guidance ??
                      "Follow the user's prompt closely."}
                  </span>
                  <label className="shrink-0 flex items-center gap-1.5 text-xs text-ct-muted">
                    Max chars
                    <input
                      id="max-chars"
                      name="max-chars"
                      type="number"
                      min={1}
                      value={maxChars ?? ""}
                      onChange={(e) =>
                        setMaxChars(
                          e.target.value ? Number(e.target.value) : undefined,
                        )
                      }
                      className="w-16 py-1.5 px-2 text-sm bg-transparent border border-ct-rule rounded-[--radius-md] text-ct-ink focus:outline-none focus:border-ct-muted"
                      placeholder="—"
                    />
                  </label>
                </div>
              </>
            )}

            <div>
              {currentBlock ? (
                <details className="group" open>
                  <summary className="cursor-pointer list-none flex items-center gap-1.5 pb-4">
                    <span className="ct-label !mb-0">Prompt</span>
                    <ChevronDown
                      size={16}
                      className="text-ct-muted group-open:rotate-180"
                    />
                  </summary>
                  <p className="text-sm text-ct-muted whitespace-pre-line pb-2">
                    {userPrompt}
                  </p>
                </details>
              ) : (
                <label htmlFor="user-prompt" className="ct-label py-3">Prompt</label>
              )}
              {!currentBlock && (
                <textarea
                  id="user-prompt"
                  name="user-prompt"
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='What do you need? e.g., "Write a hero headline that emphasizes our fast turnaround"'
                  rows={3}
                  maxLength={4000}
                  className="ct-input resize-none"
                />
              )}
            </div>

            {!currentBlock && (
              <div className="flex items-center justify-end">
                <Button
                  variant="primary"
                  onClick={handleGenerate}
                  disabled={generating || !userPrompt.trim() || !canGenerate}
                >
                  {generating ? (
                    <>
                      Generating
                      <AnimatedEllipsis />
                    </>
                  ) : (
                    "Generate"
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Streaming overlay — shows text as it arrives from the LLM.
              Rendered in a plain div (not TipTap) to avoid ProseMirror
              rebuilding its document tree on every token. Styled to match
              the editor surface so the transition feels seamless. */}
          {isStreaming && (
            <div className="rounded-[--radius-lg] bg-white dark:bg-ct-cream shadow-[var(--shadow-md)]">
              <div className="prose dark:prose-invert max-w-none px-8 pt-12 pb-18 min-h-[8rem] whitespace-pre-wrap">
                {streamText}
                <span className="inline-block w-[2px] h-[1.1em] bg-ct-accent align-text-bottom animate-pulse" />
              </div>
            </div>
          )}

          {/* Output — Editor (full width). Hidden during streaming since the
              overlay occupies the same visual role. */}
          {currentBlock && !isStreaming && (
            <div className="space-y-4 animate-fade-in">
              <ComponentEditor
                ref={editorRef}
                content={currentBlock.content as TipTapDoc}
                onChange={handleContentChange}
                maxChars={maxChars}
                onConstraintsChange={(mc) => setMaxChars(mc)}
                singleLine={CONTENT_CATEGORIES[category]?.singleLine}
                editable={!isStreaming}
              />

              {constraintWarning && (
                <div className="flex items-center justify-between rounded-[--radius-md] border border-ct-highlight/30 bg-ct-highlight/10 px-3 py-2 text-xs text-ct-highlight">
                  <span>{constraintWarning}</span>
                  <button
                    onClick={() => setConstraintWarning(null)}
                    className="ml-2 text-ct-highlight/60 hover:text-ct-highlight transition-colors"
                  >
                    dismiss
                  </button>
                </div>
              )}

              {/* Actions — ghost-style links */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopy}
                  className="text-xs font-ui text-ct-muted hover:text-ct-ink transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={handleDownloadMarkdown}
                  className="text-xs font-ui text-ct-muted hover:text-ct-ink transition-colors"
                >
                  Download .md
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveVersion}
                  disabled={!canSave}
                  className="ml-auto disabled:opacity-40 disabled:cursor-default"
                >
                  Save Version
                </Button>
              </div>

              {/* Version History */}
              {activeGroup && (
                <div>
                  <button
                    onClick={() => setShowVersions(!showVersions)}
                    className="text-xs text-ct-muted hover:text-ct-ink transition-colors"
                  >
                    Version {activeGroup.versions.length - activeVersionIndex}{" "}
                    of {activeGroup.versions.length} {showVersions ? "▼" : "▶"}
                  </button>
                  {showVersions && (
                    <ol className="mt-2 space-y-1 list-none p-0 m-0">
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
                          <li
                            key={version.id}
                            onClick={() =>
                              loadBlock(version, { markDirty: true })
                            }
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
                              <span className="text-ct-muted ml-2">
                                {relativeTime(version.created_at)}
                              </span>
                            </div>
                            <div className="mt-0.5">
                              {visibleLines.length === 0 && (
                                <span className="text-ct-muted">(empty)</span>
                              )}
                              {visibleLines.map((line, li) => (
                                <div key={li} className="text-ct-muted">
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
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI area — notes + adjustments */}
          {currentBlock && (
            <div className="mt-6 rounded-[--radius-md] bg-ct-cream p-4 space-y-4">
              {/* Analysis */}
              {analyzing ? (
                <p className="text-xs text-ct-muted">
                  Analyzing
                  <AnimatedEllipsis />
                </p>
              ) : aiNotes?.generation_reasoning ? (
                <div>
                  <label className="ct-label">Analysis</label>
                  <div className="text-xs text-ct-ink space-y-2">
                    <p>{aiNotes.generation_reasoning}</p>
                    {aiNotes.suggestions && aiNotes.suggestions.length > 0 && (
                      <div>
                        <p className="font-medium text-ct-ink mb-1">
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
              ) : null}

              {/* Adjustments */}
              <div>
                <label htmlFor="feedback-prompt" className="ct-label">Adjustments</label>
                <textarea
                  id="feedback-prompt"
                  name="feedback-prompt"
                  disabled={generating}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={handleFeedbackKeyDown}
                  placeholder='e.g., "Make it shorter", "More casual tone", "Emphasize the guarantee"'
                  rows={2}
                  maxLength={1000}
                  className="ct-input resize-none"
                />
                <div className="flex items-center justify-end mt-1.5">
                  <Button
                    variant="primary"
                    onClick={handleGenerate}
                    disabled={generating || !feedback.trim() || !canGenerate}
                  >
                    {generating ? (
                      <>
                        Working
                        <AnimatedEllipsis />
                      </>
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {error && !softLimit && (
            <p className="mt-3 text-sm text-ct-strike">{error}</p>
          )}

          {softLimit && <SoftLimitCard userEmail={userEmail} />}

          {serviceDown && (
            <ServiceUnavailable onDismiss={() => setServiceDown(false)} />
          )}
        </>
      )}
    </div>
  );
}

function SoftLimitCard({ userEmail }: { userEmail?: string | null }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, message: message.trim() }),
      });
      if (!res.ok) throw new Error();
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mt-4 rounded-[--radius-md] border border-ct-rule bg-ct-cream p-4 text-sm text-ct-muted space-y-3">
      <p>
        You&apos;ve hit today&apos;s generation limit. This tool is a free
        project by <strong>Bit Lore</strong>, a custom web development studio in
        Portland.
      </p>
      {status === "sent" ? (
        <p className="text-ct-ink font-medium">
          Message sent — I&apos;ll be in touch.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          <p>
            If you&apos;re finding this useful, or if you need help building the
            site this content is going to live on, I&apos;d love to hear from
            you.
          </p>
          <textarea
            id="contact-message"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What are you working on?"
            maxLength={2000}
            rows={3}
            className="ct-input text-sm w-full resize-none"
          />
          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" type="submit" disabled={!message.trim() || status === "sending"}>
              {status === "sending" ? "Sending…" : "Send"}
            </Button>
            <a
              href="https://bitlore.io"
              className="text-xs text-ct-muted hover:text-ct-ink transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              bitlore.io
            </a>
            {status === "error" && (
              <span className="text-xs text-ct-strike">
                Something went wrong — try again.
              </span>
            )}
          </div>
        </form>
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
