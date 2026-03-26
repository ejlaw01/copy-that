"use client";

import { GenerationWorkspace } from "@/components/GenerationWorkspace";
import { LandingHero } from "@/components/LandingHero";
import { AppShell } from "@/components/AppShell";
import { ProfileNav } from "@/components/ProfileNav";
import { BrandForm } from "@/components/BrandForm";
import { AnimatedEllipsis } from "@/components/AnimatedEllipsis";
import { useAppSession } from "@/lib/use-app-session";
import {
  getSession,
  setActiveBlockForContext,
  type BrandContext,
} from "@/lib/session-storage";

export default function Home() {
  const s = useAppSession();

  // ── Loading ────────────────────────────────────────────────────
  if (s.isLoading) {
    return (
      <AppShell session={s}>
        {!s.showHero && (
          <main className="px-6 py-8">
            <div className="mx-auto max-w-4xl flex items-center justify-center py-24">
              <span className="text-sm text-ct-muted">Loading<AnimatedEllipsis /></span>
            </div>
          </main>
        )}
      </AppShell>
    );
  }

  // ── First-time visitor hero ────────────────────────────────────
  if (s.showHero) {
    return (
      <AppShell session={s}>
        <LandingHero onStart={() => s.navigate("new")} />
      </AppShell>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────

  function handleToggleMenu() {
    s.setProfileMenuOpen((prev) => !prev);
  }

  function handleEditClick() {
    s.setForm(s.activeContext!);
    s.setEditing(true);
  }

  function handleCancelEdit() {
    s.setForm(s.activeContext!);
    s.setEditing(false);
  }

  function handleDeleteClick() {
    s.setConfirmDialog({
      message: `Delete "${s.activeContext?.name || "this profile"}" and all its copy blocks?`,
      onConfirm: () => {
        s.handleDelete(s.activeTab);
        s.setConfirmDialog(null);
      },
    });
  }

  function handleBlockChange(blockId: string | null) {
    const profileSlug = s.activeContext?.slug ?? "new";
    if (blockId === null) {
      s.replace(profileSlug, "new");
    } else {
      const session = getSession();
      const block = session.copy_blocks.find((b) => b.id === blockId);
      s.replace(profileSlug, block?.slug ?? blockId);
    }
    if (s.editing && blockId !== null) {
      s.setForm(s.activeContext!);
      s.setEditing(false);
    }
    if (s.activeContext) setActiveBlockForContext(s.activeContext.id, blockId);
  }


  function handleConfirm(message: string, onConfirm: () => void) {
    s.setConfirmDialog({
      message,
      onConfirm: () => { onConfirm(); s.setConfirmDialog(null); },
    });
  }

  // ── Main app ───────────────────────────────────────────────────
  return (
    <AppShell session={s}>
      <ProfileNav
        contexts={s.contexts}
        activeTab={s.activeTab}
        activeContext={s.activeContext}
        editing={s.editing}
        profileMenuOpen={s.profileMenuOpen}
        profileMenuRef={s.profileMenuRef}
        pickerSlotRef={s.setPickerSlot}
        onSwitchProfile={s.switchToProfile}
        onSwitchNew={s.switchToNew}
        onToggleMenu={handleToggleMenu}
        onEditClick={handleEditClick}
      />

      <main className="px-6 py-8">
        <div className="mx-auto max-w-4xl">
          {/* Extract warning — dismissible, non-blocking */}
          {s.extractWarning && (
            <div className="mb-6 flex items-start gap-3 rounded-[--radius-md] border border-ct-highlight/30 bg-ct-highlight/10 px-4 py-3 text-sm font-ui text-ct-muted">
              <p className="flex-1">{s.extractWarning}</p>
              <button
                onClick={() => s.setExtractWarning(null)}
                className="shrink-0 text-ct-muted hover:text-ct-ink transition-colors"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          )}

          {/* Profile form — shown for new profiles or when editing existing */}
          {(s.activeTab === "new" || (s.activeContext && s.editing)) && (
            <div className="mb-8">
              <BrandForm
                form={s.form}
                update={s.update}
                canGenerate={s.canGenerate}
                isNew={s.activeTab === "new"}
                onSave={s.activeTab === "new" ? s.handleSaveNew : s.handleSaveEdits}
                onCancel={s.activeTab !== "new" ? handleCancelEdit : undefined}
                onDelete={s.activeTab !== "new" ? handleDeleteClick : undefined}
              />
            </div>
          )}

          {/* Generation workspace — always mounted when context exists (for portal),
              but main content hidden during editing */}
          {s.activeContext && <GenerationWorkspace
            hidden={s.editing}
            pickerSlot={s.pickerSlot}
            context={s.activeContext}
            blockId={s.route.blockId}
            onBlockChange={handleBlockChange}
            form={s.form as BrandContext}
            canGenerate={s.canGenerate}
            ensureContext={s.ensureContext}
            onGenerate={s.checkSavePrompt}
            isAuthenticated={s.isAuthenticated}
            userEmail={s.userEmail}
            onSyncStatus={s.handleSyncStatus}
            onConfirm={handleConfirm}
          />}
        </div>
      </main>
    </AppShell>
  );
}
