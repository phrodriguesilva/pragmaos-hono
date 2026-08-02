// API key authentication middleware for public API.
// PragmaOS 2.

import type { Context, MiddlewareHandler } from "hono";
import { supabase } from "./supabase";

export interface ApiKeyContext {
  tenantId: string;
  scopes: string[];
}

// Hash API key using SHA-256
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Generate a new API key with prefix (e.g., "pk_live_abc123...")
export async function generateApiKey(name: string): Promise<{ key: string; keyHash: string; keyPrefix: string }> {
  const prefix = "pk_live_";
  const random = crypto.randomUUID().replace(/-/g, "");
  const key = `${prefix}${random}`;
  const keyHash = await hashApiKey(key);
  const keyPrefix = `${prefix}${random.slice(0, 8)}...`;
  return { key, keyHash, keyPrefix };
}

// Middleware to authenticate API requests via Bearer token
export const apiKeyAuth: MiddlewareHandler = async (c: Context, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header. Use: Bearer pk_live_..." }, 401);
  }

  const key = authHeader.slice(7);
  const keyHash = await hashApiKey(key);

  // Look up API key
  const { data: apiKey } = await supabase
    .from("api_keys")
    .select("id, tenant_id, scopes, active, expires_at")
    .eq("key_hash", keyHash)
    .eq("active", true)
    .maybeSingle();

  if (!apiKey) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return c.json({ error: "API key expired" }, 401);
  }

  // Update last_used_at
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id);

  // Set context for downstream handlers
  c.set("apiTenantId", apiKey.tenant_id as string);
  c.set("apiScopes", apiKey.scopes as string[]);

  await next();
};

// Check if the API key has the required scope
export function requireScope(scope: string): MiddlewareHandler {
  return async (c: Context, next) => {
    const scopes = c.get("apiScopes") as string[] | undefined;
    if (!scopes || (!scopes.includes(scope) && !scopes.includes("*"))) {
      return c.json({ error: `Insufficient scope. Required: ${scope}` }, 403);
    }
    await next();
  };
}
