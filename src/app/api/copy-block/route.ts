import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const block = body.copy_block;
  if (!block?.id || !block?.brand_context_id) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = getAdminClient();

  // Verify the parent brand context belongs to this user
  const { data: parentCtx } = await admin
    .from("brand_contexts")
    .select("id")
    .eq("id", block.brand_context_id)
    .eq("user_id", user.id)
    .single();

  if (!parentCtx) {
    return NextResponse.json(
      { error: "Brand context not found or not owned by user" },
      { status: 403 },
    );
  }

  const { error } = await admin.from("copy_blocks").upsert(
    {
      id: block.id,
      brand_context_id: block.brand_context_id,
      component_type: block.component_type,
      title: block.title ?? "",
      user_prompt: block.user_prompt ?? "",
      content: block.content,
      ai_notes: block.ai_notes,
      max_chars: block.max_chars ?? null,
      version: block.version ?? 1,
      created_at: block.created_at,
      slug: block.slug ?? "",
    },
    { onConflict: "id" },
  );

  if (error) {
    return NextResponse.json(
      { error: `Failed to save copy block: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
