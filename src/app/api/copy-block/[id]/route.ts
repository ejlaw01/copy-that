import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();

  // Verify ownership: the block's parent brand context must belong to this user.
  // A single joined query would be cleaner, but Supabase JS client doesn't
  // support joins on delete — so we look up the block, then check the parent.
  const { data: block } = await admin
    .from("copy_blocks")
    .select("id, brand_context_id")
    .eq("id", id)
    .single();

  if (!block) {
    return NextResponse.json(
      { error: "Copy block not found" },
      { status: 404 },
    );
  }

  const { data: parentCtx } = await admin
    .from("brand_contexts")
    .select("id")
    .eq("id", block.brand_context_id)
    .eq("user_id", user.id)
    .single();

  if (!parentCtx) {
    return NextResponse.json(
      { error: "Not authorized to delete this block" },
      { status: 403 },
    );
  }

  const { error } = await admin.from("copy_blocks").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete copy block: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
