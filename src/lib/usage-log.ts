import { createClient } from "@supabase/supabase-js";

// Uses service role key to bypass RLS — allows logging for anonymous users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type EventType =
  | "generation"
  | "voice_extraction"
  | "url_extraction"
  | "export"
  | "auth";

export async function logUsage({
  userId,
  sessionId,
  eventType,
  componentType,
  tokensIn,
  tokensOut,
}: {
  userId?: string;
  sessionId?: string;
  eventType: EventType;
  componentType?: string;
  tokensIn?: number;
  tokensOut?: number;
}) {
  try {
    await supabaseAdmin.from("usage_log").insert({
      user_id: userId ?? null,
      session_id: sessionId ?? null,
      event_type: eventType,
      component_type: componentType ?? null,
      tokens_in: tokensIn ?? null,
      tokens_out: tokensOut ?? null,
    });
  } catch {
    // Non-blocking — don't fail the request if logging fails
  }
}
