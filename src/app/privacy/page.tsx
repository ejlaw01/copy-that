import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ct-paper text-ct-ink">
      <header className="border-b border-ct-rule px-6 py-4">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight hover:opacity-70 transition-opacity">
          Copy That
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-2xl font-semibold mb-6">Privacy Policy</h1>

        <div className="space-y-6 text-sm text-ct-muted leading-relaxed">
          <p>
            This is a one-person project. I built it, I run it, and I take your
            privacy seriously. Here&apos;s exactly what happens with your data.
          </p>

          <section>
            <h2 className="font-display text-base font-medium text-ct-ink mb-2">What I collect</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Email address</strong> — only if you choose to save your
                work. Used for authentication (magic link login) and, if you opt
                in, occasional updates about new features.
              </li>
              <li>
                <strong>Brand context</strong> — the business information you
                enter (business name, description, audience, tone). This is what
                powers the copy generation.
              </li>
              <li>
                <strong>Generated content</strong> — the copy blocks the AI
                creates for you, stored so you can come back to them.
              </li>
              <li>
                <strong>Basic usage data</strong> — which component types are
                generated, how many generations per session. No personal
                identifiers are attached to anonymous usage data.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-medium text-ct-ink mb-2">What I don&apos;t collect</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>No tracking cookies</li>
              <li>No third-party analytics (no Google Analytics, no Meta Pixel)</li>
              <li>No data selling, ever</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-medium text-ct-ink mb-2">AI processing</h2>
            <p>
              Your brand context and generated content are sent to the Anthropic
              API (Claude) for processing. Anthropic does not train on data sent
              through their API.{" "}
              <a
                href="https://www.anthropic.com/privacy"
                className="underline hover:text-ct-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read their privacy policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-medium text-ct-ink mb-2">Marketing emails</h2>
            <p>
              If you check &quot;Keep me posted on new features&quot; when saving
              your work, I may send occasional updates. You can unsubscribe at
              any time. I will never send you anything else.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-medium text-ct-ink mb-2">Data retention</h2>
            <p>
              Your data persists as long as your account exists. If you want
              everything deleted, email me and I&apos;ll take care of it.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-medium text-ct-ink mb-2">Bot protection</h2>
            <p>
              This site uses Cloudflare Turnstile to prevent automated abuse.
              Turnstile runs in invisible mode — no CAPTCHAs.{" "}
              <a
                href="https://www.cloudflare.com/privacypolicy/"
                className="underline hover:text-ct-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cloudflare&apos;s privacy policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-medium text-ct-ink mb-2">Contact</h2>
            <p>
              Questions or requests? Reach me at{" "}
              <a
                href="mailto:hello@bitlore.io"
                className="underline hover:text-ct-ink"
              >
                hello@bitlore.io
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
