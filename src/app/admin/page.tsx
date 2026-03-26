import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

interface UserRow {
  id: string;
  email: string;
  createdAt: string;
  lastActive: string | null;
  totalGenerations: number;
  saves: number;
  contexts: number;
  marketingConsent: boolean;
}

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
    { data: topComponents },
    { data: profiles },
    { data: { users: authUsers } },
    { data: brandContexts },
    { data: copyBlocks },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("usage_log").select("*", { count: "exact", head: true }).eq("event_type", "generation"),
    supabaseAdmin.from("usage_log").select("*", { count: "exact", head: true }).eq("event_type", "generation").gte("created_at", todayStart),
    supabaseAdmin.from("usage_log").select("*", { count: "exact", head: true }).eq("event_type", "generation").gte("created_at", weekStart),
    supabaseAdmin.from("usage_log").select("*", { count: "exact", head: true }).eq("event_type", "generation").gte("created_at", monthStart),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("marketing_consent", true),
    supabaseAdmin.from("usage_log").select("component_type").eq("event_type", "generation").not("component_type", "is", null).limit(1000),
    supabaseAdmin.from("profiles").select("id, created_at, last_active_at, total_generations, marketing_consent"),
    supabaseAdmin.auth.admin.listUsers(),
    supabaseAdmin.from("brand_contexts").select("user_id"),
    supabaseAdmin.from("copy_blocks").select("brand_context_id, brand_contexts(user_id)"),
  ]);

  // Count component types
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

  // Build email lookup from auth users
  const emailMap = new Map<string, string>();
  for (const u of authUsers ?? []) {
    if (u.email) emailMap.set(u.id, u.email);
  }

  // Count brand contexts per user
  const contextCounts = new Map<string, number>();
  for (const row of brandContexts ?? []) {
    const uid = row.user_id as string;
    contextCounts.set(uid, (contextCounts.get(uid) || 0) + 1);
  }

  // Count copy blocks per user (through brand_contexts join)
  const blockCounts = new Map<string, number>();
  for (const row of copyBlocks ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bc = (row as any).brand_contexts as { user_id: string } | null;
    if (bc?.user_id) {
      blockCounts.set(bc.user_id, (blockCounts.get(bc.user_id) || 0) + 1);
    }
  }

  // Merge into user list
  const users: UserRow[] = (profiles ?? []).map((p) => ({
    id: p.id as string,
    email: emailMap.get(p.id as string) ?? "unknown",
    createdAt: p.created_at as string,
    lastActive: p.last_active_at as string | null,
    totalGenerations: (p.total_generations as number) ?? 0,
    saves: blockCounts.get(p.id as string) ?? 0,
    contexts: contextCounts.get(p.id as string) ?? 0,
    marketingConsent: p.marketing_consent as boolean,
  }));

  // Sort by most recently active
  users.sort((a, b) => {
    if (!a.lastActive) return 1;
    if (!b.lastActive) return -1;
    return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
  });

  return {
    totalUsers: totalUsers ?? 0,
    totalGenerations: totalGenerations ?? 0,
    todayGenerations: todayGenerations ?? 0,
    weekGenerations: weekGenerations ?? 0,
    monthGenerations: monthGenerations ?? 0,
    marketingConsent: marketingConsent ?? 0,
    topComponents: sortedComponents,
    users,
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

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
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

        {/* Top Categories */}
        {stats.topComponents.length > 0 && (
          <section>
            <h2 className="ct-label mb-4">Top Categories</h2>
            <ul className="space-y-2 list-none p-0 m-0">
              {stats.topComponents.map(([type, count]) => (
                <li key={type} className="flex items-center justify-between rounded-[--radius-md] bg-ct-cream px-4 py-2 text-sm">
                  <span>{type}</span>
                  <span className="text-ct-muted">{count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Users */}
        {stats.users.length > 0 && (
          <section>
            <h2 className="ct-label mb-4">Users</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ct-rule text-left text-xs text-ct-muted">
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 font-medium">Signed up</th>
                    <th className="pb-2 pr-4 font-medium">Last active</th>
                    <th className="pb-2 pr-4 font-medium text-right">Generations</th>
                    <th className="pb-2 pr-4 font-medium text-right">Saves</th>
                    <th className="pb-2 font-medium text-right">Contexts</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.users.map((u) => (
                    <tr key={u.id} className="border-b border-ct-rule/50">
                      <td className="py-2.5 pr-4">
                        {u.email}
                        {u.marketingConsent && (
                          <span className="ml-1.5 text-[10px] text-ct-muted" title="Marketing opt-in">*</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-ct-muted">{formatDate(u.createdAt)}</td>
                      <td className="py-2.5 pr-4 text-ct-muted">{u.lastActive ? formatRelative(u.lastActive) : "never"}</td>
                      <td className="py-2.5 pr-4 text-right">{u.totalGenerations}</td>
                      <td className="py-2.5 pr-4 text-right">{u.saves}</td>
                      <td className="py-2.5 text-right">{u.contexts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRelative(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}
