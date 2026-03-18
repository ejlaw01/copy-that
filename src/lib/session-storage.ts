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
  user_prompt?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ai_notes: any;
  version: number;
  created_at: string;
}

export interface SessionData {
  brand_contexts: BrandContext[];
  active_context_id: string | null;
  copy_blocks: CopyBlock[];
  generation_count: number;
  active_block_id: string | null;
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
