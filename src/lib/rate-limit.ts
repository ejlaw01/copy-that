import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const ANON_LIMIT = 6;
const AUTH_DAILY_LIMIT = 50;
const ANALYSIS_LIMIT = 100;
const ANALYSIS_ANON_LIMIT = 10;

// In-memory store for anonymous IP rate limiting
// In production on Vercel, each serverless instance has its own memory,
// so this is approximate — but sufficient for v1.
const ipCounts = new Map<string, { count: number; resetAt: number }>();
const analysisIpCounts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  isAuthenticated: boolean;
  userId?: string;
}

export async function checkRateLimit(
  req: NextRequest
): Promise<RateLimitResult> {
  // Check if user is authenticated
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Authenticated: check daily limit in profiles table
    const { data: profile } = await supabase
      .from("profiles")
      .select("generation_count_today, generation_count_date")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return { allowed: false, remaining: 0, isAuthenticated: true, userId: user.id };
    }

    const today = new Date().toISOString().split("T")[0];
    let countToday = profile.generation_count_today;

    // Reset if new day
    if (profile.generation_count_date !== today) {
      countToday = 0;
      await supabase
        .from("profiles")
        .update({ generation_count_today: 0, generation_count_date: today })
        .eq("id", user.id);
    }

    return {
      allowed: countToday < AUTH_DAILY_LIMIT,
      remaining: Math.max(0, AUTH_DAILY_LIMIT - countToday),
      isAuthenticated: true,
      userId: user.id,
    };
  }

  // Anonymous: IP-based rate limiting
  const ip = getClientIp(req);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + dayMs };
    ipCounts.set(ip, entry);
  }

  return {
    allowed: entry.count < ANON_LIMIT,
    remaining: Math.max(0, ANON_LIMIT - entry.count),
    isAuthenticated: false,
  };
}

export async function incrementRateLimit(
  req: NextRequest,
  userId?: string
): Promise<void> {
  if (userId) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const today = new Date().toISOString().split("T")[0];

    const { data: profile } = await supabase
      .from("profiles")
      .select("generation_count_today, generation_count_date, total_generations")
      .eq("id", userId)
      .single();

    const currentCount =
      profile?.generation_count_date === today
        ? (profile.generation_count_today ?? 0)
        : 0;

    const totalGen = (profile?.total_generations ?? 0) + 1;

    await supabase
      .from("profiles")
      .update({
        generation_count_today: currentCount + 1,
        generation_count_date: today,
        total_generations: totalGen,
        last_active_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } else {
    const ip = getClientIp(req);
    const entry = ipCounts.get(ip);
    if (entry) {
      entry.count++;
    }
  }
}

// Analysis rate limiting — in-memory only, no DB columns needed
export function checkAnalysisRateLimit(req: NextRequest, isAuthenticated: boolean): RateLimitResult {
  const ip = getClientIp(req);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let entry = analysisIpCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + dayMs };
    analysisIpCounts.set(ip, entry);
  }

  const limit = isAuthenticated ? ANALYSIS_LIMIT : ANALYSIS_ANON_LIMIT;

  return {
    allowed: entry.count < limit,
    remaining: Math.max(0, limit - entry.count),
    isAuthenticated,
  };
}

export function incrementAnalysisRateLimit(req: NextRequest): void {
  const ip = getClientIp(req);
  const entry = analysisIpCounts.get(ip);
  if (entry) {
    entry.count++;
  }
}
