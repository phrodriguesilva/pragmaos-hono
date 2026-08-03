// Tenant resolution by host header.
// Supports: subdomain (escritorio.pragmaos.app), custom domain (www.advogadosilva.com.br)
// and the main app (pragmaos.app / localhost).

import { supabase } from "./supabase";
import { log } from "./logger";

export interface ResolvedTenant {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  custom_domain: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  tagline: string | null;
  description: string | null;
  founded_year: number | null;
  oab_number: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email_public: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  social_linkedin: string | null;
  site_published: boolean;
  cnpj: string | null;
}

// The main app domains that should NOT be treated as public sites.
const APP_DOMAINS = [
  "localhost",
  "127.0.0.1",
  "pragmaos.app",
  "pragmaos-hono.vercel.app",
];

// Vercel preview domains: pragmaos-hono-*.vercel.app
function isVercelPreview(host: string): boolean {
  return /^pragmaos-hono-[a-z0-9]+\.vercel\.app$/.test(host);
}

// Check if the host is a subdomain of pragmaos.app (but not pragmaos.app itself).
function extractSubdomain(host: string): string | null {
  // Remove port if present
  const hostname: string = host.split(":")[0] ?? "";

  // Check if it's a subdomain of pragmaos.app
  if (hostname.endsWith(".pragmaos.app") && hostname !== "pragmaos.app") {
    const sub = hostname.slice(0, -".pragmaos.app".length);
    // Avoid www being treated as a subdomain
    if (sub !== "www" && sub.length > 0) {
      return sub;
    }
  }

  // Check if it's a subdomain of pragmaos-hono.vercel.app
  if (hostname.endsWith(".pragmaos-hono.vercel.app") && hostname !== "pragmaos-hono.vercel.app") {
    const sub = hostname.slice(0, -".pragmaos-hono.vercel.app".length);
    if (sub !== "www" && sub.length > 0) {
      return sub;
    }
  }

  // For local development: escritorio.localhost:3000
  if (hostname.endsWith(".localhost") && hostname !== "localhost") {
    const sub = hostname.slice(0, -".localhost".length);
    if (sub !== "www" && sub.length > 0) {
      return sub;
    }
  }

  return null;
}

// Check if the host is NOT one of the app domains (i.e., it's a custom domain).
function isCustomDomain(host: string): boolean {
  const hostname: string = host.split(":")[0] ?? "";

  // App domains
  if (APP_DOMAINS.includes(hostname)) return false;
  if (isVercelPreview(hostname)) return false;
  if (hostname.endsWith(".pragmaos.app")) return false; // subdomain
  if (hostname.endsWith(".pragmaos-hono.vercel.app")) return false; // subdomain
  if (hostname.endsWith(".vercel.app")) return false; // preview URLs
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;

  return true;
}

// Resolve a tenant from the host header.
// Returns null if the host is the main app (no public site requested).
export async function resolveTenantByHost(host: string): Promise<ResolvedTenant | null> {
  const subdomain = extractSubdomain(host);
  const isCustom = isCustomDomain(host);

  if (!subdomain && !isCustom) {
    return null; // Main app, not a public site
  }

  let query = supabase
    .from("tenants")
    .select(`
      id, name, slug, subdomain, custom_domain,
      logo_url, primary_color, secondary_color,
      tagline, description, founded_year, oab_number,
      address, phone, whatsapp, email_public,
      social_facebook, social_instagram, social_linkedin,
      site_published, cnpj
    `)
    .eq("site_published", true);

  if (subdomain) {
    query = query.eq("subdomain", subdomain);
  } else if (isCustom) {
    const hostname = host.split(":")[0] ?? "";
    // Validate hostname format to prevent filter injection.
    if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(hostname)) {
      return null;
    }
    query = query.eq("custom_domain", hostname);
  } else {
    return null;
  }

  const { data, error } = await query.single();

  if (error || !data) {
    log.debug("No tenant found for host", { host, subdomain, isCustom });
    return null;
  }

  return data as ResolvedTenant;
}

// Check if a host is a public site request (vs the main app).
export function isPublicSiteRequest(host: string): boolean {
  return extractSubdomain(host) !== null || isCustomDomain(host);
}

// Resolve a tenant by slug (for path-based public sites: /site/:slug/...).
// Returns null if no published tenant with that slug/subdomain exists.
export async function resolveTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select(`
      id, name, slug, subdomain, custom_domain,
      logo_url, primary_color, secondary_color,
      tagline, description, founded_year, oab_number,
      address, phone, whatsapp, email_public,
      social_facebook, social_instagram, social_linkedin,
      site_published, cnpj
    `)
    .or(`slug.eq.${slug},subdomain.eq.${slug}`)
    .maybeSingle();

  if (error || !data) {
    log.debug("No tenant found for slug", { slug });
    return null;
  }

  return data as ResolvedTenant;
}
