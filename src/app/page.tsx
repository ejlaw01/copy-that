"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AnimatedEllipsis } from "@/components/AnimatedEllipsis";
import { GenerationWorkspace } from "@/components/GenerationWorkspace";
import { SavePrompt } from "@/components/SavePrompt";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { supabase } from "@/lib/supabase/client";
import { useHashRoute } from "@/lib/use-hash-route";
import { slugify, uniqueSlug } from "@/lib/slugify";
import {
  getSession,
  setSession,
  getActiveContext,
  setActiveContext,
  setActiveBlockForContext,
  getGenerationCount,
  getSessionUserId,
  setSessionUserId,
  clearSessionUserId,
  newContextId,
  saveBrandContextWithSync,
  deleteBrandContextWithSync,
  type BrandContext,
  type CopyBlock,
} from "@/lib/session-storage";

const ANON_GENERATION_LIMIT = 6;
const MAX_PROFILES = 10;

const AUDIENCE_SUGGESTIONS = [
  "Small business owners",
  "Startups & founders",
  "Creative professionals",
  "Enterprise teams",
  "Local customers",
  "Online shoppers",
  "Tech-savvy users",
  "Gen Z / millennials",
];

const TONE_SUGGESTIONS = [
  "Professional",
  "Friendly",
  "Bold",
  "Casual",
  "Witty",
  "Minimal",
  "Luxurious",
  "Empathetic",
];

function emptyForm(): Partial<BrandContext> {
  return {
    id: newContextId(),
    slug: "",
    name: "",
    business_name: "",
    business_description: "",
    audience: "",
    tone: "",
    tone_examples: "",
    competitors: "",
    source_url: "",
    source_content: null,
    competitor_url: "",
    competitor_analysis: "",
    voice_profile: "",
  };
}

