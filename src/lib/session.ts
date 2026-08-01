import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import { supabase } from "./supabase";

export type SessionUser = {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  firmName?: string;
};

// Reads the session cookie (a Supabase access token) and resolves the user.
// Returns null if not authenticated or token invalid.
export async function getSessionUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, "sb-access-token");
  if (!token) return null;

  // Verify the token with Supabase and fetch the user.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Fetch the profile row (tenant_id, role, full_name) from the profiles table.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, role, tenants(name)")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    tenantId: profile.tenant_id,
    email: user.email ?? "",
    fullName: profile.full_name,
    role: profile.role,
    firmName: (profile.tenants as unknown as { name?: string })?.name,
  };
}

// Hono middleware: redirect to /login if not authenticated.
export async function requireAuth(c: Context, next: () => Promise<void>) {
  const user = await getSessionUser(c);
  if (!user) {
    return c.redirect("/login");
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
