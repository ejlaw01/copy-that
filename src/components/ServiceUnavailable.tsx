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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-foreground/10 bg-background p-6 shadow-lg">
        {sent ? (
          <>
            <h3 className="text-lg font-semibold mb-2">Message sent</h3>
            <p className="text-sm text-foreground/60 mb-4">
              Thanks for letting me know. I&apos;ll look into it and get things
              back up as soon as possible.
            </p>
            <button
              onClick={onDismiss}
              className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold mb-1">
              Service temporarily unavailable
            </h3>
            <p className="text-sm text-foreground/50 mb-5">
              The AI service has reached its monthly limit.
            </p>
            <p className="text-sm text-foreground/50 mb-5">
              If you&apos;re enjoying this tool, send me a note.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Your name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
              <input
                type="email"
                placeholder="Your email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
              <textarea
                placeholder="Leave a message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 resize-none"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="text-sm text-foreground/40 hover:text-foreground transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={sending || !message.trim()}
                  className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-30"
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
