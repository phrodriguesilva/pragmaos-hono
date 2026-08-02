// CSRF protection middleware.
// Uses the Origin header check (OWASP-recommended for server-rendered apps).
// Rejects state-changing requests (POST, PUT, PATCH, DELETE) if the Origin
// header doesn't match the app's host.
//
// This is simpler and more robust than double-submit cookies for apps that:
// - Use httpOnly session cookies (can't read them from JS)
// - Are server-rendered (forms submit via standard POST, not fetch)
//
// Reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

import type { Context } from "hono";
import { APP_URL } from "./env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Extract the host (origin without path) from APP_URL for comparison.
const APP_HOST = (() => {
  try {
    return new URL(APP_URL).host;
  } catch {
    return "";
  }
})();

export async function csrfProtection(c: Context, next: () => Promise<void>) {
  const method = c.req.method.toUpperCase();

  // Only check state-changing methods.
  if (SAFE_METHODS.has(method)) {
    await next();
    return;
  }

  // Skip CSRF for API routes that use Bearer token auth (not cookies).
  const path = c.req.path;
  if (path.startsWith("/api/") || path.startsWith("/webhooks/")) {
    await next();
    return;
  }

  // Check Origin header.
  const origin = c.req.header("origin") ?? c.req.header("referer");

  if (!origin) {
    // No Origin/Referer header — reject. Browsers always send these on
    // cross-origin or same-origin POSTs from forms.
    return c.text("CSRF: Origin header missing", 403);
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return c.text("CSRF: Invalid Origin header", 403);
  }

  // Allow if origin matches the app host.
  // In development, also allow localhost variants.
  const isDev = APP_URL.includes("localhost") || APP_URL.includes("127.0.0.1");
  const allowedHosts = new Set([APP_HOST]);
  if (isDev) {
    // In development, allow any localhost port (dev servers may run on dynamic ports).
    if (originHost.startsWith("localhost:") || originHost.startsWith("127.0.0.1:")) {
      await next();
      return;
    }
    allowedHosts.add("localhost:3000");
    allowedHosts.add("localhost:5173");
    allowedHosts.add("127.0.0.1:3000");
    allowedHosts.add("127.0.0.1:5173");
  }

  // Vercel: allow preview deployment URLs (*.vercel.app) for the same project.
  // Preview URLs follow the pattern: <project>-<hash>-<team>.vercel.app
  // Production URL is typically: <project>.vercel.app
  if (originHost.endsWith(".vercel.app")) {
    // Extract the project prefix from APP_HOST (e.g. "pragmaos-hono" from "pragmaos-hono.vercel.app")
    const projectPrefix = APP_HOST.replace(/\.vercel\.app$/, "");
    if (projectPrefix && (originHost === APP_HOST || originHost.startsWith(`${projectPrefix}-`))) {
      await next();
      return;
    }
  }

  if (!allowedHosts.has(originHost)) {
    return c.text("CSRF: Origin not allowed", 403);
  }

  await next();
}
