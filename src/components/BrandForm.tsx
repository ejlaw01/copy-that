"use client";

import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { ChipPicker, parseChips } from "@/components/ChipPicker";
import type { BrandContext } from "@/lib/session-storage";

const AUDIENCE_SUGGESTIONS = [
  "Small business owners",
  "Creative professionals",
  "Trade professionals",
  "Enterprise teams",
  "Startups & founders",
  "Local customers",
  "Online shoppers",
  "B2B decision makers",
  "Parents & families",
  "Freelancers",
  "Health & wellness seekers",
  "Restaurant & hospitality guests",
];

const TONE_SUGGESTIONS = [
  "Professional",
  "Conversational",
  "Bold",
  "Authoritative",
  "Witty",
  "Warm",
  "Playful",
  "Minimal",
  "Refined",
  "Nerdy",
  "Inspirational",
  "Down-to-earth",
];

interface BrandFormProps {
  form: Partial<BrandContext>;
  update: (fields: Partial<BrandContext>) => void;
  canGenerate: boolean;
  isNew: boolean;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}

export function BrandForm({
  form,
  update,
  canGenerate,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: BrandFormProps) {
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
        label="Business or Product Name"
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

      {/* Voice profile — only shown when editing an existing profile that has one */}
      {!isNew && form.voice_profile && (
        <div className="border-t border-ct-rule pt-4 mt-2">
          <Field
            id="voice-profile"
            label="Voice Profile"
            placeholder="Generated after first save"
            value={form.voice_profile ?? ""}
            onChange={(v) => update({ voice_profile: v })}
            multiline
            maxLength={3000}
          />
          <p className="text-xs text-ct-muted mt-1">
            Auto-generated from your profile. Edit to fine-tune how your copy sounds.
          </p>
        </div>
      )}

      {/* Save / Cancel / Delete buttons */}
      <div className="flex items-center gap-3 pt-2">
        {isNew ? (
          <Button variant="primary" onClick={onSave} disabled={!canGenerate}>
            Save Profile
          </Button>
        ) : (
          <>
            <Button onClick={onSave}>
              Save
            </Button>
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="ml-auto text-sm font-ui text-ct-rule hover:text-ct-strike transition-colors"
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>

      {isNew && !canGenerate && (
        <p className="text-xs text-ct-muted">
          Fill in the required fields above to start generating
        </p>
      )}
    </div>
  );
}
