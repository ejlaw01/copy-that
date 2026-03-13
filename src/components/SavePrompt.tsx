"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface SavePromptProps {
  onAuthComplete: () => void;
  onDismiss: () => void;
}

export function SavePrompt({ onAuthComplete, onDismiss }: SavePromptProps) {
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        data: { marketing_consent: marketingConsent },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Store consent preference for migration
    sessionStorage.setItem("copythat_marketing_consent", JSON.stringify(marketingConsent));
    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-sm rounded-xl border border-foreground/10 bg-background p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-2">Check your email</h3>
          <p className="text-sm text-foreground/60">
            We sent a magic link to <strong>{email}</strong>. Click it to save
            your work and unlock more generations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-foreground/10 bg-background p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-1">Save your work</h3>
        <p className="text-sm text-foreground/50 mb-5">
          Enter your email to save your brand voices and copy, and unlock more
          generations.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-0.5 rounded border-foreground/20"
            />
            <span className="text-sm text-foreground/60">
              Keep me posted on new features
            </span>
          </label>

          <p className="text-xs text-foreground/30">
            I will never sell your personal information. Your email is used to
            save your project and, if you opt in, to hear about updates.
            That&apos;s it.{" "}
            <a href="/privacy" className="underline hover:text-foreground/50">
              Privacy policy
            </a>
          </p>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onDismiss}
              className="text-sm text-foreground/40 hover:text-foreground transition-colors"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-50"
            >
              {loading ? "Sending..." : "Save & Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
