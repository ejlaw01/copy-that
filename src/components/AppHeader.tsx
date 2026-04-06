"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { AnimatedEllipsis } from "@/components/AnimatedEllipsis";

interface AppHeaderProps {
  authChecked: boolean;
  isAuthenticated: boolean;
  userEmail: string | null;
  syncStatus: "idle" | "saving" | "saved" | "error";
  sessionIndicator: boolean;
  activeContextExists: boolean;
  onSignIn: () => void;
}

export function AppHeader({
  authChecked,
  isAuthenticated,
  userEmail,
  syncStatus,
  sessionIndicator,
  activeContextExists,
  onSignIn,
}: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-ct-cream text-ct-ink">
      <h1 className="font-display text-lg font-semibold tracking-tight">Copy <span className="text-ct-accent">That</span></h1>
      <div className="flex items-center gap-3">
        {authChecked && sessionIndicator && !isAuthenticated && activeContextExists && (
          <button
            onClick={onSignIn}
            className="text-xs text-ct-muted hover:text-ct-ink transition-colors"
          >
            unsaved — session only
          </button>
        )}
        {isAuthenticated && syncStatus === "saving" && (
          <span className="text-xs text-ct-muted">Saving<AnimatedEllipsis /></span>
        )}
        {isAuthenticated && syncStatus === "saved" && (
          <span className="text-xs text-ct-muted">Saved</span>
        )}
        {isAuthenticated && syncStatus === "error" && (
          <span className="text-xs text-ct-strike">Sync failed</span>
        )}
        {userEmail ? (
          userEmail === process.env.NEXT_PUBLIC_ADMIN_EMAIL ? (
            <a href="/admin" className="text-xs text-ct-muted hover:text-ct-ink transition-colors">
              {userEmail}
            </a>
          ) : (
            <span className="text-xs text-ct-muted">{userEmail}</span>
          )
        ) : authChecked && (
          <button
            onClick={onSignIn}
            className="text-xs font-ui text-ct-muted hover:text-ct-ink transition-colors"
          >
            Sign in
          </button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
