// Rate limiter with Upstash Redis + Supabase DB fallback support.
// Backend selection order:
//   1. Upstash Redis REST API (when UPSTASH_REDIS_REST_URL is configured)
//   2. Supabase DB (when SUPABASE_URL is configured — always in production)
//   3. In-memory Map (last resort, local dev / single instance)
// Fail-open strategy: if the active backend errors, the request is allowed.
//
// PragmaOS 2.

import type { MiddlewareHandler } from "hono";
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SUPABASE_URL } from "./env";
import { supabase } from "./supabase";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory fallback store.
const memStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes (only for in-memory mode).
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (entry.resetAt < now) memStore.delete(key);
  }
}, 300_000);

// Check if Upstash Redis is configured.
function isUpstashEnabled(): boolean {
  return UPSTASH_REDIS_REST_URL !== "" && UPSTASH_REDIS_REST_TOKEN !== "";
}

// Check if Supabase is configured (always true in production — env requires it).
function isSupabaseEnabled(): boolean {
  return SUPABASE_URL !== "";
}

// Upstash Redis REST API: INCR + EXPIRE for sliding window rate limiting.
// Uses a simple fixed window approach: key per (ip + window).
async function upstashIncrement(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
  const now = Date.now();
  const windowKey = Math.floor(now / windowMs);
  const redisKey = `rl:${key}:${windowKey}`;
  const resetAt = (windowKey + 1) * windowMs;

  // INCR the counter.
  const incrResp = await fetch(`${UPSTASH_REDIS_REST_URL}/incr/${encodeURIComponent(redisKey)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
  });

  if (!incrResp.ok) {
    // If Upstash fails, fall back to allowing the request (fail open).
    return { count: 1, resetAt };
  }

  const incrData = await incrResp.json() as { result: number };
  const count = incrData.result;

  // Set expiry on first request in the window.
  if (count === 1) {
    const expireSeconds = Math.ceil(windowMs / 1000) + 1;
    await fetch(`${UPSTASH_REDIS_REST_URL}/expire/${encodeURIComponent(redisKey)}/${expireSeconds}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
  }

  return { count, resetAt };
}

// Supabase DB fallback: atomic increment via RPC (increment_rate_limit).
// Uses the same fixed-window approach as the Upstash backend.
async function supabaseIncrement(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
  const now = Date.now();
  const windowKey = Math.floor(now / windowMs);
  const fullKey = `rl:${key}:${windowKey}`;
  const resetAt = (windowKey + 1) * windowMs;
  const resetAtIso = new Date(resetAt).toISOString();

  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_key: fullKey,
    p_reset_at: resetAtIso,
  });

  if (error) {
    // Fail open — allow the request if the DB call fails.
    return { count: 1, resetAt };
  }

  return { count: data ?? 1, resetAt };
}

// Rate limiter: maxRequests per windowMs per IP.
export function rateLimit(maxRequests: number, windowMs: number): MiddlewareHandler {
  return async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
    const key = `ip:${ip}`;

    let count: number;
    let resetAt: number;

    if (isUpstashEnabled()) {
      // Primary: distributed mode via Upstash Redis.
      const result = await upstashIncrement(key, windowMs);
      count = result.count;
      resetAt = result.resetAt;
    } else if (isSupabaseEnabled()) {
      // Fallback: Supabase DB-backed rate limiting (serverless without Upstash).
      const result = await supabaseIncrement(key, windowMs);
      count = result.count;
      resetAt = result.resetAt;
    } else {
      // Last resort: in-memory mode (local dev or single instance).
      const now = Date.now();
      const entry = memStore.get(key);

      if (!entry || entry.resetAt < now) {
        memStore.set(key, { count: 1, resetAt: now + windowMs });
        await next();
        return;
      }

      entry.count++;
      count = entry.count;
      resetAt = entry.resetAt;
    }

    if (count > maxRequests) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      c.header("Retry-After", String(Math.max(retryAfter, 1)));
      return c.json(
        { error: "Muitas tentativas. Tente novamente em alguns minutos." },
        429,
      );
    }

    await next();
  };
}

// Pre-configured limiters for auth endpoints
export const loginRateLimit = rateLimit(10, 60_000); // 10 attempts per minute per IP
export const passwordResetRateLimit = rateLimit(3, 60_000); // 3 requests per minute per IP
export const twoFactorRateLimit = rateLimit(5, 60_000); // 5 attempts per minute per IP
export const intakePublicRateLimit = rateLimit(5, 600_000); // 5 submissions per 10 minutes per IP
export const portalLoginRateLimit = rateLimit(10, 60_000); // 10 portal login attempts per minute per IP

// Pre-configured limiters for sensitive operations
export const apiKeyRateLimit = rateLimit(10, 60_000); // 10 API key ops per minute per IP
export const integrationRateLimit = rateLimit(10, 60_000); // 10 integration config ops per minute per IP
export const inviteRateLimit = rateLimit(5, 60_000); // 5 invites per minute per IP
export const workflowExecRateLimit = rateLimit(10, 60_000); // 10 workflow executions per minute per IP
