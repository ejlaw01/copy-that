"use client";

import { useState } from "react";
import type { BrandContext } from "@/lib/session-storage";
import { newContextId, saveBrandContext } from "@/lib/session-storage";

interface BrandContextFormProps {
  initial?: Partial<BrandContext>;
  onComplete: (ctx: BrandContext) => void;
}

const STEPS = [
  { title: "Your Brand", description: "Name this voice and describe your business" },
  { title: "Your Audience", description: "Who you're writing for and how you sound" },
  { title: "Inspiration", description: "URLs and examples to learn from (optional)" },
  { title: "Review", description: "Confirm and generate your voice profile" },
];

export function BrandContextForm({ initial, onComplete }: BrandContextFormProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Partial<BrandContext>>({
    id: initial?.id ?? newContextId(),
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
    ...initial,
  });
  const [loading, setLoading] = useState(false);

  function update(fields: Partial<BrandContext>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  function canAdvance(): boolean {
    if (step === 0) return !!(form.name && form.business_name && form.business_description);
    if (step === 1) return !!(form.audience && form.tone);
    return true;
  }

  async function handleFinish() {
    setLoading(true);
    try {
      // Extract URL content if provided
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
          // Non-blocking — continue without extraction
        }
      }

      if (form.competitor_url) {
        try {
          const res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: form.competitor_url, type: "competitor" }),
          });
          if (res.ok) {
            const data = await res.json();
            form.competitor_analysis = data.analysis;
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
      if (voiceRes.ok) {
        const data = await voiceRes.json();
        form.voice_profile = data.voice_profile;
      }

      const ctx = form as BrandContext;
      saveBrandContext(ctx);
      onComplete(ctx);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                i === step
                  ? "bg-foreground text-background"
                  : i < step
                    ? "bg-foreground/20 text-foreground"
                    : "bg-foreground/5 text-foreground/30"
              }`}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 ${i < step ? "bg-foreground/20" : "bg-foreground/5"}`} />
            )}
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-1">{STEPS[step].title}</h2>
      <p className="text-sm text-foreground/50 mb-6">{STEPS[step].description}</p>

      {/* Step 1: Brand */}
      {step === 0 && (
        <div className="space-y-4">
          <Field
            label="Voice Name"
            placeholder='e.g., "Bit Lore", "Personal", "Client — Rioja Wine"'
            value={form.name ?? ""}
            onChange={(v) => update({ name: v })}
          />
          <Field
            label="Business Name"
            placeholder="Your business or project name"
            value={form.business_name ?? ""}
            onChange={(v) => update({ business_name: v })}
          />
          <Field
            label="What do you do?"
            placeholder="Describe your business in a few sentences"
            value={form.business_description ?? ""}
            onChange={(v) => update({ business_description: v })}
            multiline
            maxLength={500}
          />
        </div>
      )}

      {/* Step 2: Audience */}
      {step === 1 && (
        <div className="space-y-4">
          <Field
            label="Who's your audience?"
            placeholder="Describe your ideal customer or reader"
            value={form.audience ?? ""}
            onChange={(v) => update({ audience: v })}
            multiline
            maxLength={300}
          />
          <Field
            label="Desired tone"
            placeholder='e.g., "professional but warm", "casual and playful"'
            value={form.tone ?? ""}
            onChange={(v) => update({ tone: v })}
          />
          <Field
            label="Copy you like (optional)"
            placeholder="Paste a paragraph of writing whose style you admire"
            value={form.tone_examples ?? ""}
            onChange={(v) => update({ tone_examples: v })}
            multiline
            maxLength={500}
          />
        </div>
      )}

      {/* Step 3: URLs */}
      {step === 2 && (
        <div className="space-y-4">
          <Field
            label="Your existing website (optional)"
            placeholder="https://example.com"
            value={form.source_url ?? ""}
            onChange={(v) => update({ source_url: v })}
          />
          <Field
            label="A website whose voice you admire (optional)"
            placeholder="https://competitor.com"
            value={form.competitor_url ?? ""}
            onChange={(v) => update({ competitor_url: v })}
          />
          <Field
            label="Competitors or inspiration (optional)"
            placeholder="List sites you admire or compete with"
            value={form.competitors ?? ""}
            onChange={(v) => update({ competitors: v })}
            multiline
            maxLength={300}
          />
        </div>
      )}

      {/* Step 4: Review */}
      {step === 3 && (
        <div className="space-y-3 text-sm">
          <ReviewRow label="Voice Name" value={form.name} />
          <ReviewRow label="Business" value={form.business_name} />
          <ReviewRow label="Description" value={form.business_description} />
          <ReviewRow label="Audience" value={form.audience} />
          <ReviewRow label="Tone" value={form.tone} />
          {form.source_url && <ReviewRow label="Your site" value={form.source_url} />}
          {form.competitor_url && <ReviewRow label="Inspiration" value={form.competitor_url} />}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => s - 1)}
          className={`text-sm text-foreground/50 hover:text-foreground transition-colors ${
            step === 0 ? "invisible" : ""
          }`}
        >
          Back
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
            className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-30"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={loading}
            className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-50"
          >
            {loading ? "Setting up..." : "Create Voice Profile"}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  multiline,
  maxLength,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const cls =
    "w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20";

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground/70">{label}</span>
      {multiline ? (
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          rows={3}
          className={cls + " resize-none"}
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className={cls}
        />
      )}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="shrink-0 text-foreground/40 w-24">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
