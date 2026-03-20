import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { brand_contexts, copy_blocks, marketing_consent } = body;

  if (!Array.isArray(brand_contexts)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Update marketing consent on profile
  if (typeof marketing_consent === "boolean") {
    await supabase
      .from("profiles")
      .update({
        marketing_consent,
        marketing_consent_date: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  // Map local IDs to server IDs for brand contexts
  const idMap = new Map<string, string>();

  for (const ctx of brand_contexts) {
    const { data, error } = await supabase
      .from("brand_contexts")
      .insert({
        user_id: user.id,
        name: ctx.name,
        is_default: ctx.id === body.active_context_id,
        business_name: ctx.business_name,
        business_description: ctx.business_description,
        audience: ctx.audience,
        tone: ctx.tone,
        tone_examples: ctx.tone_examples,
        competitors: ctx.competitors,
        source_url: ctx.source_url,
        source_content: ctx.source_content,
        competitor_url: ctx.competitor_url,
        competitor_analysis: ctx.competitor_analysis,
        voice_profile: ctx.voice_profile,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to migrate brand context: ${error.message}` },
        { status: 500 }
      );
    }

    idMap.set(ctx.id, data.id);
  }

  // Migrate copy blocks
  if (Array.isArray(copy_blocks) && copy_blocks.length > 0) {
    const blocks = copy_blocks
      .map((block: { brand_context_id: string; component_type: string; title?: string; user_prompt?: string; content: unknown; ai_notes: unknown; version: number }) => {
        const newContextId = idMap.get(block.brand_context_id);
        if (!newContextId) return null;
        return {
          brand_context_id: newContextId,
          component_type: block.component_type,
          title: block.title ?? "",
          user_prompt: block.user_prompt ?? "",
          content: block.content,
          ai_notes: block.ai_notes,
          version: block.version,
        };
      })
      .filter(Boolean);

    if (blocks.length > 0) {
      const { error } = await supabase.from("copy_blocks").insert(blocks);
      if (error) {
        return NextResponse.json(
          { error: `Failed to migrate copy blocks: ${error.message}` },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ success: true, migrated_contexts: idMap.size });
}
