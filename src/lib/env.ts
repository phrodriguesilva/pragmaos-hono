// Centralized env access. Reads from process.env (Node/Vercel) or Bun.env.
// Validates required vars at startup — fails fast if critical config is missing.
import { z } from "zod";

const env = typeof Bun !== "undefined" ? Bun.env : process.env;

const envSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL deve ser uma URL valida").or(z.literal("")),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY e obrigatorio"),
  SUPABASE_ANON_KEY: z.string().or(z.literal("")),
  APP_URL: z.string().url().or(z.literal("")).default("http://localhost:3000"),
  AI_API_KEY: z.string().or(z.literal("")).default(""),
  AI_BASE_URL: z.string().url().or(z.literal("")).default("https://api.openai.com/v1"),
  AI_MODEL: z.string().or(z.literal("")).default("gpt-4o-mini"),
  AI_RATE_LIMIT_PER_TENANT: z.coerce.number().int().positive().default(10),
  CNJ_API_KEY: z.string().or(z.literal("")).default(""),
  CNJ_BASE_URL: z.string().url().or(z.literal("")).default("https://api-publica.datajud.cnj.jus.br"),
  // Optional — used for OAuth, webhooks, etc.
  GOVBR_CLIENT_ID: z.string().or(z.literal("")).default(""),
  GOVBR_CLIENT_SECRET: z.string().or(z.literal("")).default(""),
  GOVBR_REDIRECT_URI: z.string().or(z.literal("")).default(""),
  WHATSAPP_APP_SECRET: z.string().or(z.literal("")).default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().or(z.literal("")).default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().or(z.literal("")).default(""),
  CLICKSIGN_ACCESS_TOKEN: z.string().or(z.literal("")).default(""),
  CLICKSIGN_WEBHOOK_SECRET: z.string().or(z.literal("")).default(""),
  SMTP_HOST: z.string().or(z.literal("")).default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().or(z.literal("")).default(""),
  SMTP_PASS: z.string().or(z.literal("")).default(""),
  SMTP_FROM: z.string().or(z.literal("")).default(""),
  // Upstash Redis (optional — for distributed rate limiting on serverless).
  UPSTASH_REDIS_REST_URL: z.string().url().or(z.literal("")).default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().or(z.literal("")).default(""),
  // Sentry (optional — error tracking in production).
  SENTRY_DSN: z.string().url().or(z.literal("")).default(""),
});

const parsed = envSchema.safeParse(env);

if (!parsed.success) {
  console.error("[ENV] Configuracao invalida — variaveis de ambiente obrigatorias faltando ou invalidas:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  // In production, fail fast. In development, warn but continue (some vars may be optional).
  if (env.NODE_ENV === "production") {
    console.error("[ENV] Abortando em producao devido a configuracao invalida.");
    process.exit(1);
  }
  console.warn("[ENV] Continuando em modo desenvolvimento com configuracao parcial.");
}

type EnvValues = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  APP_URL: string;
  AI_API_KEY: string;
  AI_BASE_URL: string;
  AI_MODEL: string;
  AI_RATE_LIMIT_PER_TENANT: number;
  CNJ_API_KEY: string;
  CNJ_BASE_URL: string;
  GOVBR_CLIENT_ID: string;
  GOVBR_CLIENT_SECRET: string;
  GOVBR_REDIRECT_URI: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_ACCESS_TOKEN: string;
  CLICKSIGN_ACCESS_TOKEN: string;
  CLICKSIGN_WEBHOOK_SECRET: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  SENTRY_DSN: string;
};

const e: EnvValues = parsed.success ? parsed.data : {
  SUPABASE_URL: env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ?? "",
  APP_URL: env.APP_URL ?? "http://localhost:3000",
  AI_API_KEY: env.AI_API_KEY ?? "",
  AI_BASE_URL: env.AI_BASE_URL ?? "https://api.openai.com/v1",
  AI_MODEL: env.AI_MODEL ?? "gpt-4o-mini",
  AI_RATE_LIMIT_PER_TENANT: Number(env.AI_RATE_LIMIT_PER_TENANT ?? 10),
  CNJ_API_KEY: env.CNJ_API_KEY ?? "",
  CNJ_BASE_URL: env.CNJ_BASE_URL ?? "https://api-publica.datajud.cnj.jus.br",
  GOVBR_CLIENT_ID: env.GOVBR_CLIENT_ID ?? "",
  GOVBR_CLIENT_SECRET: env.GOVBR_CLIENT_SECRET ?? "",
  GOVBR_REDIRECT_URI: env.GOVBR_REDIRECT_URI ?? "",
  WHATSAPP_APP_SECRET: env.WHATSAPP_APP_SECRET ?? "",
  WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN ?? "",
  CLICKSIGN_ACCESS_TOKEN: env.CLICKSIGN_ACCESS_TOKEN ?? "",
  CLICKSIGN_WEBHOOK_SECRET: env.CLICKSIGN_WEBHOOK_SECRET ?? "",
  SMTP_HOST: env.SMTP_HOST ?? "",
  SMTP_PORT: Number(env.SMTP_PORT ?? 587),
  SMTP_USER: env.SMTP_USER ?? "",
  SMTP_PASS: env.SMTP_PASS ?? "",
  SMTP_FROM: env.SMTP_FROM ?? "",
  UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL ?? "",
  UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN ?? "",
  SENTRY_DSN: env.SENTRY_DSN ?? "",
};

export const SUPABASE_URL = e.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = e.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_ANON_KEY = e.SUPABASE_ANON_KEY;
export const APP_URL = e.APP_URL;

export const AI_API_KEY = e.AI_API_KEY;
export const AI_BASE_URL = e.AI_BASE_URL;
export const AI_MODEL = e.AI_MODEL;
export const AI_RATE_LIMIT_PER_TENANT = e.AI_RATE_LIMIT_PER_TENANT;

// CNJ DataJud -- SaaS-managed (platform-level API key, not per-tenant).
export const CNJ_API_KEY = e.CNJ_API_KEY;
export const CNJ_BASE_URL = e.CNJ_BASE_URL;

// Gov.br OAuth
export const GOVBR_CLIENT_ID = e.GOVBR_CLIENT_ID;
export const GOVBR_CLIENT_SECRET = e.GOVBR_CLIENT_SECRET;
export const GOVBR_REDIRECT_URI = e.GOVBR_REDIRECT_URI;

// WhatsApp Cloud API
export const WHATSAPP_APP_SECRET = e.WHATSAPP_APP_SECRET;
export const WHATSAPP_PHONE_NUMBER_ID = e.WHATSAPP_PHONE_NUMBER_ID;
export const WHATSAPP_ACCESS_TOKEN = e.WHATSAPP_ACCESS_TOKEN;

// Clicksign
export const CLICKSIGN_ACCESS_TOKEN = e.CLICKSIGN_ACCESS_TOKEN;
export const CLICKSIGN_WEBHOOK_SECRET = e.CLICKSIGN_WEBHOOK_SECRET;

// SMTP (email)
export const SMTP_HOST = e.SMTP_HOST;
export const SMTP_PORT = e.SMTP_PORT;
export const SMTP_USER = e.SMTP_USER;
export const SMTP_PASS = e.SMTP_PASS;
export const SMTP_FROM = e.SMTP_FROM;

// Upstash Redis (optional — distributed rate limiting)
export const UPSTASH_REDIS_REST_URL = e.UPSTASH_REDIS_REST_URL;
export const UPSTASH_REDIS_REST_TOKEN = e.UPSTASH_REDIS_REST_TOKEN;

// Sentry (optional — error tracking)
export const SENTRY_DSN = e.SENTRY_DSN;
