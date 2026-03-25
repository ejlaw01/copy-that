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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ct-paper/80 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-sm rounded-[--radius-md] border border-ct-rule bg-ct-paper p-6 shadow-[--shadow-md]">
          <h3 className="font-display text-lg font-semibold mb-2">Check your email</h3>
          <p className="font-ui text-sm text-ct-muted">
            We sent a magic link to <strong>{email}</strong>. Click it to save
            your work and unlock more generations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ct-paper/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-[--radius-md] border border-ct-rule bg-ct-paper p-6 shadow-[--shadow-md]">
        <h3 className="font-display text-lg font-semibold mb-1">Sign in</h3>
        <p className="font-ui text-sm text-ct-muted mb-5">
          Enter your email to pick up where you left off and unlock more
          generations.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ct-input"
          />

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-0.5 rounded-[--radius-sm] border-ct-rule"
            />
            <span className="font-ui text-sm text-ct-muted">
              Keep me posted on new features
            </span>
          </label>

          <p className="text-[length:--text-xs] text-ct-muted">
            I will never sell your personal information. Your email is used to
            save your project and, if you opt in, to hear about updates.
            That&apos;s it.{" "}
            <a href="/privacy" className="underline hover:text-ct-ink">
              Privacy policy
            </a>
          </p>

          {error && <p className="font-ui text-sm text-ct-strike">{error}</p>}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onDismiss}
              className="font-ui text-sm text-ct-muted hover:text-ct-ink transition-colors"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={loading}
              className="ct-btn ct-btn-primary disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Magic Link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