export default function Home() {
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const { route, navigate, replace } = useHashRoute();
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = !!userEmail;
  const isAuthenticatedRef = useRef(false);
  const [sessionIndicator, setSessionIndicator] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Wraps an async sync call with status transitions.
  // Sets 'saving' immediately, then 'saved' (auto-clears after 1.5s) or 'error'.
  function withSync(syncFn: () => Promise<{ syncError?: string }>) {
    setSyncStatus("saving");
    syncFn().then(({ syncError }) => {
      if (syncError) {
        setSyncStatus("error");
      } else {
        setSyncStatus("saved");
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => setSyncStatus("idle"), 1500);
      }
    });
  }

  // Profile panel state
  const [brandOpen, setBrandOpen] = useState(true);
  const [editing, setEditing] = useState(true); // true = form mode, false = read-only
  const [form, setForm] = useState<Partial<BrandContext>>(emptyForm);

  function update(fields: Partial<BrandContext>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  // Resolve slug from hash to a full context ID. The hash stores
  // human-readable slugs (e.g. `#/bit-lore`); we match them against
  // the contexts array once here so all downstream code uses full IDs.
  const activeTab = route.profileId === "new"
    ? "new"
    : route.profileId
      ? (contexts.find((c) => c.slug === route.profileId)?.id ?? route.profileId)
      : "new";
  const activeContext = activeTab !== "new"
    ? contexts.find((c) => c.id === activeTab) ?? null
    : null;

  // Helper: apply panel state for a profile switch (form, brandOpen, editing).
  // Extracted so both switchToProfile and bootstrap can reuse it.
  function applyProfilePanel(ctx: BrandContext) {
    setForm(ctx);
    setBrandOpen(false);
    setEditing(false);
  }

  // Switch to a profile tab
  function switchToProfile(id: string) {
    const ctx = contexts.find((c) => c.id === id);
    if (!ctx) return;
    navigate(ctx.slug);
    setActiveContext(id);
    applyProfilePanel(ctx);
  }

  // Switch to the + New tab
  function switchToNew() {
    if (contexts.length >= MAX_PROFILES) return;
    navigate("new");
    setForm(emptyForm());
    setBrandOpen(true);
    setEditing(true);
  }

  // Delete a profile
  function handleDelete(id: string) {
    const syncPromise = deleteBrandContextWithSync(id, isAuthenticated);
    if (isAuthenticated) withSync(() => syncPromise);

    const session = getSession();
    setContexts(session.brand_contexts);
    if (activeTab === id) {
      if (session.brand_contexts.length > 0) {
        const target = session.brand_contexts[0];
        navigate(target.slug);
        setActiveContext(target.id);
        applyProfilePanel(target);
      } else {
        navigate("new");
        setForm(emptyForm());
        setBrandOpen(true);
        setEditing(true);
      }
    }
  }

  // Save a new profile without generating a voice profile.
  // The voice profile is created lazily on first generation via ensureContext().
  function handleSaveNew() {
    if (!form.name) return;
    const slug = uniqueSlug(
      slugify(form.name),
      contexts.map((c) => c.slug),
    );
    const ctx = { ...form, slug } as BrandContext;
    setForm(ctx);
    const syncPromise = saveBrandContextWithSync(ctx, isAuthenticated);
    if (isAuthenticated) withSync(() => syncPromise);
    setContexts((prev) => [...prev, ctx]);
    navigate(ctx.slug);
    setActiveContext(ctx.id);
    setBrandOpen(false);
    setEditing(false);
    setSessionIndicator(true);
  }

  // Save edits to an existing profile (re-generate voice profile)
  async function handleSaveEdits() {
    if (!activeContext) return;
    const updated = { ...activeContext, ...form } as BrandContext;
    // Clear voice profile so it regenerates on next generate
    updated.voice_profile = "";
    const syncPromise = saveBrandContextWithSync(updated, isAuthenticated);
    if (isAuthenticated) withSync(() => syncPromise);
    setContexts((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setEditing(false);
  }

  // Helper: hydrate React state from a session-shaped object.
  // Uses `replace` so the hash reflects the active profile without
  // creating a spurious history entry.
  function hydrateFromSession(data: {
    brand_contexts: BrandContext[];
    copy_blocks?: CopyBlock[];
    active_context_id: string | null;
  }) {
    if (data.brand_contexts.length === 0) return;

    // Backfill slugs for legacy data (contexts without slugs)
    const existingCtxSlugs: string[] = [];
    for (const ctx of data.brand_contexts) {
      if (!ctx.slug) {
        ctx.slug = uniqueSlug(slugify(ctx.name), existingCtxSlugs);
      }
      existingCtxSlugs.push(ctx.slug);
    }

    // Backfill slugs for legacy blocks
    if (data.copy_blocks) {
      const existingBlockSlugs: string[] = [];
      for (const block of data.copy_blocks) {
        if (!block.slug) {
          block.slug = uniqueSlug(
            slugify(block.title || block.component_type),
            existingBlockSlugs,
          );
        }
        existingBlockSlugs.push(block.slug);
      }
    }

    // Persist backfilled slugs to sessionStorage so subsequent lookups
    // (e.g. onBlockChange resolving block slug from ID) see them.
    // setSession preserves existing active_block_per_context entries
    // and other session fields like generation_count and drafts.
    setSession({
      brand_contexts: data.brand_contexts,
      copy_blocks: data.copy_blocks ?? getSession().copy_blocks,
      active_context_id: data.active_context_id,
    });

    setContexts(data.brand_contexts);
    const active =
      data.brand_contexts.find((c) => c.id === data.active_context_id) ??
      data.brand_contexts[0];
    replace(active.slug);
    setActiveContext(active.id);
    setForm(active);
    setBrandOpen(false);
    setEditing(false);
    setSessionIndicator(true);
  }

  // Auth + data loading — runs once on mount.
  // Combines auth check, Supabase fetch (for authed users), and sessionStorage
  // restore (for anon users) into a single effect so there's one loading gate.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();

      if (cancelled) return;

      if (user) {
        setUserEmail(user.email ?? null);
        isAuthenticatedRef.current = true;
        setAuthChecked(true);

        // Skip-fetch optimization: if sessionStorage already has this user's
        // data (same tab, soft refresh), skip the API call. The stored user ID
        // acts as a cache key — if the user signed into a different account,
        // we clear and re-fetch.
        const storedUserId = getSessionUserId();
        if (storedUserId === user.id) {
          const session = getSession();
          if (session.brand_contexts.length > 0) {
            hydrateFromSession(session);
            setIsLoading(false);
            return;
          }
        }

        // Different user or no cached data — fetch from Supabase
        try {
          const res = await fetch("/api/data");
          if (res.ok) {
            const data = await res.json();
            if (cancelled) return;
            // Populate sessionStorage so subsequent soft refreshes skip the fetch
            setSession(data);
            setSessionUserId(user.id);
            hydrateFromSession(data);
          } else {
            console.error("[init] /api/data returned", res.status, await res.text().catch(() => ""));
          }
        } catch (err) {
          console.error("[init] /api/data fetch failed", err);
        }
      } else {
        setAuthChecked(true);
        clearSessionUserId();

        // Anonymous: restore from sessionStorage (existing behavior)
        const session = getSession();
        if (session.brand_contexts.length > 0) {
          hydrateFromSession(session);
        }
      }

      if (!cancelled) setIsLoading(false);
    }

    init();

    // Auth state change listener — handles sign-in/sign-out during the session.
    // The initial auth check above handles the page-load case; this listener
    // handles the magic-link-callback-in-same-tab case.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setUserEmail(session.user.email ?? null);
          isAuthenticatedRef.current = true;
          setShowSavePrompt(false);

          // Fetch server data first to decide whether migration is needed.
          // On re-sign-in the user already has data in Supabase — migrating
          // stale sessionStorage would INSERT duplicates (migrate uses INSERT,
          // not upsert, because it remaps client UUIDs to server-generated IDs).
          let serverData: { brand_contexts: BrandContext[]; copy_blocks: CopyBlock[]; active_context_id: string | null } | null = null;
          try {
            const res = await fetch("/api/data");
            if (res.ok) {
              serverData = await res.json();
            }
          } catch {
            // Network error — fall through, migration will be skipped too
          }

          // Only migrate if the account has no server data and we have
          // local anonymous data worth saving. This prevents the re-sign-in
          // duplication bug while still supporting first-time sign-in migration.
          if (serverData && serverData.brand_contexts.length === 0) {
            const sessionData = getSession();
            if (sessionData.brand_contexts.length > 0) {
              const consent = sessionStorage.getItem("copythat_marketing_consent");
              await fetch("/api/migrate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...sessionData,
                  marketing_consent: consent ? JSON.parse(consent) : true,
                }),
              });
              sessionStorage.removeItem("copythat_marketing_consent");

              // Re-fetch to pick up migrated data with server-generated IDs
              try {
                const postMigrateRes = await fetch("/api/data");
                if (postMigrateRes.ok) {
                  serverData = await postMigrateRes.json();
                }
              } catch {
                // Keep pre-migration serverData (empty)
              }
            }
          }

          // Hydrate from whatever server state we have
          if (serverData) {
            setSession(serverData);
            setSessionUserId(session.user.id);
            hydrateFromSession(serverData);
          }
        }
        if (event === "SIGNED_OUT") {
          setUserEmail(null);
          isAuthenticatedRef.current = false;
          clearSessionUserId();
          setSession({ brand_contexts: [], copy_blocks: [], active_context_id: null });
          setContexts([]);
          replace("new");
          setForm(emptyForm());
          setBrandOpen(true);
          setEditing(true);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Bootstrap effect — runs once after loading completes.
  // If the hash is empty (first visit or bookmark without hash), fall back
  // to sessionStorage's active context. If the hash references a deleted
  // profile, correct to first available or "new".
  useEffect(() => {
    if (isLoading) return;

    if (route.profileId === null) {
      // Empty hash — bootstrap from sessionStorage
      const stored = getActiveContext();
      if (stored && contexts.find((c) => c.id === stored.id)) {
        replace(stored.slug);
        applyProfilePanel(stored);
      } else if (contexts.length > 0) {
        replace(contexts[0].slug);
        applyProfilePanel(contexts[0]);
      }
      // else: no contexts, stay on "new"
    } else if (route.profileId === "new") {
      // Explicit #/new — make sure form is in new-profile mode
      setForm(emptyForm());
      setBrandOpen(true);
      setEditing(true);
    } else {
      // Hash has a profile ID — validate it resolved to a real context
      if (activeContext) {
        applyProfilePanel(activeContext);
      } else if (contexts.length > 0) {
        replace(contexts[0].slug);
        applyProfilePanel(contexts[0]);
      } else {
        replace("new");
        setForm(emptyForm());
        setBrandOpen(true);
        setEditing(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const checkSavePrompt = useCallback(() => {
    if (isAuthenticatedRef.current) return;
    const count = getGenerationCount();
    if (count >= ANON_GENERATION_LIMIT) {
      setShowSavePrompt(true);
    } else if (count === 1) {
      setSessionIndicator(true);
    }
  }, []);

  // Timer-based save prompt
  useEffect(() => {
    if (isAuthenticated || !activeContext) return;
    const timer = setTimeout(() => {
      if (!isAuthenticatedRef.current) setShowSavePrompt(true);
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, activeContext]);

  // Called by GenerationWorkspace before generating — ensures voice profile exists
  async function ensureContext(): Promise<BrandContext | null> {
    if (activeContext?.voice_profile) return activeContext;

    if (!form.name) {
      return null;
    }

    // Extract URLs if provided
    if (form.source_url) {
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: form.source_url, type: "source" }),
        });
        if (res.ok) {
          const data = await res.json();
          form.source_content = data;
        }
      } catch {
        // Non-blocking
      }
    }

    // Generate voice profile
    const voiceRes = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!voiceRes.ok) {
      const data = await voiceRes.json();
      if (data.service_unavailable === "spend_limit") {
        throw new Error("service_unavailable");
      }
      throw new Error("Failed to generate voice profile");
    }

    const data = await voiceRes.json();
    form.voice_profile = data.voice_profile;

    // Generate slug if this context doesn't have one yet (new profile
    // being auto-created during first generation via the +New form)
    if (!form.slug) {
      form.slug = uniqueSlug(
        slugify(form.name!),
        contexts.map((c) => c.slug),
      );
    }

    const ctx = form as BrandContext;
    const syncPromise = saveBrandContextWithSync(ctx, isAuthenticated);
    if (isAuthenticated) withSync(() => syncPromise);

    setContexts((prev) => {
      const idx = prev.findIndex((c) => c.id === ctx.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = ctx;
        return updated;
      }
      return [...prev, ctx];
    });
    navigate(ctx.slug);
    setActiveContext(ctx.id);
    setForm(ctx);
    setBrandOpen(false);
    setEditing(false);
    setSessionIndicator(true);

    return ctx;
  }

  const canGenerate = !!form.name;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-ct-rule">
        <h1 className="font-display text-lg font-semibold tracking-tight">Copy <span className="text-ct-accent">That</span></h1>
        <div className="flex items-center gap-3">
          {authChecked && sessionIndicator && !isAuthenticated && activeContext && (
            <button
              onClick={() => setShowSavePrompt(true)}
              className="text-xs text-ct-muted hover:text-ct-ink transition-colors"
            >
              unsaved — session only
            </button>
          )}
          {isAuthenticated && syncStatus === "saving" && (
            <span className="text-xs text-ct-muted">Saving<AnimatedEllipsis /></span>
          )}
          {isAuthenticated && syncStatus === "saved" && (
            <span className="text-xs text-ct-muted">Saved</span>
          )}
          {isAuthenticated && syncStatus === "error" && (
            <span className="text-xs text-ct-strike">Sync failed</span>
          )}
          {userEmail ? (
            <span className="text-xs text-ct-muted">{userEmail}</span>
          ) : authChecked && (
            <button
              onClick={() => setShowSavePrompt(true)}
              className="text-xs font-ui text-ct-muted hover:text-ct-ink transition-colors"
            >
              Sign in
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="mx-auto max-w-4xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <span className="text-sm text-ct-muted">Loading<AnimatedEllipsis /></span>
            </div>
          ) : (
          <>
          {/* Profile tabs */}
          <div className="flex items-center gap-1 mb-6 border-b border-ct-rule overflow-x-auto">
            {contexts.map((c) => (
              <button
                key={c.id}
                onClick={() => switchToProfile(c.id)}
                className={`shrink-0 px-4 py-2 text-sm font-ui transition-colors border-b-2 -mb-px ${
                  activeTab === c.id
                    ? "border-ct-accent text-ct-ink font-medium"
                    : "border-transparent text-ct-muted hover:text-ct-ink"
                }`}
              >
                {c.name || "Untitled"}
              </button>
            ))}
            {contexts.length < MAX_PROFILES && (
              <button
                onClick={switchToNew}
                className={`shrink-0 px-4 py-2 text-sm font-ui transition-colors border-b-2 -mb-px ${
                  activeTab === "new"
                    ? "border-ct-accent text-ct-ink font-medium"
                    : "border-transparent text-ct-muted hover:text-ct-ink"
                }`}
              >
                + New
              </button>
            )}
          </div>

          {/* Profile panel */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setBrandOpen(!brandOpen)}
                className="flex items-center gap-2 text-sm font-medium font-ui text-ct-muted hover:text-ct-ink transition-colors"
              >
                <span className="text-xs">{brandOpen ? "▼" : "▶"}</span>
                Profile
              </button>
              {brandOpen && editing && activeTab === "new" && canGenerate && (
                <button
                  onClick={handleSaveNew}
                  className="text-xs font-ui font-medium text-ct-muted hover:text-ct-ink transition-colors"
                >
                  Save Profile
                </button>
              )}
              {brandOpen && editing && activeTab !== "new" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEdits}
                    className="text-xs font-ui font-medium text-ct-muted hover:text-ct-ink transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setForm(activeContext!);
                      setEditing(false);
                    }}
                    className="text-xs font-ui text-ct-muted hover:text-ct-ink transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {brandOpen && activeTab !== "new" && (
                <div className="flex items-center gap-3 ml-auto">
                  {!editing && (
                    <button
                      onClick={() => {
                        setBrandOpen(true);
                        setEditing(true);
                      }}
                      className="text-xs font-ui text-ct-muted hover:text-ct-ink transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setConfirmDialog({
                        message: `Delete "${activeContext?.name || "this profile"}" and all its copy blocks?`,
                        onConfirm: () => {
                          handleDelete(activeTab);
                          setConfirmDialog(null);
                        },
                      });
                    }}
                    className="text-xs font-ui text-ct-rule hover:text-ct-strike transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {brandOpen && (
              <div>
                {editing ? (
                  <BrandForm form={form} update={update} canGenerate={canGenerate} isNew={activeTab === "new"} />
                ) : (
                  <BrandReadOnly context={activeContext!} />
                )}
              </div>
            )}
          </div>

          {/* Generation workspace */}
          <GenerationWorkspace
            context={activeContext}
            blockId={route.blockId}
            onBlockChange={(blockId) => {
              const profileSlug = activeContext?.slug ?? "new";
              if (blockId === null) {
                replace(profileSlug, "new");
              } else {
                // Look up block slug from session
                const session = getSession();
                const block = session.copy_blocks.find((b) => b.id === blockId);
                replace(profileSlug, block?.slug ?? blockId);
              }
              if (activeContext) setActiveBlockForContext(activeContext.id, blockId);
            }}
            form={form as BrandContext}
            canGenerate={canGenerate}
            ensureContext={ensureContext}
            onGenerate={checkSavePrompt}
            isAuthenticated={isAuthenticated}
            userEmail={userEmail}
            onSyncStatus={(status) => {
              if (status === "saved") {
                setSyncStatus("saved");
                clearTimeout(syncTimerRef.current);
                syncTimerRef.current = setTimeout(() => setSyncStatus("idle"), 1500);
              } else {
                setSyncStatus(status);
              }
            }}
            onConfirm={(message, onConfirm) => setConfirmDialog({ message, onConfirm: () => { onConfirm(); setConfirmDialog(null); } })}
          />
          </>
          )}
        </div>
      </main>

      {showSavePrompt && (
        <SavePrompt
          onAuthComplete={() => setShowSavePrompt(false)}
          onDismiss={() => setShowSavePrompt(false)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

// ── Read-only brand display ──────────────────────────────────────

function BrandReadOnly({ context }: { context: BrandContext }) {
  return (
    <div className="space-y-3 text-sm">
      <Row label="Profile Name" value={context.name} />
      <Row label="Business" value={context.business_name} />
      <Row label="Description" value={context.business_description} />
      <Row label="Audience" value={context.audience} />
      <Row label="Tone" value={context.tone} />
      {context.tone_examples && <Row label="Voice sample" value={context.tone_examples} />}
      {context.source_url && <Row label="Website" value={context.source_url} />}
      {context.voice_profile && (
        <div className="border-t border-ct-rule pt-3 mt-3">
          <span className="text-[length:--text-xs] text-ct-muted">Generated Voice Profile</span>
          <VoiceProfileDisplay text={context.voice_profile} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-4">
      <span className="shrink-0 w-28 text-ct-muted">{label}</span>
      <span className="text-ct-ink">{value}</span>
    </div>
  );
}

/**
 * Renders the LLM-generated voice profile with basic formatting.
 *
 * The voice API returns a plain-text block that typically uses markdown-ish
 * conventions: **Bold Section Headers**, lines starting with "- " for bullets,
 * and blank lines between sections. Rather than pulling in a full markdown
 * parser for this one spot, we do a lightweight transform:
 *
 * 1. Split on newlines.
 * 2. Lines starting with "- " become <li> items grouped into <ul>s.
 * 3. Inline **bold** markers become <strong> tags.
 * 4. Everything else becomes a <p>.
 *
 * This is a presentational component — no state, no effects.
 */
function VoiceProfileDisplay({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let key = 0;

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={key++} className="list-disc list-outside pl-4 space-y-0.5">
        {bulletBuffer.map((b, i) => (
          <li key={i}>{formatBold(b)}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }
    if (/^[-•]\s/.test(trimmed)) {
      bulletBuffer.push(trimmed.replace(/^[-•]\s+/, ""));
    } else {
      flushBullets();
      elements.push(<p key={key++}>{formatBold(trimmed)}</p>);
    }
  }
  flushBullets();

  return (
    <div className="text-[length:--text-xs] text-ct-muted mt-1 leading-relaxed space-y-2">
      {elements}
    </div>
  );
}

/** Replace **bold** markers with <strong> tags. */
function formatBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-ct-ink">{part}</strong> : part
  );
}

// ── Editable brand form ──────────────────────────────────────────

function BrandForm({
  form,
  update,
  canGenerate,
  isNew,
}: {
  form: Partial<BrandContext>;
  update: (fields: Partial<BrandContext>) => void;
  canGenerate: boolean;
  isNew: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field
        id="profile-name"
        label="Profile Name *"
        placeholder='e.g., "Bit Lore", "Personal", "Client — Acme Co"'
        value={form.name ?? ""}
        onChange={(v) => update({ name: v })}
      />
      <Field
        id="business-name"
        label="Business Name"
        placeholder="Your business or project name"
        value={form.business_name ?? ""}
        onChange={(v) => update({ business_name: v })}
      />
      <Field
        id="business-description"
        label="What do you do?"
        placeholder="Describe your business in a few sentences"
        value={form.business_description ?? ""}
        onChange={(v) => update({ business_description: v })}
        multiline
        maxLength={500}
      />
      <ChipPicker
        id="audience"
        label="Who's your audience?"
        suggestions={AUDIENCE_SUGGESTIONS}
        selected={parseChips(form.audience ?? "")}
        onChange={(chips) => update({ audience: chips.join(", ") })}
        placeholder="Add your own…"
      />
      <ChipPicker
        id="tone"
        label="Desired tone"
        suggestions={TONE_SUGGESTIONS}
        selected={parseChips(form.tone ?? "")}
        onChange={(chips) => update({ tone: chips.join(", ") })}
        placeholder="Add your own…"
      />

      <div className="border-t border-ct-rule pt-4 mt-2">
        <p className="text-xs text-ct-muted mb-4">Optional — helps us dial in the voice</p>
        <div className="space-y-4">
          <Field
            id="tone-examples"
            label="Voice sample"
            placeholder="Paste your bio, some recent social posts, or copy you like — anything that sounds like you"
            value={form.tone_examples ?? ""}
            onChange={(v) => update({ tone_examples: v })}
            multiline
            maxLength={2000}
          />
          <Field
            id="source-url"
            label="Your existing website"
            placeholder="https://example.com"
            value={form.source_url ?? ""}
            onChange={(v) => update({ source_url: v })}
          />
        </div>
      </div>

      {isNew && !canGenerate && (
        <p className="text-xs text-ct-muted">
          Fill in the required fields above to start generating
        </p>
      )}
    </div>
  );
}

// ── Field component ──────────────────────────────────────────────

function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  multiline,
  maxLength,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="ct-label">{label}</span>
      {multiline ? (
        <textarea
          id={id}
          name={id}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          rows={3}
          className="ct-textarea resize-none"
        />
      ) : (
        <input
          id={id}
          name={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className="ct-input"
        />
      )}
    </label>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function parseChips(str: string): string[] {
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

// ── Chip picker ──────────────────────────────────────────────────

function ChipPicker({
  id,
  label,
  suggestions,
  selected,
  onChange,
  placeholder = "Add your own…",
}: {
  id: string;
  label: string;
  suggestions: string[];
  selected: string[];
  onChange: (chips: string[]) => void;
  placeholder?: string;
}) {
  const [customValue, setCustomValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLower = selected.map((s) => s.toLowerCase());
  const unselected = suggestions.filter(
    (s) => !selectedLower.includes(s.toLowerCase())
  );

  function addChip(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (selectedLower.includes(trimmed.toLowerCase())) return;
    onChange([...selected, trimmed]);
  }

  function removeChip(chip: string) {
    onChange(selected.filter((s) => s.toLowerCase() !== chip.toLowerCase()));
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(customValue);
      setCustomValue("");
    }
  }

  return (
    <div>
      <span className="ct-label">{label}</span>

      {/* Selected chips */}
      <div className="flex flex-wrap gap-2 min-h-[2rem] items-center">
        {selected.length > 0 ? (
          selected.map((chip) => (
            <span
              key={chip}
              className="ct-tag inline-flex items-center gap-1"
            >
              {chip}
              <button
                type="button"
                onClick={() => removeChip(chip)}
                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                aria-label={`Remove ${chip}`}
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-ct-muted">No selections yet</span>
        )}
      </div>

      <hr className="border-ct-rule my-2" />

      {/* Suggestions + custom input */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-ct-rule bg-ct-paper pr-1.5">
          <input
            ref={inputRef}
            type="text"
            id={id}
            name={id}
            autoComplete="off"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            onBlur={() => {
              if (customValue.trim()) {
                addChip(customValue);
                setCustomValue("");
              }
            }}
            placeholder={placeholder}
            className="rounded-full bg-transparent pl-3 py-1 text-xs font-ui text-ct-ink placeholder:text-ct-rule focus:outline-none w-28"
          />
          <button
            type="button"
            onClick={() => {
              addChip(customValue);
              setCustomValue("");
              inputRef.current?.focus();
            }}
            className="flex items-center justify-center w-4 h-4 rounded-full border border-ct-rule text-ct-muted hover:text-ct-ink hover:border-ct-muted transition-colors"
            aria-label="Add custom value"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M5 1v8M1 5h8" />
            </svg>
          </button>
        </span>
        {unselected.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => addChip(option)}
            className="rounded-full px-3 py-1 text-xs font-ui bg-ct-cream text-ct-muted hover:text-ct-ink hover:bg-ct-rule transition-colors"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
