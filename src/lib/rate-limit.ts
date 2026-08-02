// Simple in-memory rate limiter for auth endpoints.
// For production with multiple instances, use Redis or Upstash.
// PragmaOS 2.

import type { MiddlewareHandler } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 300_000);

// Rate limiter: maxRequests per windowMs per IP.
export function rateLimit(maxRequests: number, windowMs: number): MiddlewareHandler {
  return async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
    const key = `rl:${ip}`;

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      // First request or window expired
      store.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
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
