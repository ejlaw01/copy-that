"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/Button";

// --- Sequence timing (ms) ---
const NOTE_DELAY = 200;       // note card drops in
const NOTE_DURATION = 500;    // note entrance animation length
const PAGE_DELAY = 1200;      // page slides in after note settles
const PAGE_DURATION = 1000;   // page slide animation length
const TYPE_START = 2400;      // typing begins after page lands
const TYPE_SPEED = 35;        // ms per character
const TYPE_PAUSE = 400;       // pause between headline and body

const HEADLINE = "Editing copy in a chat is a\u00a0drag.";
const BODY = "Work directly with AI to refine your words, editing together in one smooth workspace.";

/**
 * Reveals text character-by-character without layout shift.
 *
 * Instead of growing a substring (which reflows line breaks as partial
 * words wrap differently), we always render the FULL text — the typed
 * portion is visible, the rest is transparent. The browser lays out the
 * complete string every frame, so line breaks never change. We just
 * move the color boundary forward.
 */
function useTypewriter(text: string, startDelay: number, speed: number) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  const tick = useCallback(() => {
    setCount((prev) => {
      if (prev >= text.length) return prev;
      return prev + 1;
    });
  }, [text.length]);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), startDelay);
    return () => clearTimeout(startTimer);
  }, [startDelay]);

  useEffect(() => {
    if (!started) return;
    const interval = setInterval(tick, speed);
    return () => clearInterval(interval);
  }, [started, tick, speed]);

  return {
    typed: text.slice(0, count),
    untyped: text.slice(count),
    typing: started && count < text.length,
    done: count >= text.length,
  };
}

interface LandingHeroProps {
  onStart: () => void;
}

export function LandingHero({ onStart }: LandingHeroProps) {
  const [pageVisible, setPageVisible] = useState(false);
  const headlineRef = useRef<HTMLParagraphElement>(null);

  // Show page element after its delay so the slide-in animation fires
  useEffect(() => {
    const timer = setTimeout(() => setPageVisible(true), PAGE_DELAY);
    return () => clearTimeout(timer);
  }, []);

  const headline = useTypewriter(HEADLINE, TYPE_START, TYPE_SPEED);
  // Body starts after headline finishes: TYPE_START + headline chars * speed + pause
  const bodyDelay = TYPE_START + HEADLINE.length * TYPE_SPEED + TYPE_PAUSE;
  const body = useTypewriter(BODY, bodyDelay, TYPE_SPEED);

  return (
    <div className="px-6 py-12 md:py-20">
      {/* Hero */}
      <div className="mx-auto max-w-5xl grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        {/* Left column */}
        <div
          style={{
            animation: "hero-enter 0.5s ease-out both",
          }}
        >
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
            Get Started
          </Button>
        </div>

        {/* Right column — mock editor preview */}
        <div className="flex justify-center md:justify-end px-6 pt-6 md:px-0 md:pt-0 md:pr-6">
          <div className="@container relative w-full">
            {/* Prompt card — drops in first */}
            <div
              className="absolute z-10 bg-ct-muted text-ct-white"
              style={{
                top: "-5%",
                right: "-3%",
                width: "60%",
                padding: "3.5cqi 4cqi",
                boxShadow: "var(--shadow-md)",
                animation: `note-enter ${NOTE_DURATION}ms ease-out both`,
                animationDelay: `${NOTE_DELAY}ms`,
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.08em] block"
                style={{ fontSize: "3.8cqi", marginBottom: "1.5cqi" }}
              >
                hero_headline
              </span>
              <p
                className="font-ui leading-snug"
                style={{ fontSize: "3.8cqi" }}
              >
                &ldquo;Write a bold hero headline for an AI-generated copy editor&rdquo;
              </p>
            </div>

            {/* Page — slides in after note, text types out after landing */}
            <div
              className="relative"
              style={{
                aspectRatio: "3 / 4",
                opacity: pageVisible ? 1 : 0,
                animation: pageVisible
                  ? `page-slide-in ${PAGE_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) both`
                  : "none",
              }}
            >
              {/* SVG page shape */}
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 300 400"
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{ filter: "drop-shadow(0 4px 12px rgba(28,25,23,0.10))" }}
              >
                <polygon
                  points="0,0 300,0 300,400 38,400 0,362"
                  className="fill-white dark:fill-ct-cream"
                />
                <path
                  d="M0,362 C12.158,362 24.044,360.603 38,355.791 C37.093,372.118 35.564,381.083 38,400 L0,362 Z"
                  className="fill-ct-rule"
                />
              </svg>

              {/* Text content — typed out.
                  Full text is always in the DOM so line breaks are stable.
                  The typed portion is visible; the rest is transparent. */}
              <div
                className="relative flex flex-col justify-center h-full"
                style={{ padding: "0 7cqi 40px" }}
              >
                <p
                  className="font-display font-bold leading-snug"
                  style={{ fontSize: "8.5cqi", marginBottom: "2.5cqi" }}
                >
                  <span>{headline.typed}</span>
                  <span style={{ color: "transparent" }}>{headline.untyped}</span>
                </p>
                <p
                  className="font-ui leading-relaxed"
                  style={{ fontSize: "5.2cqi", marginBottom: "2.5cqi" }}
                >
                  <span className="text-ct-muted">{body.typed}</span>
                  <span style={{ color: "transparent" }}>{body.untyped}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
