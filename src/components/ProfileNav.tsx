"use client";

import { Pencil, ChevronDown, Plus } from "lucide-react";
import type { BrandContext } from "@/lib/session-storage";

const MAX_PROFILES = 10;

interface ProfileNavProps {
  contexts: BrandContext[];
  activeTab: string;
  activeContext: BrandContext | null;
  editing: boolean;
  profileMenuOpen: boolean;
  profileMenuRef: React.RefObject<HTMLDivElement | null>;
  pickerSlotRef: (el: HTMLDivElement | null) => void;
  onSwitchProfile: (id: string) => void;
  onSwitchNew: () => void;
  onToggleMenu: () => void;
  onEditClick: () => void;
}

export function ProfileNav({
  contexts,
  activeTab,
  activeContext,
  editing,
  profileMenuOpen,
  profileMenuRef,
  pickerSlotRef,
  onSwitchProfile,
  onSwitchNew,
  onToggleMenu,
  onEditClick,
}: ProfileNavProps) {
  return (
    <nav aria-label="Profile navigation">
      {/* Row 1 — Profile + details */}
      <div className="flex items-center gap-3 py-3 px-6">
        <div ref={profileMenuRef} className="relative shrink-0">
          <button
            onClick={onToggleMenu}
            className="flex items-center gap-1.5 text-base font-semibold font-ui text-ct-ink hover:text-ct-accent transition-colors cursor-pointer"
          >
            {activeContext?.name || (activeTab === "new" ? "New Profile" : "Select Profile")}
            <ChevronDown size={14} className={`text-ct-muted transition-transform ${profileMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {profileMenuOpen && (
            <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-ct-paper border border-ct-rule rounded-[--radius-md] shadow-md z-30">
              {contexts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSwitchProfile(c.id);
                    onToggleMenu();
                  }}
                  className={`w-full text-left px-3 py-2 text-sm font-ui transition-colors ${
                    activeTab === c.id
                      ? "text-ct-ink font-medium bg-ct-cream"
                      : "text-ct-muted hover:text-ct-ink hover:bg-ct-rule"
                  }`}
                >
                  {c.name || "Untitled"}
                </button>
              ))}
              {contexts.length < MAX_PROFILES && (
                <>
                  {contexts.length > 0 && <div className="border-t border-ct-rule" />}
                  <button
                    onClick={() => {
                      onSwitchNew();
                      onToggleMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm font-ui text-ct-muted hover:text-ct-ink hover:bg-ct-rule transition-colors flex items-center gap-1.5"
                  >
                    <Plus size={12} />
                    New Profile
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {activeContext && !editing && (
          <>
            <p className="text-sm text-ct-muted flex-1">
              {[activeContext.audience, activeContext.tone].filter(Boolean).join(" · ")}
            </p>
            <button
              onClick={onEditClick}
              className="shrink-0 text-ct-muted hover:text-ct-ink transition-colors"
              aria-label="Edit profile"
            >
              <Pencil size={16} />
            </button>
          </>
        )}
      </div>

      {/* Row 2 — Copy block tabs with tree connector */}
      <div
        className="flex items-end px-6"
        style={{
          backgroundImage: 'linear-gradient(to bottom, transparent 33px, var(--ct-rule) 33px, var(--ct-rule) 34px, transparent 34px)',
          backgroundSize: '100% 34px',
          backgroundPosition: '0 0',
        }}
      >
        {/* L-shaped tree connector */}
        <div className="shrink-0 w-5 mr-2 self-start">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-ct-rule">
            <path d="M4 0 L4 12 L18 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <div
          ref={pickerSlotRef}
          className="flex items-end gap-x-1 flex-1 flex-wrap"
        />
      </div>
    </nav>
  );
}
