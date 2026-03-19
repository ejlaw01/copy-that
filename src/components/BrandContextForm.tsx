"use client";

import { useState } from "react";
import type { BrandContext } from "@/lib/session-storage";
import { newContextId, saveBrandContext } from "@/lib/session-storage";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";

interface BrandContextFormProps {
  initial?: Partial<BrandContext>;
  onComplete: (ctx: BrandContext) => void;
}

export function BrandContextForm({ initial, onComplete }: BrandContextFormProps) {
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
  const [serviceDown, setServiceDown] = useState(false);

  function update(fields: Partial<BrandContext>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  function canSubmit(): boolean {
    return !!(form.name && form.business_name && form.business_description && form.audience && form.tone);
  }

  async function handleFinish() {
    setLoading(true);
    try {
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

      const voiceRes = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (voiceRes.ok) {
        const data = await voiceRes.json();
        form.voice_profile = data.voice_profile;
      } else {
        const data = await voiceRes.json();
        if (data.service_unavailable === "spend_limit") {
          setServiceDown(true);
          setLoading(false);
          return;
        }
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
      {serviceDown && (
        <ServiceUnavailable onDismiss={() => setServiceDown(false)} />
      )}

      <h2 className="font-display text-xl font-semibold mb-1">Set up your voice</h2>
      <p className="font-ui text-sm text-ct-muted mb-6">
        Tell us about your brand so we can match your tone
      </p>

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

        {/* Optional fields */}
        <div className="border-t border-ct-rule pt-4 mt-2">
          <p className="text-xs text-ct-muted mb-4">Optional — helps us dial in the voice</p>
          <div className="space-y-4">
            <Field
              label="Copy you like"
              placeholder="Paste a paragraph of writing whose style you admire"
              value={form.tone_examples ?? ""}
              onChange={(v) => update({ tone_examples: v })}
              multiline
              maxLength={500}
            />
            <Field
              label="Your existing website"
              placeholder="https://example.com"
              value={form.source_url ?? ""}
              onChange={(v) => update({ source_url: v })}
            />
            <Field
              label="Voice sample"
              placeholder="Paste your bio or some recent social posts that sound like you"
              value={form.competitors ?? ""}
              onChange={(v) => update({ competitors: v })}
              multiline
              maxLength={2000}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleFinish}
          disabled={!canSubmit() || loading}
          className="ct-btn ct-btn-primary disabled:opacity-30"
        >
          {loading ? "Setting up..." : "Create Voice Profile"}
        </button>
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
  return (
    <label className="block">
      <span className="ct-label">{label}</span>
      {multiline ? (
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          rows={3}
          className="ct-textarea resize-none"
        />
      ) : (
        <input
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
