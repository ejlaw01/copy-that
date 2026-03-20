"use client";

import { useState, useCallback, useEffect } from "react";

export interface HashRoute {
  profileId: string | null; // null = empty hash (first visit)
  blockId: string | null;   // null = no block segment
}

function parseHash(): HashRoute {
  const raw = typeof window !== "undefined" ? window.location.hash : "";
  const path = raw.replace(/^#\/?/, "");
  if (!path) return { profileId: null, blockId: null };

  const segments = path.split("/");
  const profileId = segments[0] || null;
  const blockId = segments[1] || null;
  return { profileId, blockId };
}

/**
 * Lightweight hash-based routing for single-page navigation.
 *
 * Slugs are passed through as-is — no truncation or transformation.
 * Hash format: `#/profile-slug` or `#/profile-slug/block-slug`.
 * The literal `"new"` is a valid slug for both profile and block positions.
 *
 * Two navigation helpers:
 * - `navigate()` pushes a history entry (tab clicks, profile creation)
 * - `replace()` swaps the current entry silently (corrective redirects,
 *    block switches within a profile)
 */
export function useHashRoute() {
  const [route, setRoute] = useState<HashRoute>(parseHash);

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback(
    (profileSlug: string, blockSlug?: string | null) => {
      const hash = blockSlug
        ? `#/${profileSlug}/${blockSlug}`
        : `#/${profileSlug}`;
      window.location.hash = hash;
    },
    [],
  );

  const replace = useCallback(
    (profileSlug: string, blockSlug?: string | null) => {
      const hash = blockSlug
        ? `#/${profileSlug}/${blockSlug}`
        : `#/${profileSlug}`;
      history.replaceState(null, "", hash);
      setRoute({ profileId: profileSlug, blockId: blockSlug ?? null });
    },
    [],
  );

  return { route, navigate, replace };
}
