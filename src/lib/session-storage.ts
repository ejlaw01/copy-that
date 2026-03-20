export interface BrandContext {
  id: string;
  name: string;
  business_name: string;
  business_description: string;
  audience: string;
  tone: string;
  tone_examples: string;
  competitors: string;
  source_url: string;
  source_content: Record<string, unknown> | null;
  competitor_url: string;
  competitor_analysis: string;
  voice_profile: string;
}

export interface CopyBlock {
  id: string;
  brand_context_id: string;
  component_type: string;
  title?: string;
  user_prompt?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ai_notes: any;
  version: number;
  created_at: string;
}

export interface DraftPrompt {
  category: string;
  user_prompt: string;
}

export interface SessionData {
  brand_contexts: BrandContext[];
  active_context_id: string | null;
  copy_blocks: CopyBlock[];
  generation_count: number;
  active_block_id: string | null;
  /** Per-profile draft prompt/category for the +New form */
  drafts?: Record<string, DraftPrompt>;
  /** Per-profile last active block ID */
  active_block_per_context?: Record<string, string>;
}

const STORAGE_KEY = "copythat_session";

function getDefault(): SessionData {
  return {
    brand_contexts: [],
    active_context_id: null,
    copy_blocks: [],
    generation_count: 0,
    active_block_id: null,
  };
}

export function getSession(): SessionData {
  if (typeof window === "undefined") return getDefault();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : getDefault();
  } catch {
    return getDefault();
  }
}

function saveSession(data: SessionData) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function newContextId(): string {
  return crypto.randomUUID();
}

export function saveBrandContext(ctx: BrandContext): SessionData {
  const session = getSession();
  const idx = session.brand_contexts.findIndex((c) => c.id === ctx.id);
  if (idx >= 0) {
    session.brand_contexts[idx] = ctx;
  } else {
    session.brand_contexts.push(ctx);
  }
  if (!session.active_context_id) {
    session.active_context_id = ctx.id;
  }
  saveSession(session);
  return session;
}

export function setActiveContext(id: string): SessionData {
  const session = getSession();
  session.active_context_id = id;
  saveSession(session);
  return session;
}

export function getActiveContext(): BrandContext | null {
  const session = getSession();
  if (!session.active_context_id) return null;
  return (
    session.brand_contexts.find((c) => c.id === session.active_context_id) ??
    null
  );
}

export function setActiveBlock(id: string | null): SessionData {
  const session = getSession();
  session.active_block_id = id;
  saveSession(session);
  return session;
}

export function getActiveBlock(): CopyBlock | null {
  const session = getSession();
  if (!session.active_block_id) return null;
  return session.copy_blocks.find((b) => b.id === session.active_block_id) ?? null;
}

// ── Per-profile draft and active block helpers ───────────────

export function saveDraft(contextId: string, draft: DraftPrompt): void {
  const session = getSession();
  if (!session.drafts) session.drafts = {};
  session.drafts[contextId] = draft;
  saveSession(session);
}

export function getDraft(contextId: string): DraftPrompt | null {
  const session = getSession();
  return session.drafts?.[contextId] ?? null;
}

export function setActiveBlockForContext(contextId: string, blockId: string | null): void {
  const session = getSession();
  if (!session.active_block_per_context) session.active_block_per_context = {};
  if (blockId) {
    session.active_block_per_context[contextId] = blockId;
  } else {
    delete session.active_block_per_context[contextId];
  }
  // Also update the global active_block_id for backward compat
  session.active_block_id = blockId;
  saveSession(session);
}

export function getActiveBlockForContext(contextId: string): CopyBlock | null {
  const session = getSession();
  const blockId = session.active_block_per_context?.[contextId];
  if (!blockId) return null;
  return session.copy_blocks.find((b) => b.id === blockId) ?? null;
}

export function saveCopyBlock(block: CopyBlock): SessionData {
  const session = getSession();
  const idx = session.copy_blocks.findIndex((b) => b.id === block.id);
  if (idx >= 0) {
    session.copy_blocks[idx] = block;
  } else {
    session.copy_blocks.push(block);
  }
  saveSession(session);
  return session;
}

