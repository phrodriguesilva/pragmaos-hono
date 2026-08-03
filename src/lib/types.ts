import type { Hono } from "hono";
import type { SessionUser } from "./session";
import type { ResolvedTenant } from "./tenant-resolver";

// Shared Hono app type with session user in variables.
// Use `new Hono<AppEnv>()` in every route file so c.get("user") is typed.
export type AppEnv = {
  Variables: {
    user: SessionUser;
    apiTenantId?: string;
    apiScopes?: string[];
    publicTenant?: ResolvedTenant;
    cspNonce?: string;
  };
};

export type App = Hono<AppEnv>;
