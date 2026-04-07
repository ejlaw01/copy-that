"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { useHashRoute } from "@/lib/use-hash-route";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { withViewTransition } from "@/lib/view-transition";
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

export function useAppSession() {
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const { route, navigate, replace } = useHashRoute();
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = !!userEmail;
  // Mutable ref that async code can read to get the latest auth state,
  // avoiding stale closures in fire-and-forget functions like generateVoiceProfile.
  const isAuthenticatedRef = useRef(false);
  const [sessionIndicator, setSessionIndicator] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isDemo, setIsDemo] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [extractWarning, setExtractWarning] = useState<string | null>(null);

  const [editing, setEditing] = useState(true);
  const [form, setForm] = useState<Partial<BrandContext>>(emptyForm);
  // State-as-callback-ref: useState (not useRef) so that when the DOM node
  // mounts, the re-render flows the new value down to GenerationWorkspace
  // as a prop, letting it portal content into the picker slot.
  const [pickerSlot, setPickerSlot] = useState<HTMLDivElement | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // ── Derived state ──────────────────────────────────────────────

  const activeTab = route.profileId === "new"
    ? "new"
    : route.profileId
      ? (contexts.find((c) => c.slug === route.profileId)?.id ?? route.profileId)
      : "new";
  const activeContext = activeTab !== "new"
    ? contexts.find((c) => c.id === activeTab) ?? null
    : null;
  const showHero = contexts.length === 0 && !route.profileId;
  const canGenerate = !!form.name;

  // ── Sync helpers ───────────────────────────────────────────────

  function markSaved() {
    setSyncStatus("saved");
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => setSyncStatus("idle"), 1500);
  }

  function withSync(syncFn: () => Promise<{ syncError?: string }>) {
    setSyncStatus("saving");
    syncFn().then(({ syncError }) => {
      if (syncError) {
        setSyncStatus("error");
      } else {
        markSaved();
      }
    });
  }

  function handleSyncStatus(status: "idle" | "saving" | "saved" | "error") {
    if (status === "saved") {
      markSaved();
    } else {
      setSyncStatus(status);
    }
  }

  function update(fields: Partial<BrandContext>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  // ── Profile panel helpers ──────────────────────────────────────

  function applyProfilePanel(ctx: BrandContext) {
    setForm(ctx);
    setEditing(false);
  }

  function switchToProfile(id: string) {
    const ctx = contexts.find((c) => c.id === id);
    if (!ctx) return;
    withViewTransition(() => {
      navigate(ctx.slug);
      setActiveContext(id);
      applyProfilePanel(ctx);
    });
  }

  function switchToNew() {
    if (contexts.length >= MAX_PROFILES) return;
    withViewTransition(() => {
      navigate("new");
      setForm(emptyForm());
      setEditing(true);
    });
  }

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
        setEditing(true);
      }
    }
  }

  // ── Voice profile generation ───────────────────────────────────

  function generateVoiceProfile(ctx: BrandContext) {
    (async () => {
      try {
        if (ctx.source_url) {
          try {
            const res = await fetch("/api/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: ctx.source_url, type: "source" }),
            });
            if (res.ok) {
              ctx = { ...ctx, source_content: await res.json() };
            } else {
              const data = await res.json().catch(() => ({}));
              setExtractWarning(data.error || "Could not extract content from URL");
            }
          } catch {
            // Non-blocking — voice generation works without source content
          }
        }

        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ctx),
        });
        if (!res.ok) return;
        const { voice_profile } = await res.json();
        const patched = { ...ctx, voice_profile };

        // Reads isAuthenticatedRef.current (not the state boolean) because this
        // async function may outlive the render that created it — the ref always
        // reflects the latest auth state.
        const syncPromise = saveBrandContextWithSync(patched, isAuthenticatedRef.current);
        if (isAuthenticatedRef.current) withSync(() => syncPromise);

        setContexts((prev) =>
          prev.map((c) => (c.id === patched.id ? patched : c)),
        );
        setForm((prev) =>
          prev.id === patched.id ? { ...prev, voice_profile } : prev,
        );
      } catch {
        // Silent — lazy fallback in ensureContext() covers this
      }
    })();
  }

  // ── Save handlers ──────────────────────────────────────────────

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
    setEditing(false);
    setSessionIndicator(true);
    generateVoiceProfile(ctx);
  }

  function handleSaveEdits() {
    if (!activeContext) return;
    const updated = { ...activeContext, ...form } as BrandContext;
    const voiceManuallyEdited =
      form.voice_profile !== activeContext.voice_profile;

    const syncPromise = saveBrandContextWithSync(updated, isAuthenticated);
    if (isAuthenticated) withSync(() => syncPromise);
    setContexts((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setEditing(false);

    if (!voiceManuallyEdited && updated.voice_profile) {
      generateVoiceProfile(updated);
    }
  }

  // ── Hydration helper ───────────────────────────────────────────

  function hydrateFromSession(data: {
    brand_contexts: BrandContext[];
    copy_blocks?: CopyBlock[];
    active_context_id: string | null;
  }) {
    if (data.brand_contexts.length === 0) return;

    const existingCtxSlugs: string[] = [];
    for (const ctx of data.brand_contexts) {
      if (!ctx.slug) {
        ctx.slug = uniqueSlug(slugify(ctx.name), existingCtxSlugs);
      }
      existingCtxSlugs.push(ctx.slug);
    }

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
    setEditing(false);
    setSessionIndicator(true);
  }

  // ── ensureContext — called by GenerationWorkspace before generating ─

  async function ensureContext(): Promise<BrandContext | null> {
    if (activeContext?.voice_profile) return activeContext;

    if (!form.name) {
      return null;
    }

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
        } else {
          const data = await res.json().catch(() => ({}));
          setExtractWarning(data.error || "Could not extract content from URL");
        }
      } catch {
        // Non-blocking
      }
    }

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
    setEditing(false);
    setSessionIndicator(true);

    return ctx;
  }

  // ── Effects ────────────────────────────────────────────────────

  // Auth + data loading — runs once on mount.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Demo mode: skip auth, hydrate from seeded sessionStorage
      const demoFlag = sessionStorage.getItem("copythat_demo") === "1";
      if (demoFlag) {
        setIsDemo(true);
        setAuthChecked(true);
        const session = getSession();
        if (session.brand_contexts.length > 0) {
          hydrateFromSession(session);
        }
        setIsLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (cancelled) return;

      if (user) {
        setUserEmail(user.email ?? null);
        isAuthenticatedRef.current = true;
        setAuthChecked(true);

        const storedUserId = getSessionUserId();
        const hasCachedData = storedUserId === user.id && getSession().brand_contexts.length > 0;

        if (hasCachedData) {
          hydrateFromSession(getSession());
          setIsLoading(false);
          (async () => {
            try {
              const res = await fetch("/api/data");
              if (!res.ok || cancelled) return;
              const fresh = await res.json();
              const cached = getSession();
              const freshData = fresh as { brand_contexts: BrandContext[]; copy_blocks: CopyBlock[]; active_context_id: string | null };
              const cachedCtxIds = new Set(cached.brand_contexts.map((c: BrandContext) => c.id));
              const freshCtxIds = new Set(freshData.brand_contexts.map((c) => c.id));
              const cachedBlockIds = new Set(cached.copy_blocks.map((b: CopyBlock) => b.id));
              const freshBlockIds = new Set(freshData.copy_blocks.map((b) => b.id));
              const same =
                cachedCtxIds.size === freshCtxIds.size &&
                cachedBlockIds.size === freshBlockIds.size &&
                [...freshCtxIds].every((id) => cachedCtxIds.has(id)) &&
                [...freshBlockIds].every((id) => cachedBlockIds.has(id));
              if (same) return;
              const existingSlugs: string[] = [];
              for (const ctx of freshData.brand_contexts) {
                if (!ctx.slug) ctx.slug = uniqueSlug(slugify(ctx.name), existingSlugs);
                existingSlugs.push(ctx.slug);
              }
              const existingBlockSlugs: string[] = [];
              for (const block of freshData.copy_blocks) {
                if (!block.slug) block.slug = uniqueSlug(slugify(block.title || block.component_type), existingBlockSlugs);
                existingBlockSlugs.push(block.slug);
              }
              setSession(freshData);
              setSessionUserId(user.id);
              if (!cancelled) setContexts(freshData.brand_contexts);
            } catch {
              // Silent — stale cache is still usable
            }
          })();
          return;
        }

        try {
          const res = await fetch("/api/data");
          if (res.ok) {
            const data = await res.json();
            if (cancelled) return;
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

        const session = getSession();
        if (session.brand_contexts.length > 0) {
          hydrateFromSession(session);
        }
      }

      if (!cancelled) setIsLoading(false);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (sessionStorage.getItem("copythat_demo") === "1") return;
        if (event === "SIGNED_IN" && session?.user) {
          setUserEmail(session.user.email ?? null);
          isAuthenticatedRef.current = true;
          setShowSavePrompt(false);

          if (getSessionUserId() === session.user.id) return;

          let serverData: { brand_contexts: BrandContext[]; copy_blocks: CopyBlock[]; active_context_id: string | null } | null = null;
          try {
            const res = await fetch("/api/data");
            if (res.ok) {
              serverData = await res.json();
            }
          } catch {
            // Network error — fall through
          }

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
          setEditing(true);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Bootstrap — runs once after initial data load to select the starting view.
  // Intentionally does not re-run when contexts/route change; it only needs to
  // fire the moment isLoading flips false for the first time.
  useEffect(() => {
    if (isLoading) return;

    if (route.profileId === null) {
      const stored = getActiveContext();
      if (stored && contexts.find((c) => c.id === stored.id)) {
        replace(stored.slug);
        applyProfilePanel(stored);
      } else if (contexts.length > 0) {
        replace(contexts[0].slug);
        applyProfilePanel(contexts[0]);
      }
    } else if (route.profileId === "new") {
      setForm(emptyForm());
      setEditing(true);
    } else {
      if (activeContext) {
        applyProfilePanel(activeContext);
      } else if (contexts.length > 0) {
        replace(contexts[0].slug);
        applyProfilePanel(contexts[0]);
      } else {
        replace("new");
        setForm(emptyForm());
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

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileMenuOpen]);

  // Timer-based save prompt
  useEffect(() => {
    if (isAuthenticated || !activeContext) return;
    const timer = setTimeout(() => {
      if (!isAuthenticatedRef.current) setShowSavePrompt(true);
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, activeContext]);

  // ── Return ─────────────────────────────────────────────────────

  return {
    // State
    contexts,
    activeTab,
    activeContext,
    showHero,
    form,
    editing,
    isLoading,
    authChecked,
    isAuthenticated,
    isDemo,
    userEmail,
    syncStatus,
    sessionIndicator,
    showSavePrompt,
    confirmDialog,
    extractWarning,
    canGenerate,
    profileMenuOpen,
    pickerSlot,
    route,

    // Refs
    profileMenuRef,

    // Handlers
    update,
    switchToProfile,
    switchToNew,
    handleSaveNew,
    handleSaveEdits,
    handleDelete,
    ensureContext,
    checkSavePrompt,
    navigate,
    replace,

    // UI setters
    setShowSavePrompt,
    setConfirmDialog,
    setExtractWarning,
    setEditing,
    setForm,
    setProfileMenuOpen,
    setSessionIndicator,
    setPickerSlot,
    handleSyncStatus,
  };
}
