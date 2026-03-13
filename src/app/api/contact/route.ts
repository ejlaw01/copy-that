import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, message } = body;

  if (!message || typeof message !== "string" || message.length > 2000) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Store in usage_log as a contact event (reusing existing table)
  await supabaseAdmin.from("usage_log").insert({
    event_type: "auth", // Reusing enum — closest fit for contact
    session_id: `contact:${email || "anonymous"}`,
    component_type: `name:${name || "unknown"} | message:${message}`,
  });

  return NextResponse.json({ success: true });
}
