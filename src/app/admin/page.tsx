import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

async function getStats() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: totalUsers },
    { count: totalGenerations },
    { count: todayGenerations },
    { count: weekGenerations },
    { count: monthGenerations },
    { count: marketingConsent },
    { data: recentSignups },
    { data: topComponents },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("usage_log").select("*", { count: "exact", head: true }).eq("event_type", "generation"),
    supabaseAdmin.from("usage_log").select("*", { count: "exact", head: true }).eq("event_type", "generation").gte("created_at", todayStart),
    supabaseAdmin.from("usage_log").select("*", { count: "exact", head: true }).eq("event_type", "generation").gte("created_at", weekStart),
    supabaseAdmin.from("usage_log").select("*", { count: "exact", head: true }).eq("event_type", "generation").gte("created_at", monthStart),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("marketing_consent", true),
    supabaseAdmin.from("profiles").select("id, created_at").order("created_at", { ascending: false }).limit(10),
    supabaseAdmin.from("usage_log").select("component_type").eq("event_type", "generation").not("component_type", "is", null).limit(1000),
  ]);

  // Count component types manually
  const componentCounts: Record<string, number> = {};
  if (topComponents) {
    for (const row of topComponents) {
      const ct = row.component_type as string;
      componentCounts[ct] = (componentCounts[ct] || 0) + 1;
    }
  }
  const sortedComponents = Object.entries(componentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return {
    totalUsers: totalUsers ?? 0,
    totalGenerations: totalGenerations ?? 0,
    todayGenerations: todayGenerations ?? 0,
    weekGenerations: weekGenerations ?? 0,
    monthGenerations: monthGenerations ?? 0,
    marketingConsent: marketingConsent ?? 0,
    recentSignups: recentSignups ?? [],
    topComponents: sortedComponents,
  };
}

export default async function AdminPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    redirect("/");
  }

  const stats = await getStats();

  return (
    <div className="min-h-screen bg-ct-paper text-ct-ink">
      <header className="border-b border-ct-rule px-6 py-4">
        <h1 className="font-display text-lg font-semibold tracking-tight">Copy That — Admin</h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        {/* Overview */}
        <section>
          <h2 className="ct-label mb-4">Overview</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Users" value={stats.totalUsers} />
            <StatCard label="Marketing Opt-in" value={stats.marketingConsent} />
            <StatCard label="Total Generations" value={stats.totalGenerations} />
            <StatCard label="Today" value={stats.todayGenerations} />
          </div>
        </section>

        {/* Generation Activity */}
        <section>
          <h2 className="ct-label mb-4">Generation Activity</h2>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Today" value={stats.todayGenerations} />
            <StatCard label="This Week" value={stats.weekGenerations} />
            <StatCard label="This Month" value={stats.monthGenerations} />
          </div>
        </section>

        {/* Top Components */}
        {stats.topComponents.length > 0 && (
          <section>
            <h2 className="ct-label mb-4">Top Component Types</h2>
            <div className="space-y-2">
              {stats.topComponents.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between rounded-[--radius-md] bg-ct-cream px-4 py-2 text-sm">
                  <span>{type}</span>
                  <span className="text-ct-muted">{count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Signups */}
        {stats.recentSignups.length > 0 && (
          <section>
            <h2 className="ct-label mb-4">Recent Signups</h2>
            <div className="space-y-1">
              {stats.recentSignups.map((u: { id: string; created_at: string }) => (
                <div key={u.id} className="text-sm text-ct-muted">
                  {new Date(u.created_at).toLocaleDateString()} — {u.id.slice(0, 8)}...
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[--radius-md] border border-ct-rule px-4 py-3">
      <p className="font-display text-2xl font-semibold">{value}</p>
      <p className="text-[length:--text-xs] text-ct-muted">{label}</p>
    </div>
  );
}
