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

  // Verify ownership before deleting
  const { data: ctx } = await admin
    .from("brand_contexts")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!ctx) {
    return NextResponse.json(
      { error: "Brand context not found or not owned by user" },
      { status: 403 },
    );
  }

  // Explicit child deletion as safety net — DB has ON DELETE CASCADE,
  // but this ensures cleanup even if the constraint is ever removed.
  await admin.from("copy_blocks").delete().eq("brand_context_id", id);

  const { error } = await admin.from("brand_contexts").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete brand context: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
