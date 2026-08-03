import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";
import { getSubscriptionState, shouldBlockAccess, autoExpireTrials } from "./subscription";
import { needsOnboarding } from "./onboarding";

export type SessionUser = {
  id: string;
  tenantId: string; // "" (empty) for platform admins — they are tenantless
  email: string;
  fullName: string;
  role: string;
  firmName?: string;
  isPlatformAdmin?: boolean;
};

// Reads the session cookie (a Supabase access token) and resolves the user.
// Returns null if not authenticated or token invalid.
//
// Security: the JWT signature is verified by Supabase's auth server via
// supabase.auth.getUser(token). This prevents forged JWTs from accessing
// the system. The service role client bypasses RLS, so we MUST validate
// the token properly — local decoding without verification is not safe.
export async function getSessionUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, "sb-access-token");
  if (!token) return null;

  // Create a temporary client that uses the user's access token.
  // supabase.auth.getUser() verifies the JWT signature against Supabase's JWKS.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error } = await authClient.auth.getUser(token);
  if (error || !authData.user) return null;

  const userId = authData.user.id;
  const userEmail = authData.user.email ?? "";

  // Fetch the profile row (tenant_id, role, full_name) from the profiles table.
  // Uses the service role client (bypasses RLS) — safe because we already
  // verified the JWT above and extracted the real user ID.
  // tenant_id may be NULL for platform admins (they are tenantless).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, role, email, is_platform_admin, active, tenants(name)")
    .eq("id", userId)
    .single();

  if (!profile) return null;

  // Reject sessions for deactivated users (defense-in-depth even though
  // role-change/deactivation already calls signOut).
  if (!(profile as any).active) return null;

  return {
    id: userId,
    tenantId: profile.tenant_id ?? "", // empty string for platform admins (tenantless)
    email: profile.email ?? userEmail,
    fullName: profile.full_name,
    role: profile.role,
    firmName: (profile.tenants as unknown as { name?: string } | null)?.name,
    isPlatformAdmin: (profile as any).is_platform_admin ?? false,
  };
}

// Hono middleware: redirect to /login if not authenticated.
export async function requireAuth(c: Context, next: () => Promise<void>) {
  const user = await getSessionUser(c);
  if (!user) {
    const path = c.req.path;
    return c.redirect(`/login?redirect=${encodeURIComponent(path)}`);
  }
  c.set("user", user);
  await next();
}

// Role-based access. Pass allowed roles.
export function requireRole(...roles: string[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = c.get("user") as SessionUser | undefined;
    if (!user || !roles.includes(user.role)) {
      return c.html("Acesso negado.", 403);
    }
    await next();
  };
}

// Platform admin access — for the PragmaOS owner / back-office panel.
// Checks is_platform_admin flag on the profile. Not tenant-scoped.
// Must be used AFTER requireAuth (so user is already resolved).
export async function requirePlatformAdmin(c: Context, next: () => Promise<void>) {
  const user = c.get("user") as SessionUser | undefined;
  if (!user) {
    return c.redirect("/login");
  }
  if (!user.isPlatformAdmin) {
    return c.html("Acesso negado — área restrita à administração da plataforma.", 403);
  }
  await next();
}

// Paths that bypass onboarding + subscription enforcement.
// These must always be reachable so the user can complete onboarding
// or upgrade their subscription when blocked.
const ENFORCEMENT_BYPASS_PATHS = [
  "/onboarding",
  "/assinatura",
  "/configuracoes-empresa",
  "/profile",
  "/logout",
  "/login",
  "/signup",
];

function isBypassed(path: string): boolean {
  return ENFORCEMENT_BYPASS_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

// Middleware: block platform admins from tenant-scoped routes.
// Platform admins are tenantless and should only access /back-office.
// Can be applied BEFORE requireAuth (resolves session itself) or after.
export async function blockPlatformAdmin(c: Context, next: () => Promise<void>) {
  // Check if user is already resolved by requireAuth
  let user = c.get("user") as SessionUser | undefined;
  if (!user) {
    user = (await getSessionUser(c)) ?? undefined;
  }
  if (user?.isPlatformAdmin || (user && !user.tenantId)) {
    return c.redirect("/back-office");
  }
  await next();
}

// Middleware: enforce onboarding completion + active subscription.
// Apply AFTER requireAuth (so user is already resolved).
// - If onboarding not complete and path isn't bypassed -> redirect to /onboarding
// - If trial expired / subscription suspended -> redirect to /assinatura
export async function requireActiveTenant(c: Context, next: () => Promise<void>) {
  const user = c.get("user") as SessionUser | undefined;
  if (!user) {
    return next();
  }

  // Platform admins are tenantless — skip onboarding/subscription enforcement.
  if (user.isPlatformAdmin || !user.tenantId) {
    return next(); // tenantless user, no onboarding/subscription to enforce
  }

  const path = c.req.path;
  if (isBypassed(path)) {
    return next();
  }

  // 1. Onboarding enforcement
  const onboardNeeded = await needsOnboarding(user.tenantId);
  if (onboardNeeded) {
    return c.redirect("/onboarding");
  }

  // 2. Subscription enforcement
  let state = await getSubscriptionState(user.tenantId);
  state = await autoExpireTrials(user.tenantId, state);
  const blockReason = shouldBlockAccess(state);
  if (blockReason) {
    return c.redirect("/assinatura?reason=" + blockReason);
  }

  await next();
}
