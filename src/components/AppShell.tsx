"use client";

import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SavePrompt } from "@/components/SavePrompt";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { useAppSession } from "@/lib/use-app-session";

type AppSession = ReturnType<typeof useAppSession>;

interface AppShellProps {
  session: AppSession;
  children: ReactNode;
}

/**
 * Shared page chrome: header, modals, and the min-h-screen container.
 * Content-routing logic stays in the page component via early returns;
 * the shell just wraps whatever content each branch produces.
 */
export function AppShell({ session: s, children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <AppHeader
        authChecked={s.authChecked}
        isAuthenticated={s.isAuthenticated}
        isDemo={s.isDemo}
        userEmail={s.userEmail}
        syncStatus={s.syncStatus}
        sessionIndicator={s.sessionIndicator}
        activeContextExists={!!s.activeContext}
        onSignIn={() => s.setShowSavePrompt(true)}
      />

      {children}

      {s.showSavePrompt && (
        <SavePrompt
          onAuthComplete={() => s.setShowSavePrompt(false)}
          onDismiss={() => s.setShowSavePrompt(false)}
        />
      )}

      {s.confirmDialog && (
        <ConfirmDialog
          message={s.confirmDialog.message}
          onConfirm={s.confirmDialog.onConfirm}
          onCancel={() => s.setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
