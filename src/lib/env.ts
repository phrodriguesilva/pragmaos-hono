// Centralized env access. Reads from process.env (Node/Vercel) or Bun.env.
const env = typeof Bun !== "undefined" ? Bun.env : process.env;

export const SUPABASE_URL = env.SUPABASE_URL ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY ?? "";
export const APP_URL = env.APP_URL ?? "http://localhost:3000";

export const AI_API_KEY = env.AI_API_KEY ?? "";
export const AI_BASE_URL = env.AI_BASE_URL ?? "https://api.openai.com/v1";
export const AI_MODEL = env.AI_MODEL ?? "gpt-4o-mini";
export const AI_RATE_LIMIT_PER_TENANT = Number(env.AI_RATE_LIMIT_PER_TENANT ?? 10);

// CNJ DataJud -- SaaS-managed (platform-level API key, not per-tenant).
export const CNJ_API_KEY = env.CNJ_API_KEY ?? "";
export const CNJ_BASE_URL = env.CNJ_BASE_URL ?? "https://api-publica.datajud.cnj.jus.br";
