"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";

interface ServiceUnavailableProps {
  onDismiss: () => void;
}

export function ServiceUnavailable({ onDismiss }: ServiceUnavailableProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValid) return;
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
    <Modal onDismiss={onDismiss} labelledBy="service-unavailable-heading">
      {sent ? (
        <>
          <h3 id="service-unavailable-heading" className="font-display text-lg font-semibold mb-2">Message sent</h3>
          <p className="font-ui text-sm text-ct-muted mb-4">
            Thanks for letting me know. I&apos;ll look into it and get things
            back up as soon as possible.
          </p>
          <Button variant="primary" onClick={onDismiss}>
            Close
          </Button>
        </>
      ) : (
        <>
          <h3 id="service-unavailable-heading" className="font-display text-lg font-semibold mb-1">
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
              id="contact-name"
              name="contact-name"
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="ct-input"
            />
            <input
              id="contact-email"
              name="contact-email"
              type="email"
              placeholder="Your email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`ct-input ${email && !emailValid ? "border-ct-strike" : ""}`}
            />
            {email && !emailValid && (
              <p className="ct-helper" style={{ color: "var(--ct-strike)" }}>
                Please enter a valid email address
              </p>
            )}
            <textarea
              id="contact-message"
              name="contact-message"
              placeholder="Leave a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              className="ct-textarea resize-none"
            />

            <div className="flex items-center justify-between">
              <Button variant="ghost" type="button" onClick={onDismiss}>
                Close
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={sending || !message.trim() || !emailValid}
              >
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}
