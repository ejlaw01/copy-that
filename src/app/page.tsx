"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GenerationWorkspace } from "@/components/GenerationWorkspace";
import { SavePrompt } from "@/components/SavePrompt";
import { supabase } from "@/lib/supabase/client";
import {
  getSession,
  getActiveContext,
  setActiveContext,
  getGenerationCount,
  newContextId,
  saveBrandContext,
  deleteBrandContext,
  type BrandContext,
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

// "new" = the + New tab for creating a new profile
type ActiveTab = string | "new";

export default function Home() {
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("new");
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isAuthenticatedRef = useRef(false);
  const [sessionIndicator, setSessionIndicator] = useState(false);

  // Profile panel state
  const [brandOpen, setBrandOpen] = useState(true);
  const [editing, setEditing] = useState(true); // true = form mode, false = read-only
  const [form, setForm] = useState<Partial<BrandContext>>(emptyForm);

  function update(fields: Partial<BrandContext>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  const activeContext = activeTab !== "new"
    ? contexts.find((c) => c.id === activeTab) ?? null
    : null;

  // Switch to a profile tab
  function switchToProfile(id: string) {
    const ctx = contexts.find((c) => c.id === id);
    if (!ctx) return;
    setActiveTab(id);
    setActiveContext(id);
    setForm(ctx);
    setBrandOpen(false);
    setEditing(false);
  }

  // Switch to the + New tab
  function switchToNew() {
    if (contexts.length >= MAX_PROFILES) return;
    setActiveTab("new");
    setForm(emptyForm());
    setBrandOpen(true);
    setEditing(true);
  }

  // Delete a profile
  function handleDelete(id: string) {
    const session = deleteBrandContext(id);
    setContexts(session.brand_contexts);
    if (activeTab === id) {
      if (session.brand_contexts.length > 0) {
        switchToProfile(session.brand_contexts[0].id);
      } else {
        switchToNew();
      }
    }
  }

  // Save edits to an existing profile (re-generate voice profile)
  async function handleSaveEdits() {
    if (!activeContext) return;
    const updated = { ...activeContext, ...form } as BrandContext;
    // Clear voice profile so it regenerates on next generate
    updated.voice_profile = "";
    saveBrandContext(updated);
    setContexts((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setEditing(false);
  }

  // Auth state
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setIsAuthenticated(true);
        isAuthenticatedRef.current = true;
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setIsAuthenticated(true);
          isAuthenticatedRef.current = true;
          setShowSavePrompt(false);

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
          }
        }
        if (event === "SIGNED_OUT") {
          setIsAuthenticated(false);
          isAuthenticatedRef.current = false;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Load existing session
  useEffect(() => {
    const session = getSession();
    if (session.brand_contexts.length > 0) {
      setContexts(session.brand_contexts);
      const ctx = getActiveContext();
      if (ctx) {
        setActiveTab(ctx.id);
        setForm(ctx);
        setBrandOpen(false);
        setEditing(false);
      }
      setSessionIndicator(true);
    }
  }, []);

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

    if (!form.name || !form.business_name || !form.business_description || !form.audience || !form.tone) {
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

    const ctx = form as BrandContext;
    saveBrandContext(ctx);

    setContexts((prev) => {
      const idx = prev.findIndex((c) => c.id === ctx.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = ctx;
        return updated;
      }
      return [...prev, ctx];
    });
    setActiveTab(ctx.id);
    setActiveContext(ctx.id);
    setForm(ctx);
    setBrandOpen(false);
    setEditing(false);
    setSessionIndicator(true);

    return ctx;
  }

  const canGenerate = !!(form.name && form.business_name && form.business_description && form.audience && form.tone);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-ct-rule">
        <h1 className="font-display text-lg font-semibold tracking-tight">Copy That</h1>
        <div className="flex items-center gap-3">
          {sessionIndicator && !isAuthenticated && activeContext && (
            <button
              onClick={() => setShowSavePrompt(true)}
              className="text-xs text-ct-rule hover:text-ct-muted transition-colors"
            >
              unsaved — session only
            </button>
          )}
          {isAuthenticated && (
            <span className="text-xs text-ct-rule">saved</span>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="mx-auto max-w-4xl">
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
              {brandOpen && activeTab !== "new" && editing && (
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
                    className="text-xs font-ui text-ct-rule hover:text-ct-muted transition-colors"
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
                      if (confirm(`Delete "${activeContext?.name || "this profile"}"?`)) {
                        handleDelete(activeTab);
                      }
                    }}
                    className="text-xs font-ui text-ct-rule hover:text-ct-strike transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {brandOpen && (
              <div className="max-w-xl">
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
            form={form as BrandContext}
            canGenerate={canGenerate}
            ensureContext={ensureContext}
            onGenerate={checkSavePrompt}
          />
        </div>
      </main>

      {showSavePrompt && (
        <SavePrompt
          onAuthComplete={() => setShowSavePrompt(false)}
          onDismiss={() => setShowSavePrompt(false)}
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
          <p className="text-[length:--text-xs] text-ct-muted mt-1 leading-relaxed">{context.voice_profile}</p>
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
        label="Profile Name"
        placeholder='e.g., "Bit Lore", "Personal", "Client — Rioja Wine"'
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
        <p className="text-xs text-ct-rule">
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
          <span className="text-xs text-ct-rule">No selections yet</span>
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
