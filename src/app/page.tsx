"use client";

import { useState, useEffect, useCallback } from "react";
import { BrandContextForm } from "@/components/BrandContextForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GenerationWorkspace } from "@/components/GenerationWorkspace";
import { SavePrompt } from "@/components/SavePrompt";
import { supabase } from "@/lib/supabase/client";
import {
  getSession,
  getActiveContext,
  setActiveContext,
  getGenerationCount,
  type BrandContext,
} from "@/lib/session-storage";

const ANON_GENERATION_LIMIT = 6;

type View = "setup" | "workspace";

export default function Home() {
  const [view, setView] = useState<View>("setup");
  const [activeContext, setActive] = useState<BrandContext | null>(null);
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionIndicator, setSessionIndicator] = useState(false);

  // Check auth state and listen for changes
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setIsAuthenticated(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setIsAuthenticated(true);
          setShowSavePrompt(false);

          // Migrate sessionStorage to Postgres
          const sessionData = getSession();
          if (sessionData.brand_contexts.length > 0) {
            const consent = sessionStorage.getItem("copythat_marketing_consent");
            await fetch("/api/migrate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...sessionData,
                marketing_consent: consent ? JSON.parse(consent) : true,
              }),
            });
            sessionStorage.removeItem("copythat_marketing_consent");
          }
        }

        if (event === "SIGNED_OUT") {
          setIsAuthenticated(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Load existing session
  useEffect(() => {
    const session = getSession();
    if (session.brand_contexts.length > 0) {
      setContexts(session.brand_contexts);
      setActive(getActiveContext());
      setView("workspace");
      setSessionIndicator(true);
    }
  }, []);

  // Show save prompt after first generation (subtle, dismissable)
  const checkSavePrompt = useCallback(() => {
    if (isAuthenticated) return;
    const count = getGenerationCount();
    if (count >= ANON_GENERATION_LIMIT) {
      setShowSavePrompt(true);
    } else if (count === 1) {
      // Show session indicator after first generation
      setSessionIndicator(true);
    }
  }, [isAuthenticated]);

  // Timer-based save prompt (5 minutes of active use)
  useEffect(() => {
    if (isAuthenticated || view !== "workspace") return;
    const timer = setTimeout(() => {
      if (!isAuthenticated) setShowSavePrompt(true);
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, view]);

  function handleContextComplete(ctx: BrandContext) {
    const session = getSession();
    setContexts(session.brand_contexts);
    setActive(ctx);
    setActiveContext(ctx.id);
    setView("workspace");
    setSessionIndicator(true);
  }

  function handleSwitchContext(id: string) {
    const session = setActiveContext(id);
    const ctx = session.brand_contexts.find((c) => c.id === id) ?? null;
    setActive(ctx);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-foreground/5">
        <h1 className="text-lg font-semibold tracking-tight">Copy That</h1>
        <div className="flex items-center gap-3">
          {/* Session indicator */}
          {sessionIndicator && !isAuthenticated && view === "workspace" && (
            <button
              onClick={() => setShowSavePrompt(true)}
              className="text-xs text-foreground/30 hover:text-foreground/50 transition-colors"
            >
              unsaved — session only
            </button>
          )}
          {isAuthenticated && (
            <span className="text-xs text-foreground/30">saved</span>
          )}
          {view === "workspace" && (
            <button
              onClick={() => setView("setup")}
              className="rounded-lg border border-foreground/10 px-3 py-1.5 text-xs text-foreground/60 hover:text-foreground transition-colors"
            >
              + New Voice
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="px-6 py-10">
        {view === "setup" && (
          <BrandContextForm onComplete={handleContextComplete} />
        )}

        {view === "workspace" && activeContext && (
          <Workspace
            context={activeContext}
            contexts={contexts}
            onSwitchContext={handleSwitchContext}
            onGenerate={checkSavePrompt}
          />
        )}
      </main>

      {/* Save prompt modal */}
      {showSavePrompt && (
        <SavePrompt
          onAuthComplete={() => setShowSavePrompt(false)}
          onDismiss={() => setShowSavePrompt(false)}
        />
      )}
    </div>
  );
}

function Workspace({
  context,
  contexts,
  onSwitchContext,
  onGenerate,
}: {
  context: BrandContext;
  contexts: BrandContext[];
  onSwitchContext: (id: string) => void;
  onGenerate: () => void;
}) {
  return (
    <div>
      {/* Brand context switcher */}
      {contexts.length > 1 && (
        <div className="mx-auto max-w-4xl mb-6 flex items-center gap-2">
          {contexts.map((c) => (
            <button
              key={c.id}
              onClick={() => onSwitchContext(c.id)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                c.id === context.id
                  ? "bg-foreground text-background"
                  : "bg-foreground/5 text-foreground/60 hover:text-foreground"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <GenerationWorkspace context={context} onGenerate={onGenerate} />
    </div>
  );
}
