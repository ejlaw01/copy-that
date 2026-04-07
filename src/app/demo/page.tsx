"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { demoContexts, demoBlocks } from "@/lib/demo-seed";

const STORAGE_KEY = "copythat_session";

/**
 * /demo — seeds sessionStorage with demo profiles and copy blocks,
 * then redirects to the main app at the first profile's route.
 *
 * This is a "trampoline" page: it renders nothing visible, just
 * performs the side effect and navigates away. useEffect ensures
 * we only touch sessionStorage on the client (SSR-safe).
 */
export default function DemoPage() {
  const router = useRouter();

  useEffect(() => {
    const firstContext = demoContexts[0];

    // Flag tells useAppSession to skip Supabase hydration and use
    // the seeded sessionStorage data instead. Cleared on navigate away.
    sessionStorage.setItem("copythat_demo", "1");

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        brand_contexts: demoContexts,
        active_context_id: firstContext.id,
        copy_blocks: demoBlocks,
        generation_count: 0,
        active_block_id: demoBlocks.find(
          (b) => b.brand_context_id === firstContext.id
        )?.id ?? null,
        active_block_per_context: Object.fromEntries(
          demoContexts.map((ctx) => [
            ctx.id,
            demoBlocks.find((b) => b.brand_context_id === ctx.id)?.id ?? "",
          ])
        ),
      })
    );

    router.replace(`/#${firstContext.slug}`);
  }, [router]);

  return null;
}
