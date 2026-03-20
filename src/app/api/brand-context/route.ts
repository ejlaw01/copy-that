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
  const ctx = body.brand_context;
  if (!ctx?.id || !ctx?.name) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = getAdminClient();

  const { error } = await admin.from("brand_contexts").upsert(
    {
      id: ctx.id,
      user_id: user.id,
      name: ctx.name,
      business_name: ctx.business_name ?? "",
      business_description: ctx.business_description ?? "",
      audience: ctx.audience ?? "",
      tone: ctx.tone ?? "",
      tone_examples: ctx.tone_examples ?? "",
      competitors: ctx.competitors ?? "",
      source_url: ctx.source_url ?? "",
      source_content: ctx.source_content ?? null,
      competitor_url: ctx.competitor_url ?? "",
      competitor_analysis: ctx.competitor_analysis ?? "",
      voice_profile: ctx.voice_profile ?? "",
    },
    { onConflict: "id" },
  );

  if (error) {
    return NextResponse.json(
      { error: `Failed to save brand context: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
