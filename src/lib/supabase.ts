import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./env";

// Server-side admin client using the service role key. Bypasses RLS.
// Only use on the server; never expose the service role key to the browser.
// Fallback to a dummy URL if env vars are missing — prevents crash on cold start.
// Individual queries will fail gracefully, returning empty results.
const fallbackUrl = SUPABASE_URL || "https://placeholder.supabase.co";
const fallbackKey = SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

export const supabase = createClient(fallbackUrl, fallbackKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