export function incrementGenerationCount(): number {
  const session = getSession();
  session.generation_count += 1;
  saveSession(session);
  return session.generation_count;
}

export function getGenerationCount(): number {
  return getSession().generation_count;
}

// ── Bulk hydration helpers ────────────────────────────────────────
// Used when loading data from Supabase for authenticated users.
// Writes everything in one pass instead of calling saveBrandContext/saveCopyBlock
// in a loop, which would re-serialize on every call (O(n²) writes).

export function setSession(data: {
  brand_contexts: BrandContext[];
  copy_blocks: CopyBlock[];
  active_context_id: string | null;
}): void {
  const session = getSession();
  session.brand_contexts = data.brand_contexts;
  session.copy_blocks = data.copy_blocks;
  session.active_context_id = data.active_context_id;

  // Auto-select the most recent block for the active context.
  // copy_blocks arrive sorted by created_at desc from the API,
  // so the first match is the most recently created/edited block.
  if (data.active_context_id) {
    const latestBlock = data.copy_blocks.find(
      (b) => b.brand_context_id === data.active_context_id,
    );
    session.active_block_id = latestBlock?.id ?? null;
  } else {
    session.active_block_id = null;
  }

  saveSession(session);
}

const USER_ID_KEY = "copythat_user_id";

export function getSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(USER_ID_KEY);
}

export function setSessionUserId(id: string): void {
  sessionStorage.setItem(USER_ID_KEY, id);
}

export function clearSessionUserId(): void {
  sessionStorage.removeItem(USER_ID_KEY);
}

export function deleteBrandContext(id: string): SessionData {
  const session = getSession();
  session.brand_contexts = session.brand_contexts.filter((c) => c.id !== id);
  session.copy_blocks = session.copy_blocks.filter((b) => b.brand_context_id !== id);
  if (session.active_context_id === id) {
    session.active_context_id = session.brand_contexts[0]?.id ?? null;
  }
  saveSession(session);
  return session;
}

export function deleteCopyBlock(id: string): SessionData {
  const session = getSession();
  session.copy_blocks = session.copy_blocks.filter((b) => b.id !== id);
  if (session.active_block_id === id) {
    session.active_block_id = null;
  }
  saveSession(session);
  return session;
}

// ── Supabase sync companions ─────────────────────────────────────
// Each function writes to sessionStorage first (synchronous, always succeeds),
// then fires a non-blocking Supabase sync if the user is authenticated.
// The sync never rolls back the local write — it's fire-and-report.
// Callers use the returned `syncError` to drive a status indicator.

interface SyncResult {
  syncError?: string;
}

async function syncFetch(
  url: string,
  options: RequestInit,
): Promise<SyncResult> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { syncError: data.error || "Sync failed" };
    }
    return {};
  } catch {
    return { syncError: "Network error — changes saved locally" };
  }
}

export async function saveBrandContextWithSync(
  ctx: BrandContext,
  isAuthenticated: boolean,
): Promise<SyncResult> {
  saveBrandContext(ctx);
  if (!isAuthenticated) return {};
  return syncFetch("/api/brand-context", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand_context: ctx }),
  });
}

export async function deleteBrandContextWithSync(
  id: string,
  isAuthenticated: boolean,
): Promise<SyncResult> {
  deleteBrandContext(id);
  if (!isAuthenticated) return {};
  return syncFetch(`/api/brand-context/${id}`, { method: "DELETE" });
}

export async function saveCopyBlockWithSync(
  block: CopyBlock,
  isAuthenticated: boolean,
): Promise<SyncResult> {
  saveCopyBlock(block);
  if (!isAuthenticated) return {};
  return syncFetch("/api/copy-block", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ copy_block: block }),
  });
}

export async function deleteCopyBlockWithSync(
  id: string,
  isAuthenticated: boolean,
): Promise<SyncResult> {
  deleteCopyBlock(id);
  if (!isAuthenticated) return {};
  return syncFetch(`/api/copy-block/${id}`, { method: "DELETE" });
}
