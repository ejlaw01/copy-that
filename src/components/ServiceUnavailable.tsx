"use client";

import { useState } from "react";

interface ServiceUnavailableProps {
  onDismiss: () => void;
}

export function ServiceUnavailable({ onDismiss }: ServiceUnavailableProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);

    await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });

    setSent(true);
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ct-paper/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-[--radius-md] border border-ct-rule bg-ct-paper p-6 shadow-[--shadow-md]">
        {sent ? (
          <>
            <h3 className="font-display text-lg font-semibold mb-2">Message sent</h3>
            <p className="font-ui text-sm text-ct-muted mb-4">
              Thanks for letting me know. I&apos;ll look into it and get things
              back up as soon as possible.
            </p>
            <button
              onClick={onDismiss}
              className="ct-btn ct-btn-primary"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h3 className="font-display text-lg font-semibold mb-1">
              Service temporarily unavailable
            </h3>
            <p className="font-ui text-sm text-ct-muted mb-5">
              The AI service has reached its monthly limit.
            </p>
            <p className="font-ui text-sm text-ct-muted mb-5">
              If you&apos;re enjoying this tool, send me a note.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Your name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ct-input"
              />
              <input
                type="email"
                placeholder="Your email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ct-input"
              />
              <textarea
                placeholder="Leave a message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                className="ct-textarea resize-none"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="font-ui text-sm text-ct-muted hover:text-ct-ink transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={sending || !message.trim()}
                  className="ct-btn ct-btn-primary"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
