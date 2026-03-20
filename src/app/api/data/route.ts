import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  // Use the anon/cookie client for identity only
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use admin client for data queries — bypasses RLS, same pattern as rate-limit.ts.
  // Why admin instead of the anon client? RLS policies may not grant SELECT
  // on all columns (e.g., voice_profile, source_content), and the admin client
  // avoids policy-mismatch bugs entirely for a read-your-own-data endpoint.
  const admin = getAdminClient();

  const { data: contexts, error: ctxError } = await admin
    .from("brand_contexts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (ctxError) {
    return NextResponse.json(
      { error: `Failed to fetch brand contexts: ${ctxError.message}` },
      { status: 500 },
    );
  }

  // Find copy blocks for all of this user's brand contexts
  let copyBlocks: Record<string, unknown>[] = [];
  if (contexts && contexts.length > 0) {
    const contextIds = contexts.map((c) => c.id);
    console.log(`[/api/data] ${contexts.length} brand contexts, ${contextIds.length} IDs for copy_blocks .in() query`);

    const { data: blocks, error: blockError } = await admin
      .from("copy_blocks")
      .select("*")
      .in("brand_context_id", contextIds)
      .order("created_at", { ascending: false });

    if (blockError) {
      // Non-fatal: return profiles without copy blocks rather than
      // failing the entire load. The user can still see and edit
      // their brand contexts; blocks will load on the next attempt.
      console.error("[/api/data] copy_blocks query failed:", blockError.message, blockError);
    } else {
      console.log(`[/api/data] ${blocks?.length ?? 0} copy blocks loaded`);
      copyBlocks = blocks ?? [];
    }
  }

  // Find the default context (or fall back to the first one)
  const defaultCtx = contexts?.find((c) => c.is_default) ?? contexts?.[0];

  // Map Supabase rows → client interfaces (drop server-only fields)
  const mappedContexts = (contexts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    business_name: c.business_name ?? "",
    business_description: c.business_description ?? "",
    audience: c.audience ?? "",
    tone: c.tone ?? "",
    tone_examples: c.tone_examples ?? "",
    competitors: c.competitors ?? "",
    source_url: c.source_url ?? "",
    source_content: c.source_content ?? null,
    competitor_url: c.competitor_url ?? "",
    competitor_analysis: c.competitor_analysis ?? "",
    voice_profile: c.voice_profile ?? "",
  }));

  const mappedBlocks = copyBlocks.map((b) => ({
    id: b.id as string,
    brand_context_id: b.brand_context_id as string,
    component_type: b.component_type as string,
    title: (b.title as string) ?? "",
    user_prompt: (b.user_prompt as string) ?? "",
    content: b.content,
    ai_notes: b.ai_notes,
    version: (b.version as number) ?? 1,
    created_at: b.created_at as string,
  }));

  return NextResponse.json({
    brand_contexts: mappedContexts,
    copy_blocks: mappedBlocks,
    active_context_id: defaultCtx?.id ?? null,
  });
}
