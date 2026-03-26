import { Button } from "@/components/Button";

interface LandingHeroProps {
  onStart: () => void;
}

export function LandingHero({ onStart }: LandingHeroProps) {
  return (
    <div className="px-6 py-12 md:py-20">
      {/* Hero */}
      <div className="mx-auto max-w-5xl grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        {/* Left column */}
        <div>
          <span
            className="inline-block font-ui text-ct-muted uppercase tracking-[0.12em] mb-4"
            style={{ fontSize: "var(--text-xs)", fontVariantCaps: "all-small-caps" }}
          >
            Interactive Copy Generator
          </span>

          <h1
            className="font-display font-bold leading-[1.1] mb-5"
            style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)" }}
          >
            Your Voice,
            <br />
            <em className="font-bold">Amplified.</em>
          </h1>

          <p
            className="font-ui text-ct-muted mb-4"
            style={{ fontSize: "var(--text-lg)" }}
          >
            AI-powered copy that remembers your voice.
          </p>

          <ol className="flex flex-col gap-4 mb-8 list-none p-0 m-0">
            {[
              { num: "1", title: "Create Voice Profile", desc: "Describe your brand, audience, and tone" },
              { num: "2", title: "Generate Copy", desc: "AI writes in your voice, for any format" },
              { num: "3", title: "Edit & Export", desc: "Refine in an interactive editor" },
            ].map((step) => (
              <li key={step.num} className="flex items-start gap-3">
                <span
                  className="font-display italic shrink-0 leading-none"
                  style={{ fontSize: "var(--text-3xl)" }}
                >
                  {step.num}
                </span>
                <div className="pt-1">
                  <h3
                    className="font-ui uppercase tracking-[0.08em] font-bold mb-0.5"
                    style={{ fontSize: "var(--text-sm)", fontVariantCaps: "all-small-caps" }}
                  >
                    {step.title}
                  </h3>
                  <p className="font-ui text-ct-muted" style={{ fontSize: "var(--text-sm)" }}>
                    {step.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Button variant="primary" onClick={onStart}>
            Get Started — Free
          </Button>
        </div>

        {/* Right column — mock editor preview */}
        <div className="flex justify-center md:justify-end">
          <div
            className="relative w-full max-w-xs"
            style={{ transform: "rotate(-3deg)" }}
          >
            {/* Prompt card — overlaps top of page */}
            <div
              className="absolute -top-4 -right-3 z-10 bg-ct-muted text-ct-white px-4 py-3"
              style={{
                maxWidth: "200px",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.08em] block mb-1.5"
              >
                hero_headline
              </span>
              <p
                className="font-ui leading-snug"
              >
                &ldquo;Write a bold headline for a boutique bakery&rdquo;
              </p>
            </div>

            {/* Page — white sheet, no radius, taller proportion */}
            <div
              className="bg-white dark:bg-ct-cream overflow-hidden"
              style={{
                boxShadow: "var(--shadow-md)",
                aspectRatio: "3 / 4",
                padding: "5rem 1.5rem",
              }}
            >
              <p
                className="font-display font-bold leading-snug mb-3"
                style={{ fontSize: "1.75rem" }}
              >
                Editing copy in a chat is a&nbsp;drag.
              </p>
              <p
                className="font-ui text-ct-muted leading-relaxed mb-3"
                style={{ fontSize: "var(--text-lg)" }}
              >
                Work directly with AI to refine your words, editing together in one smooth workspace.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
