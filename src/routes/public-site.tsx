// Public site routes — served when a tenant is resolved by host.
// Routes: / (home), /sobre, /areas, /areas/:slug, /artigos, /artigos/:slug, /contato

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { supabase } from "../lib/supabase";
import { log } from "../lib/logger";
import type { ResolvedTenant } from "../lib/tenant-resolver";
import { resolveTenantByHost, resolveTenantBySlug } from "../lib/tenant-resolver";
import { PublicLayout } from "../components/public-layout";
import DOMPurify from "../lib/sanitize";
import { sanitizeILike } from "../lib/search-sanitize";

export const publicSiteRoutes = new Hono<AppEnv>();

// Normalize Phosphor icon class — ensures "ph ph-scales" regardless of DB format.
// Accepts "ph-scales", "scales", or "ph ph-scales" and always returns "ph ph-scales".
function phIcon(icon?: string | null, fallback = "ph-scales"): string {
  if (!icon) return `ph ${fallback}`;
  const cleaned = icon.replace(/^ph\s+/, "").replace(/^ph-/, "").trim();
  return `ph ph-${cleaned}`;
}

// Middleware: resolve tenant from host on every request.
// The main app already tried to resolve and dispatched here — we resolve again
// to get the tenant into this sub-app's context.
publicSiteRoutes.use("*", async (c, next) => {
  const existing = c.get("publicTenant");
  if (existing) {
    return next();
  }

  // Try host-based resolution first (subdomain or custom domain)
  const host = c.req.header("host") ?? "";
  const tenant = await resolveTenantByHost(host);
  if (tenant) {
    c.set("publicTenant", tenant);
    return next();
  }

  // Try path-based: slug passed via header by the main app
  const slug = c.req.header("x-public-slug");
  if (slug) {
    const slugTenant = await resolveTenantBySlug(slug);
    if (slugTenant) {
      c.set("publicTenant", slugTenant);
      return next();
    }
  }

  return c.notFound();
});

// Extend context to carry the resolved tenant
declare module "hono" {
  interface ContextVariableMap {
    publicTenant: ResolvedTenant;
  }
}

// Helper: get tenant from context (guaranteed non-null by middleware).
function getTenant(c: any): ResolvedTenant {
  return c.get("publicTenant") as ResolvedTenant;
}

// Helper: compute the base path for links.
// In subdomain mode: "" (links are /sobre, /areas, etc.)
// In path-based mode: "/site/:slug" (links are /site/:slug/sobre, etc.)
function getBasePath(c: any): string {
  // Path-based mode: slug is passed via header
  const slug = c.req.header("x-public-slug");
  if (slug) {
    return `/site/${slug}`;
  }
  // Subdomain mode: no prefix needed
  return "";
}

// Helper: build a link with the base path prefix
function link(c: any, href: string): string {
  const base = getBasePath(c);
  return `${base}${href}`;
}

// Helper: render with public layout
function renderPublic(c: any, tenant: ResolvedTenant, active: string, content: any, pageTitle?: string, pageDescription?: string, jsonLd?: object) {
  const basePath = getBasePath(c);
  // Auto-generate page title/description based on active section if not provided
  const titleMap: Record<string, string> = {
    home: `${tenant.name} — ${tenant.tagline ?? "Advocacia"}`,
    areas: `Áreas de Atuação — ${tenant.name}`,
    equipe: `Nossa Equipe — ${tenant.name}`,
    artigos: `Artigos & Conteúdo Jurídico — ${tenant.name}`,
    sobre: `Sobre — ${tenant.name}`,
    contato: `Contato — ${tenant.name}`,
    reconhecimentos: `Reconhecimentos — ${tenant.name}`,
    lgpd: `Política de Privacidade — ${tenant.name}`,
  };
  const descMap: Record<string, string> = {
    home: tenant.description ?? `${tenant.name} — escritório de advocacia`,
    areas: `Conheça as áreas de atuação de ${tenant.name}. Advocacia especializada em diversas áreas do direito.`,
    equipe: `Conheça a equipe de advogados de ${tenant.name}. Profissionais experientes prontos para ajudar você.`,
    artigos: `Artigos e conteúdos jurídicos produzidos pela equipe de ${tenant.name}.`,
    sobre: `Conheça a história e missão de ${tenant.name}.`,
    contato: `Entre em contato com ${tenant.name}. Estamos aqui para ajudar você.`,
    reconhecimentos: `Reconhecimentos e premiações de ${tenant.name}.`,
    lgpd: `Política de privacidade e proteção de dados de ${tenant.name}.`,
  };
  const finalTitle = pageTitle ?? titleMap[active] ?? `${tenant.name}`;
  const finalDesc = pageDescription ?? descMap[active] ?? tenant.description ?? "";
  return (
    <PublicLayout tenant={tenant} active={active} basePath={basePath} pageTitle={finalTitle} pageDescription={finalDesc} jsonLd={jsonLd}>
      {content}
    </PublicLayout>
  );
}

// Breadcrumbs component for sub-pages
function Breadcrumbs({ items, basePath }: { items: { label: string; href?: string }[]; basePath: string }) {
  const b = basePath;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `https://pragmaos.app${b}${item.href}` } : {}),
    })),
  };
  return (
    <>
      <nav aria-label="Breadcrumb" class="text-sm text-gray-500 mb-6 flex items-center gap-1.5 flex-wrap">
        {items.map((item, i) => (
          <span key={i} class="flex items-center gap-1.5">
            {item.href ? (
              <a href={`${b}${item.href}`} class="hover:text-primary transition">{item.label}</a>
            ) : (
              <span class="text-gray-700 font-medium">{item.label}</span>
            )}
            {i < items.length - 1 && <span class="text-gray-300" aria-hidden="true">/</span>}
          </span>
        ))}
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}

// =========================================================================
// GET / — Home page
// =========================================================================
publicSiteRoutes.get("/", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  // Fetch all homepage data in parallel (8 queries at once ~100ms vs ~600ms sequential)
  const [
    areasRes, articlesRes, statsRes, teamRes,
    testimonialsRes, clientsRes, recognitionsRes, officesRes,
  ] = await Promise.all([
    supabase.from("tenant_law_areas")
      .select(`description, sort_order, law_areas (id, name, slug, icon)`)
      .eq("tenant_id", tenant.id)
      .order("sort_order", { ascending: true }),
    supabase.from("articles")
      .select("id, title, slug, excerpt, cover_image_url, published_at, reading_time_min")
      .eq("tenant_id", tenant.id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(3),
    supabase.from("site_stats")
      .select("label, value, prefix, suffix, icon")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true)
      .order("sort_order", { ascending: true }),
    supabase.from("public_team_members")
      .select("public_name, public_title, public_photo_url, slug")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true)
      .eq("is_featured", true)
      .order("sort_order", { ascending: true })
      .limit(4),
    supabase.from("testimonials")
      .select("author_name, author_role, content, rating, source")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .limit(3),
    supabase.from("client_logos")
      .select("name, logo_url, website_url")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true)
      .order("sort_order", { ascending: true }),
    supabase.from("recognitions")
      .select("title, organization, year, ranking_position, icon")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true)
      .order("year", { ascending: false })
      .limit(6),
    supabase.from("offices")
      .select("label, address, city, state, phone, email")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true)
      .order("sort_order", { ascending: true }),
  ]);

  const areas: any = areasRes.data;
  const articles: any = articlesRes.data;
  const stats: any = statsRes.data;
  const teamMembers: any = teamRes.data;
  const testimonials: any = testimonialsRes.data;
  const clients: any = clientsRes.data;
  const recognitions: any = recognitionsRes.data;
  const offices: any = officesRes.data;

  return c.html(
    renderPublic(c, tenant, "home", (
      <>
        {/* Hero */}
        <section class="bg-secondary text-white py-20 px-4">
          <div class="max-w-4xl mx-auto text-center">
            <h1 class="text-4xl md:text-5xl font-serif font-bold mb-4">
              {tenant.tagline ?? `${tenant.name}`}
            </h1>
            {tenant.description && (
              <p class="text-lg text-gray-300 max-w-2xl mx-auto mb-8">{tenant.description}</p>
            )}
            <div class="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
              <a href={`${b}/contato`} class="btn btn-primary px-6 py-3 rounded-lg font-semibold">
                Fale Conosco
              </a>
              <a href={`${b}/areas`} class="btn border border-white/30 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition">
                Áreas de Atuação
              </a>
            </div>
          </div>
        </section>

        {/* Client logos — social proof right after hero */}
        {clients && clients.length > 0 && (
          <section class="py-12 px-4 max-w-6xl mx-auto">
            <h2 class="text-center text-lg font-semibold text-gray-400 mb-8 uppercase tracking-wider">Nossos Clientes</h2>
            <div class="flex flex-wrap items-center justify-center gap-8">
              {clients.map((cl: any) => (
                cl.website_url ? (
                  <a href={cl.website_url} target="_blank" rel="noopener" class="grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition">
                    {cl.logo_url ? (
                      <img src={cl.logo_url} alt={cl.name} class="h-12 w-auto max-w-32 object-contain" loading="lazy" decoding="async" />
                    ) : (
                      <span class="text-lg font-semibold text-gray-400">{cl.name}</span>
                    )}
                  </a>
                ) : (
                  <span class="grayscale opacity-60">
                    {cl.logo_url ? (
                      <img src={cl.logo_url} alt={cl.name} class="h-12 w-auto max-w-32 object-contain" loading="lazy" decoding="async" />
                    ) : (
                      <span class="text-lg font-semibold text-gray-400">{cl.name}</span>
                    )}
                  </span>
                )
              ))}
            </div>
          </section>
        )}

        {/* Law areas preview */}
        {areas && areas.length > 0 && (
          <section class="py-16 px-4 max-w-6xl mx-auto">
            <h2 class="text-3xl font-serif font-bold text-center text-secondary mb-2">Áreas de Atuação</h2>
            <p class="text-center text-gray-500 mb-10">Como podemos ajudar você</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {areas.map((a: any) => (
                <a key={a.law_areas.slug} href={`${b}/areas/${a.law_areas.slug}`} class="block p-6 rounded-xl border border-gray-100 hover:border-primary hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group">
                  <div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition">
                    <i class={`${phIcon(a.law_areas.icon)} text-2xl text-primary group-hover:text-white`} aria-hidden="true" />
                  </div>
                  <h3 class="text-lg font-semibold text-secondary mb-2">{a.law_areas.name}</h3>
                  {a.description && <p class="text-sm text-gray-500 line-clamp-3">{a.description}</p>}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Stats */}
        {stats && stats.length > 0 && (
          <section class="bg-secondary text-white py-16 px-4">
            <div class="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {stats.map((s: any) => (
                <div key={s.label}>
                  {s.icon && <i class={`${phIcon(s.icon)} text-3xl text-primary mb-2 block`} aria-hidden="true" />}
                  <div class="text-4xl font-serif font-bold stat-counter" data-value={s.value} data-prefix={s.prefix ?? ""} data-suffix={s.suffix ?? ""}>
                    {s.prefix}{s.value}{s.suffix}
                  </div>
                  <div class="text-sm text-gray-300 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Featured team members */}
        {teamMembers && teamMembers.length > 0 && (
          <section class="py-16 px-4 max-w-6xl mx-auto">
            <h2 class="text-3xl font-serif font-bold text-center text-secondary mb-2">Nossa Equipe</h2>
            <p class="text-center text-gray-500 mb-10">Profissionais dedicados ao seu caso</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
              {teamMembers.map((m: any) => (
                <a key={m.slug} href={`${b}/equipe/${m.slug}`} class="group text-center">
                  <div class="w-24 h-24 mx-auto rounded-full overflow-hidden border-4 border-gray-100 group-hover:border-primary transition mb-3">
                    {m.public_photo_url ? (
                      <img src={m.public_photo_url} alt={m.public_name} class="w-full h-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div class="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-3xl font-semibold">
                        {m.public_name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                    )}
                  </div>
                  <h3 class="font-semibold text-secondary group-hover:text-primary transition text-sm">{m.public_name}</h3>
                  <p class="text-xs text-gray-500">{m.public_title}</p>
                </a>
              ))}
            </div>
            <div class="text-center mt-8">
              <a href={`${b}/equipe`} class="text-primary font-semibold hover:underline">Conheça toda a equipe <span aria-hidden="true">→</span></a>
            </div>
          </section>
        )}

        {/* About preview */}
        {tenant.founded_year && (
          <section class="bg-gray-50 py-16 px-4">
            <div class="max-w-4xl mx-auto text-center">
              <h2 class="text-3xl font-serif font-bold text-secondary mb-4">Sobre o Escritório</h2>
              <p class="text-gray-600 max-w-2xl mx-auto">
                {tenant.name} atua desde {tenant.founded_year} oferecendo soluções jurídicas
                personalizadas e estratégicas para nossos clientes.
              </p>
              <a href={`${b}/sobre`} class="inline-block mt-6 text-primary font-semibold hover:underline">
                Conheça nossa história <span aria-hidden="true">→</span>
              </a>
            </div>
          </section>
        )}

        {/* Latest articles */}
        {articles && articles.length > 0 && (
          <section class="py-16 px-4 max-w-6xl mx-auto">
            <h2 class="text-3xl font-serif font-bold text-center text-secondary mb-10">Últimos Artigos</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
              {articles.map((article: any) => (
                <a href={`${b}/artigos/${article.slug}`} class="group">
                  {article.cover_image_url && (
                    <img src={article.cover_image_url} alt={article.title} class="w-full h-48 object-cover rounded-xl mb-4" loading="lazy" decoding="async" />
                  )}
                  <h3 class="text-lg font-semibold text-secondary group-hover:text-primary transition mb-2">{article.title}</h3>
                  {article.excerpt && <p class="text-sm text-gray-500 line-clamp-2">{article.excerpt}</p>}
                  <div class="text-xs text-gray-400 mt-2">
                    {article.published_at && new Date(article.published_at).toLocaleDateString("pt-BR")}
                    {article.reading_time_min && ` • ${article.reading_time_min} min de leitura`}
                  </div>
                </a>
              ))}
            </div>
            <div class="text-center mt-8">
              <a href={`${b}/artigos`} class="text-primary font-semibold hover:underline">Ver todos os artigos <span aria-hidden="true">→</span></a>
            </div>
          </section>
        )}

        {/* Testimonials */}
        {testimonials && testimonials.length > 0 && (
          <section class="py-16 px-4 bg-gray-50">
            <div class="max-w-5xl mx-auto">
              <h2 class="text-3xl font-serif font-bold text-center text-secondary mb-10">O Que Dizem Nossos Clientes</h2>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                {testimonials.map((t: any) => (
                  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div class="flex items-center gap-1 mb-3">
                      {Array.from({ length: 5 }, (_, i) => (
                        <i class={`ph-bold ${i < (t.rating ?? 5) ? "ph-star text-yellow-500" : "ph-star text-gray-300"} text-sm`} aria-hidden="true" />
                      ))}
                    </div>
                    <p class="text-gray-600 italic text-sm mb-4">"{t.content}"</p>
                    <div class="border-t border-gray-100 pt-3">
                      <p class="font-semibold text-secondary text-sm">{t.author_name}</p>
                      {t.author_role && <p class="text-xs text-gray-500">{t.author_role}</p>}
                      {t.source === "google" && (
                        <p class="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <i class="ph ph-google-logo" aria-hidden="true" /> via Google
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Recognitions — social proof after testimonials */}
        {recognitions && recognitions.length > 0 && (
          <section class="py-16 px-4 bg-secondary text-white">
            <div class="max-w-5xl mx-auto">
              <h2 class="text-3xl font-serif font-bold text-center mb-10">Reconhecimentos</h2>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                {recognitions.map((r: any) => (
                  <div class="text-center">
                    {r.icon && <i class={`${phIcon(r.icon)} text-4xl text-primary mb-3 block`} aria-hidden="true" />}
                    <h3 class="font-semibold text-lg">{r.title}</h3>
                    {r.organization && <p class="text-sm text-gray-300">{r.organization}</p>}
                    {r.year && <p class="text-sm text-gray-400">{r.year}{r.ranking_position ? ` • ${r.ranking_position}` : ""}</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Offices */}
        {offices && offices.length > 0 && (
          <section class="py-16 px-4 max-w-6xl mx-auto">
            <h2 class="text-3xl font-serif font-bold text-center text-secondary mb-10">Onde Estamos</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {offices.map((o: any) => (
                <div class="p-6 rounded-xl border border-gray-100">
                  <div class="flex items-center gap-2 mb-3">
                    <i class="ph ph-map-pin text-primary text-xl" aria-hidden="true" />
                    <h3 class="font-semibold text-secondary">{o.label}</h3>
                  </div>
                  <p class="text-sm text-gray-500">{o.address}</p>
                  {o.city && <p class="text-sm text-gray-500">{o.city}/{o.state ?? ""}</p>}
                  {o.phone && <p class="text-sm text-gray-500 mt-2"><i class="ph ph-phone text-xs" aria-hidden="true"></i> {o.phone}</p>}
                  {o.email && <p class="text-sm text-gray-500"><i class="ph ph-envelope text-xs" aria-hidden="true"></i> {o.email}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section class="bg-primary py-16 px-4">
          <div class="max-w-2xl mx-auto text-center text-white">
            <h2 class="text-3xl font-serif font-bold mb-4">Precisa de ajuda jurídica?</h2>
            <p class="text-white/90 mb-6">Entre em contato e descubra como podemos ajudar você.</p>
            <a href={`${b}/contato`} class="inline-block bg-white text-primary px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition">
              Agendar Consulta
            </a>
          </div>
        </section>

        {/* Newsletter */}
        <section class="py-12 px-4 bg-gray-50">
          <div class="max-w-xl mx-auto text-center">
            <h2 class="text-2xl font-serif font-bold text-secondary mb-2">Receba Nossos Artigos</h2>
            <p class="text-sm text-gray-500 mb-6">Inscreva-se para receber novidades e conteúdos jurídicos.</p>
            <form method="post" action={`${b}/newsletter`} class="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
              <input type="text" name="website" tabIndex={-1} autocomplete="off" class="absolute -left-[9999px] opacity-0" aria-hidden="true" />
              <input type="email" name="email" required placeholder="Seu email..." aria-label="E-mail para inscrição" class="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-primary text-sm" />
              <button type="submit" class="btn btn-primary px-6 py-2.5 rounded-lg text-sm font-semibold">Inscrever</button>
            </form>
          </div>
        </section>
      </>
    )),
  );
});

// =========================================================================
// GET /sobre — About page
// =========================================================================
publicSiteRoutes.get("/sobre", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  const { data: areas }: any = await supabase
    .from("tenant_law_areas")
    .select("law_areas (name, slug, icon), description")
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true });

  return c.html(
    renderPublic(c, tenant, "sobre", (
      <div class="max-w-4xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-secondary mb-6">Sobre {tenant.name}</h1>

        {tenant.description && (
          <p class="text-lg text-gray-600 mb-8 leading-relaxed">{tenant.description}</p>
        )}

        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 my-10">
          {tenant.founded_year && (
            <div class="text-center">
              <div class="text-3xl font-bold text-primary">{new Date().getFullYear() - tenant.founded_year}+</div>
              <div class="text-sm text-gray-500">Anos de experiência</div>
            </div>
          )}
          {areas && (
            <div class="text-center">
              <div class="text-3xl font-bold text-primary">{areas.length}</div>
              <div class="text-sm text-gray-500">Áreas de atuação</div>
            </div>
          )}
          {tenant.oab_number && (
            <div class="text-center">
              <div class="text-3xl font-bold text-primary">OAB</div>
              <div class="text-sm text-gray-500">{tenant.oab_number}</div>
            </div>
          )}
          {tenant.email_public && (
            <div class="text-center">
              <i class="ph-bold ph-check-circle text-3xl text-primary" aria-hidden="true" />
              <div class="text-sm text-gray-500">Atendimento online</div>
            </div>
          )}
        </div>

        {areas && areas.length > 0 && (
          <div class="mt-10">
            <h2 class="text-2xl font-serif font-bold text-secondary mb-6">Nossas Áreas de Atuação</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {areas.map((a: any) => (
                <a href={`${b}/areas/${a.law_areas.slug}`} class="flex items-center gap-3 p-4 rounded-lg border border-gray-100 hover:border-primary transition">
                  <i class={`${phIcon(a.law_areas.icon)} text-2xl text-primary`} aria-hidden="true" />
                  <span class="font-medium text-secondary">{a.law_areas.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {tenant.address && (
          <div class="mt-10 p-6 bg-gray-50 rounded-xl">
            <h3 class="font-semibold text-secondary mb-2">Endereço</h3>
            <p class="text-gray-600">{tenant.address}</p>
          </div>
        )}
      </div>
    )),
  );
});

// =========================================================================
// GET /areas — List all law areas
// =========================================================================
publicSiteRoutes.get("/areas", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  const { data: areas }: any = await supabase
    .from("tenant_law_areas")
    .select(`
      description, sort_order,
      law_areas (id, name, slug, icon)
    `)
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true });

  return c.html(
    renderPublic(c, tenant, "areas", (
      <div class="max-w-6xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-secondary mb-2 text-center">Áreas de Atuação</h1>
        <p class="text-center text-gray-500 mb-12">Atuacao juridica especializada em diversas areas do direito</p>

        {(!areas || areas.length === 0) ? (
          <div class="text-center py-12 text-gray-400">
            <i class="ph ph-scales text-5xl block mb-4" aria-hidden="true" />
            <p>Em breve nossas áreas de atuação.</p>
          </div>
        ) : (
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {areas.map((a: any) => (
              <a href={`${b}/areas/${a.law_areas.slug}`} class="block p-8 rounded-xl border border-gray-100 hover:border-primary hover:shadow-xl transition group">
                <div class="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary transition">
                  <i class={`${phIcon(a.law_areas.icon)} text-3xl text-primary group-hover:text-white`} aria-hidden="true" />
                </div>
                <h3 class="text-xl font-serif font-bold text-secondary mb-3">{a.law_areas.name}</h3>
                {a.description && <p class="text-gray-500 line-clamp-4">{a.description}</p>}
                <span class="text-primary font-semibold text-sm mt-4 inline-block">Saiba mais <span aria-hidden="true">→</span></span>
              </a>
            ))}
          </div>
        )}
      </div>
    )),
  );
});

// =========================================================================
// GET /areas/:slug — Single law area page
// =========================================================================
publicSiteRoutes.get("/areas/:slug", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);
  const slug = c.req.param("slug");

  const { data: area }: any = await supabase
    .from("tenant_law_areas")
    .select(`
      description,
      law_areas (id, name, slug, icon)
    `)
    .eq("tenant_id", tenant.id)
    .eq("law_areas.slug", slug)
    .single();
  const areaData: any = area;

  if (!areaData) {
    return c.html(
      renderPublic(c, tenant, "areas", (
        <div class="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 class="text-2xl font-bold text-gray-400 mb-4">Área não encontrada</h1>
          <a href={`${b}/areas`} class="text-primary hover:underline"><span aria-hidden="true">←</span> Voltar para áreas</a>
        </div>
      )),
      404,
    );
  }

  // Fetch related articles
  const { data: articles }: any = await supabase
    .from("articles")
    .select("id, title, slug, excerpt, published_at")
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .eq("law_area_id", areaData.law_areas.id)
    .order("published_at", { ascending: false })
    .limit(5);

  return c.html(
    renderPublic(c, tenant, "areas", (
      <div>
        <div class="max-w-4xl mx-auto px-4 pt-6">
          <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Áreas de Atuação", href: "/areas" }, { label: areaData.law_areas.name }]} basePath={getBasePath(c)} />
        </div>
        {/* Hero */}
        <section class="bg-secondary text-white py-16 px-4">
          <div class="max-w-4xl mx-auto">
            <div class="w-16 h-16 rounded-xl bg-primary flex items-center justify-center mb-6">
              <i class={`${phIcon(areaData.law_areas.icon)} text-3xl text-white`} aria-hidden="true" />
            </div>
            <h1 class="text-4xl font-serif font-bold mb-4">{areaData.law_areas.name}</h1>
            {areaData.description && <p class="text-lg text-gray-300 max-w-2xl">{areaData.description}</p>}
          </div>
        </section>

        {/* Content */}
        <div class="max-w-4xl mx-auto px-4 py-12">
          {areaData.description && (
            <div class="prose prose-lg max-w-none text-gray-600">
              <p class="text-lg leading-relaxed">{areaData.description}</p>
            </div>
          )}

          {/* CTA */}
          <div class="mt-10 p-8 bg-gray-50 rounded-xl text-center">
            <h3 class="text-xl font-semibold text-secondary mb-2">Precisa de ajuda nesta área?</h3>
            <p class="text-gray-500 mb-4">Entre em contato para uma consulta inicial.</p>
            <a href={`${b}/contato`} class="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
              Falar com um Advogado
            </a>
          </div>

          {/* Related articles */}
          {articles && articles.length > 0 && (
            <div class="mt-12">
              <h3 class="text-2xl font-serif font-bold text-secondary mb-6">Artigos Relacionados</h3>
              <div class="space-y-4">
                {articles.map((article: any) => (
                  <a href={`${b}/artigos/${article.slug}`} class="block p-5 rounded-lg border border-gray-100 hover:border-primary transition">
                    <h4 class="font-semibold text-secondary hover:text-primary">{article.title}</h4>
                    {article.excerpt && <p class="text-sm text-gray-500 mt-1 line-clamp-2">{article.excerpt}</p>}
                    <span class="text-xs text-gray-400 mt-2 block">
                      {article.published_at && new Date(article.published_at).toLocaleDateString("pt-BR")}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )),
  );
});

// =========================================================================
// GET /artigos — List all published articles
// =========================================================================
publicSiteRoutes.get("/artigos", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 9;
  const offset = (page - 1) * limit;
  const areaFilter = c.req.query("area") ?? "";
  const search = c.req.query("q") ?? "";

  // Fetch areas for filter dropdown
  const { data: areas } = await supabase
    .from("tenant_law_areas")
    .select("law_areas!inner(id, name, slug)")
    .eq("tenant_id", tenant.id)
    .order("law_areas(name)");

  let query = supabase
    .from("articles")
    .select("id, title, slug, excerpt, cover_image_url, published_at, reading_time_min, law_areas(name)", { count: "exact" })
    .eq("tenant_id", tenant.id)
    .eq("status", "published");

  if (areaFilter) {
    const areaObj = (areas as any)?.find((a: any) => a.law_areas?.slug === areaFilter);
    if (areaObj) query = query.eq("law_area_id", areaObj.law_areas.id);
  }
  if (search) {
    query = query.or(`title.ilike.%${sanitizeILike(search)}%,excerpt.ilike.%${sanitizeILike(search)}%`);
  }

  const { data: articles, count } = await query
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalPages = Math.ceil((count ?? 0) / limit);

  return c.html(
    renderPublic(c, tenant, "artigos", (
      <div class="max-w-6xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-secondary mb-2 text-center">Artigos</h1>
        <p class="text-center text-gray-500 mb-8">Conteúdo jurídico produzido por nossa equipe</p>

        {/* Search + filter */}
        <div class="max-w-2xl mx-auto mb-10 flex flex-col sm:flex-row gap-3">
          <form method="get" action={`${b}/artigos`} class="flex-1 flex gap-2">
            <div class="relative flex-1">
              <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input type="text" name="q" value={search} placeholder="Buscar artigos..." class="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-primary text-sm" aria-label="Buscar artigos" />
            </div>
            {areaFilter && <input type="hidden" name="area" value={areaFilter} />}
            <button type="submit" class="btn btn-secondary px-4 py-2.5 text-sm" aria-label="Buscar">
              <i class="ph ph-magnifying-glass" aria-hidden="true" />
            </button>
          </form>
          {areas && areas.length > 0 && (
            <select onchange={`window.location.href='${b}/artigos' + (this.value ? '?area=' + this.value : '')`} class="px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-primary text-sm bg-white" aria-label="Filtrar por área">
              <option value="">Todas as áreas</option>
              {(areas as any).map((a: any) => (
                <option value={a.law_areas?.slug} selected={a.law_areas?.slug === areaFilter}>{a.law_areas?.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Active filter indicator */}
        {(areaFilter || search) && (
          <div class="max-w-2xl mx-auto mb-6 text-center text-sm text-gray-500">
            {areaFilter && <span class="inline-block bg-gray-100 rounded-full px-3 py-1 mr-2">Área: {areas && (areas as any).find((a: any) => a.law_areas?.slug === areaFilter)?.law_areas?.name}</span>}
            {search && <span class="inline-block bg-gray-100 rounded-full px-3 py-1 mr-2">Busca: "{search}"</span>}
            <a href={`${b}/artigos`} class="text-primary hover:underline">Limpar filtros</a>
          </div>
        )}

        {(!articles || articles.length === 0) ? (
          <div class="text-center py-12 text-gray-400">
            <i class="ph ph-file-text text-5xl block mb-4" aria-hidden="true" />
            <p>{(areaFilter || search) ? "Nenhum artigo encontrado com esses filtros." : "Nenhum artigo publicado ainda."}</p>
          </div>
        ) : (
          <>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
              {articles.map((article: any) => (
                <a href={`${b}/artigos/${article.slug}`} class="group">
                  {article.cover_image_url ? (
                    <img src={article.cover_image_url} alt={article.title} class="w-full h-48 object-cover rounded-xl mb-4" loading="lazy" decoding="async" />
                  ) : (
                    <div class="w-full h-48 bg-gray-100 rounded-xl mb-4 flex items-center justify-center">
                      <i class="ph ph-file-text text-4xl text-gray-300" aria-hidden="true" />
                    </div>
                  )}
                  {article.law_areas?.name && (
                    <span class="text-xs font-semibold text-primary uppercase tracking-wide">{article.law_areas.name}</span>
                  )}
                  <h3 class="text-lg font-semibold text-secondary group-hover:text-primary transition mb-2 mt-1">{article.title}</h3>
                  {article.excerpt && <p class="text-sm text-gray-500 line-clamp-3">{article.excerpt}</p>}
                  <div class="text-xs text-gray-400 mt-2">
                    {article.published_at && new Date(article.published_at).toLocaleDateString("pt-BR")}
                    {article.reading_time_min && ` • ${article.reading_time_min} min`}
                  </div>
                </a>
              ))}
            </div>

            {/* Págination */}
            {totalPages > 1 && (
              <div class="flex justify-center gap-2 mt-12">
                {page > 1 && <a href={`${b}/artigos?page=${page - 1}`} class="px-4 py-2 rounded-lg border border-gray-200 hover:border-primary"><span aria-hidden="true">←</span> Anterior</a>}
                <span class="px-4 py-2 text-gray-500">Página {page} de {totalPages}</span>
                {page < totalPages && <a href={`${b}/artigos?page=${page + 1}`} class="px-4 py-2 rounded-lg border border-gray-200 hover:border-primary">Próxima <span aria-hidden="true">→</span></a>}
              </div>
            )}
          </>
        )}
      </div>
    )),
  );
});

// =========================================================================
// GET /artigos/:slug — Single article
// =========================================================================
publicSiteRoutes.get("/artigos/:slug", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);
  const slug = c.req.param("slug");

  const { data: article } = await supabase
    .from("articles")
    .select(`
      id, title, slug, excerpt, content, cover_image_url, published_at,
      reading_time_min, meta_description,
      law_areas (name, slug),
      profiles (full_name)
    `)
    .eq("tenant_id", tenant.id)
    .eq("slug", slug)
    .eq("status", "published")
    .single();
  const articleData: any = article;

  if (!articleData) {
    return c.html(
      renderPublic(c, tenant, "artigos", (
        <div class="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 class="text-2xl font-bold text-gray-400 mb-4">Artigo não encontrado</h1>
          <a href={`${b}/artigos`} class="text-primary hover:underline"><span aria-hidden="true">←</span> Voltar para artigos</a>
        </div>
      )),
      404,
    );
  }

  // Fetch related articles
  const { data: related }: any = await supabase
    .from("articles")
    .select("id, title, slug, excerpt, published_at")
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .neq("id", article!.id)
    .order("published_at", { ascending: false })
    .limit(3);

  // JSON-LD for Article
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: articleData.title,
    description: articleData.meta_description ?? articleData.excerpt ?? "",
    ...(articleData.cover_image_url ? { image: articleData.cover_image_url } : {}),
    ...(articleData.published_at ? { datePublished: articleData.published_at } : {}),
    author: { "@type": "Person", name: articleData.profiles?.full_name ?? tenant.name },
    publisher: { "@type": "Organization", name: tenant.name, ...(tenant.logo_url ? { logo: tenant.logo_url } : {}) },
  };

  return c.html(
    renderPublic(c, tenant, "artigos", (
      <article>
        {/* Hero */}
        {articleData.cover_image_url && (
          <div class="w-full h-64 md:h-96 bg-gray-100 overflow-hidden">
            <img src={articleData.cover_image_url} alt={articleData.title} class="w-full h-full object-cover" loading="lazy" decoding="async" />
          </div>
        )}

        <div class="max-w-3xl mx-auto px-4 py-12">
          <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Artigos", href: "/artigos" }, { label: articleData.title }]} basePath={b} />
          {/* Meta */}
          {articleData.law_areas?.name && (
            <a href={`${b}/areas/${articleData.law_areas.slug}`} class="text-sm font-semibold text-primary uppercase tracking-wide hover:underline">
              {articleData.law_areas.name}
            </a>
          )}
          <h1 class="text-3xl md:text-4xl font-serif font-bold text-secondary mt-2 mb-4">{articleData.title}</h1>

          <div class="flex items-center gap-3 text-sm text-gray-400 mb-8">
            {articleData.profiles?.full_name && <span>Por {articleData.profiles.full_name}</span>}
            {articleData.published_at && <span>• {new Date(articleData.published_at).toLocaleDateString("pt-BR")}</span>}
            {articleData.reading_time_min && <span>• {articleData.reading_time_min} min de leitura</span>}
          </div>

          {/* Content */}
          {articleData.excerpt && !articleData.cover_image_url && (
            <p class="text-xl text-gray-600 font-serif italic mb-8 leading-relaxed">{articleData.excerpt}</p>
          )}

          <div class="prose prose-lg max-w-none text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(articleData.content) }} />

          {/* Social share buttons */}
          <div class="mt-8 flex items-center gap-3 pt-6 border-t border-gray-100">
            <span class="text-sm text-gray-500 font-medium">Compartilhar:</span>
            <a href={`https://wa.me/?text=${encodeURIComponent(articleData.title + " — " + (c.req.url))}`} target="_blank" rel="noopener" class="w-9 h-9 rounded-lg bg-gray-100 hover:bg-green-50 hover:text-green-600 flex items-center justify-center transition" aria-label="Compartilhar no WhatsApp">
              <i class="ph ph-whatsapp-logo" aria-hidden="true" />
            </a>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(c.req.url)}`} target="_blank" rel="noopener" class="w-9 h-9 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition" aria-label="Compartilhar no LinkedIn">
              <i class="ph ph-linkedin-logo" aria-hidden="true" />
            </a>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(articleData.title)}&url=${encodeURIComponent(c.req.url)}`} target="_blank" rel="noopener" class="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition" aria-label="Compartilhar no Twitter/X">
              <i class="ph ph-x-logo" aria-hidden="true" />
            </a>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(c.req.url)}`} target="_blank" rel="noopener" class="w-9 h-9 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-center transition" aria-label="Compartilhar no Facebook">
              <i class="ph ph-facebook-logo" aria-hidden="true" />
            </a>
            <button type="button" onclick="navigator.clipboard.writeText(window.location.href); this.querySelector('i').className='ph ph-check text-green-600'" class="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition" aria-label="Copiar link">
              <i class="ph ph-link" aria-hidden="true" />
            </button>
          </div>

          {/* CTA */}
          <div class="mt-12 p-6 bg-gray-50 rounded-xl text-center">
            <h3 class="text-lg font-semibold text-secondary mb-2">Gostou do conteúdo?</h3>
            <p class="text-gray-500 mb-4">Entre em contato para saber mais sobre como podemos ajudar.</p>
            <a href={`${b}/contato`} class="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
              Falar Conosco
            </a>
          </div>

          {/* Related */}
          {related && related.length > 0 && (
            <div class="mt-12">
              <h3 class="text-xl font-serif font-bold text-secondary mb-6">Artigos Relacionados</h3>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                {related.map((r: any) => (
                  <a href={`${b}/artigos/${r.slug}`} class="group">
                    <h4 class="font-semibold text-secondary group-hover:text-primary transition">{r.title}</h4>
                    {r.excerpt && <p class="text-sm text-gray-500 mt-1 line-clamp-2">{r.excerpt}</p>}
                    <span class="text-xs text-gray-400 mt-2 block">
                      {r.published_at && new Date(r.published_at).toLocaleDateString("pt-BR")}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    ), articleData.title, articleData.meta_description ?? articleData.excerpt, articleJsonLd),
  );
});

// =========================================================================
// GET /contato — Contact form
// =========================================================================
publicSiteRoutes.get("/contato", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);
  const error = c.req.query("error");
  // Preserve form data on validation error (redirect back with query params)
  const prefName = c.req.query("name") ?? "";
  const prefEmail = c.req.query("email") ?? "";
  const prefPhone = c.req.query("phone") ?? "";
  const prefSubject = c.req.query("subject") ?? "";
  const prefMessage = c.req.query("message") ?? "";
  const prefArea = c.req.query("law_area_id") ?? "";

  const { data: areas }: any = await supabase
    .from("tenant_law_areas")
    .select("law_areas (id, name)")
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true });

  return c.html(
    renderPublic(c, tenant, "contato", (
      <div class="max-w-4xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-secondary mb-2 text-center">Entre em Contato</h1>
        <p class="text-center text-gray-500 mb-12">Estamos aqui para ajudar você</p>

        {error && (
          <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-center">
            {decodeURIComponent(error)}
          </div>
        )}

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Contact info */}
          <div class="space-y-6">
            {tenant.email_public && (
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <i class="ph ph-envelope text-xl text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h3 class="font-semibold text-secondary text-sm">E-mail</h3>
                  <a href={`mailto:${tenant.email_public}`} class="text-gray-500 text-sm hover:text-primary">{tenant.email_public}</a>
                </div>
              </div>
            )}
            {tenant.phone && (
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <i class="ph ph-phone text-xl text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h3 class="font-semibold text-secondary text-sm">Telefone</h3>
                  <a href={`tel:${tenant.phone}`} class="text-gray-500 text-sm hover:text-primary">{tenant.phone}</a>
                </div>
              </div>
            )}
            {tenant.whatsapp && (
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <i class="ph ph-whatsapp-logo text-xl text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h3 class="font-semibold text-secondary text-sm">WhatsApp</h3>
                  <a href={`https://wa.me/${tenant.whatsapp.replace(/\D/g, "")}`} class="text-gray-500 text-sm hover:text-primary">{tenant.whatsapp}</a>
                </div>
              </div>
            )}
            {tenant.address && (
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <i class="ph ph-map-pin text-xl text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h3 class="font-semibold text-secondary text-sm">Endereço</h3>
                  <p class="text-gray-500 text-sm">{tenant.address}</p>
                </div>
              </div>
            )}
          </div>

          {/* Form */}
          <div class="md:col-span-2">
            <form method="post" action={`${b}/contato`} class="space-y-4 bg-gray-50 p-6 rounded-xl">
              {/* Honeypot field — hidden from users, bots fill it */}
              <input type="text" name="website" tabIndex={-1} autocomplete="off" class="absolute -left-[9999px] opacity-0" aria-hidden="true" />
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="contact-name" class="block text-sm font-semibold text-gray-700 mb-1">Nome *</label>
                  <input id="contact-name" type="text" name="name" required value={prefName} class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
                </div>
                <div>
                  <label for="contact-email" class="block text-sm font-semibold text-gray-700 mb-1">E-mail *</label>
                  <input id="contact-email" type="email" name="email" required value={prefEmail} class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="contact-phone" class="block text-sm font-semibold text-gray-700 mb-1">Telefone</label>
                  <input id="contact-phone" type="tel" name="phone" value={prefPhone} class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
                </div>
                {areas && areas.length > 0 && (
                  <div>
                    <label for="contact-area" class="block text-sm font-semibold text-gray-700 mb-1">Área de Interesse</label>
                    <select id="contact-area" name="law_area_id" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary">
                      <option value="">Selecione...</option>
                      {areas.map((a: any) => (
                        <option value={a.law_areas.id} selected={prefArea === String(a.law_areas.id)}>{a.law_areas.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label for="contact-subject" class="block text-sm font-semibold text-gray-700 mb-1">Assunto</label>
                <input id="contact-subject" type="text" name="subject" value={prefSubject} class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
              </div>
              <div>
                <label for="contact-message" class="block text-sm font-semibold text-gray-700 mb-1">Mensagem *</label>
                <textarea id="contact-message" name="message" required rows={5} class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary">{prefMessage}</textarea>
              </div>
              <button type="submit" class="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:opacity-90 transition">
                Enviar Mensagem
              </button>
            </form>
          </div>
        </div>
      </div>
    )),
  );
});

// =========================================================================
// POST /contato — Submit contact form (creates lead + contact submission)
// =========================================================================
publicSiteRoutes.post("/contato", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);
  const body = await c.req.parseBody();

  // Honeypot: if "website" field is filled, it's a bot — silently succeed
  const honeypot = String(body.website ?? "").trim();
  if (honeypot) {
    return c.html(renderPublic(c, tenant, "contato", (
      <div class="max-w-2xl mx-auto px-4 py-20 text-center">
        <div class="w-16 h-16 rounded-full bg-status-green-bg flex items-center justify-center mx-auto mb-6">
          <i class="ph ph-check-circle text-4xl text-status-green" aria-hidden="true" />
        </div>
        <h1 class="text-3xl font-serif font-bold text-secondary mb-3">Mensagem Enviada!</h1>
        <p class="text-gray-500 mb-8">Obrigado pelo contato. Retornaremos o mais breve possível.</p>
        <a href={`${b}/`} class="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">Voltar ao Início</a>
      </div>
    )));
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim() || null;
  const subject = String(body.subject ?? "").trim() || null;
  const message = String(body.message ?? "").trim();
  const lawAreaId = String(body.law_area_id ?? "").trim() || null;

  if (!name || !email || !message) {
    const params = new URLSearchParams({ error: "Por favor, preencha todos os campos obrigatórios.", name, email, phone: phone ?? "", subject: subject ?? "", message, law_area_id: lawAreaId ?? "" });
    return c.redirect(`${b}/contato?${params.toString()}`);
  }

  // 1. Create a lead in the CRM
  const { data: lead }: any = await supabase
    .from("leads")
    .insert({
      tenant_id: tenant.id,
      name,
      email,
      phone,
      source: "site_publico",
      status: "novo",
      notes: `${subject ?? ""} ${message}`.trim() || null,
    })
    .select("id")
    .single();

  // 2. Save the contact submission
  await supabase
    .from("contact_submissions")
    .insert({
      tenant_id: tenant.id,
      name,
      email,
      phone,
      subject,
      message,
      law_area_id: lawAreaId,
      lead_id: lead?.id ?? null,
      status: "new",
    });

  log.info("Contact submission received", { tenantId: tenant.id, email, leadId: lead?.id });

  return c.html(
    renderPublic(c, tenant, "contato", (
      <div class="max-w-2xl mx-auto px-4 py-20 text-center">
        <div class="w-16 h-16 rounded-full bg-status-green-bg flex items-center justify-center mx-auto mb-6">
          <i class="ph ph-check-circle text-4xl text-status-green" aria-hidden="true" />
        </div>
        <h1 class="text-3xl font-serif font-bold text-secondary mb-3">Mensagem Enviada!</h1>
        <p class="text-gray-500 mb-8">Obrigado pelo contato, {name.split(" ")[0]}. Retornaremos o mais breve possível.</p>
        <a href={`${b}/`} class="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
          Voltar ao Início
        </a>
      </div>
    )),
  );
});

// =========================================================================
// POST /newsletter — Subscribe
// =========================================================================
publicSiteRoutes.post("/newsletter", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);
  const body = await c.req.parseBody();
  const email = (body.email as string)?.trim();

  // Honeypot: silently succeed for bots
  if (String(body.website ?? "").trim()) return c.redirect(`${b}/`);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return c.redirect(`${b}/`);

  // Insert (ignore duplicates via upsert)
  await supabase
    .from("newsletter_subscriptions")
    .upsert({ tenant_id: tenant.id, email }, { onConflict: "tenant_id,email" });

  return c.html(
    renderPublic(c, tenant, "home", (
      <div class="max-w-2xl mx-auto px-4 py-20 text-center">
        <div class="w-16 h-16 rounded-full bg-status-green-bg flex items-center justify-center mx-auto mb-6">
          <i class="ph ph-check-circle text-4xl text-status-green" aria-hidden="true" />
        </div>
        <h1 class="text-3xl font-serif font-bold text-secondary mb-3">Inscrição Confirmada!</h1>
        <p class="text-gray-500 mb-8">Obrigado! Você receberá nossos conteúdos no email {email}.</p>
        <a href={`${b}/`} class="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
          Voltar ao Início
        </a>
      </div>
    )),
  );
});

// =========================================================================
// GET /reconhecimentos — Recognitions page
// =========================================================================
publicSiteRoutes.get("/reconhecimentos", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  const { data: recognitions }: any = await supabase
    .from("recognitions")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .order("year", { ascending: false });

  return c.html(
    renderPublic(c, tenant, "reconhecimentos", (
      <div class="max-w-5xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-secondary text-center mb-4">Reconhecimentos</h1>
        <p class="text-center text-gray-500 mb-12 max-w-2xl mx-auto">
          Nossos reconhecimentos e premiações são reflexo do compromisso com a excelência jurídica.
        </p>

        {recognitions && recognitions.length > 0 ? (
          <div class="space-y-6">
            {recognitions.map((r: any) => (
              <div class="flex items-start gap-4 p-6 rounded-xl border border-gray-100 hover:shadow-md transition">
                <div class="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <i class={`${phIcon(r.icon, "ph-trophy")} text-2xl text-primary`} aria-hidden="true" />
                </div>
                <div class="flex-1">
                  <h3 class="text-lg font-semibold text-secondary">{r.title}</h3>
                  {r.organization && <p class="text-sm text-gray-500">{r.organization}{r.year ? ` • ${r.year}` : ""}</p>}
                  {r.ranking_position && <p class="text-sm text-primary font-semibold mt-1">{r.ranking_position}</p>}
                  {r.description && <p class="text-sm text-gray-600 mt-2">{r.description}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p class="text-center text-gray-400">Em breve compartilharemos nossos reconhecimentos.</p>
        )}
      </div>
    )),
  );
});

// =========================================================================
// GET /equipe — Team listing page
// =========================================================================
publicSiteRoutes.get("/equipe", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  const { data: members }: any = await supabase
    .from("public_team_members")
    .select("id, public_name, public_title, public_bio, public_photo_url, slug, sort_order")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  return c.html(
    renderPublic(c, tenant, "equipe", (
      <div class="max-w-6xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-secondary text-center mb-4">Nossa Equipe</h1>
        <p class="text-center text-gray-500 mb-12 max-w-2xl mx-auto">
          Conheça os profissionais que dedicam sua experiência e conhecimento para entregar os melhores resultados aos nossos clientes.
        </p>

        {members && members.length > 0 ? (
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {members.map((m: any) => (
              <a href={`${b}/equipe/${m.slug}`} class="group text-center">
                <div class="w-32 h-32 mx-auto rounded-full overflow-hidden border-4 border-gray-100 group-hover:border-primary transition mb-4">
                  {m.public_photo_url ? (
                    <img src={m.public_photo_url} alt={m.public_name} class="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div class="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-4xl font-semibold">
                      {m.public_name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                <h3 class="text-lg font-semibold text-secondary group-hover:text-primary transition">{m.public_name}</h3>
                <p class="text-sm text-gray-500">{m.public_title}</p>
                {m.public_bio && <p class="text-sm text-gray-400 mt-2 line-clamp-3">{m.public_bio}</p>}
              </a>
            ))}
          </div>
        ) : (
          <p class="text-center text-gray-400">Em breve conhecerá nossa equipe.</p>
        )}
      </div>
    )),
  );
});

// =========================================================================
// GET /equipe/:slug — Team member detail page
// =========================================================================
publicSiteRoutes.get("/equipe/:slug", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);
  const slug = c.req.param("slug");

  const { data: member }: any = await supabase
    .from("public_team_members")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!member) {
    return c.html(
      renderPublic(c, tenant, "equipe", (
        <div class="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 class="text-2xl font-serif font-bold text-secondary mb-4">Profissional não encontrado</h1>
          <a href={`${b}/equipe`} class="text-primary hover:underline"><span aria-hidden="true">←</span> Ver toda a equipe</a>
        </div>
      )),
      404,
    );
  }

  // JSON-LD for Attorney
  const attorneyJsonLd = {
    "@context": "https://schema.org",
    "@type": "Attorney",
    name: member.public_name,
    jobTitle: member.public_title ?? "",
    worksFor: { "@type": "Organization", name: tenant.name },
    ...(member.public_photo_url ? { image: member.public_photo_url } : {}),
    ...(member.public_email ? { email: member.public_email } : {}),
    ...(member.public_linkedin ? { sameAs: member.public_linkedin } : {}),
  };

  return c.html(
    renderPublic(c, tenant, "equipe", (
      <div class="max-w-4xl mx-auto px-4 py-16">
        <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Equipe", href: "/equipe" }, { label: member.public_name }]} basePath={b} />
        <a href={`${b}/equipe`} class="text-primary hover:underline text-sm mb-6 inline-block"><span aria-hidden="true">←</span> Voltar para a equipe</a>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Photo */}
          <div class="text-center">
            <div class="w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-gray-100 mb-4">
              {member.public_photo_url ? (
                <img src={member.public_photo_url} alt={member.public_name} class="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div class="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-6xl font-semibold">
                  {member.public_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>
            {member.public_linkedin && (
              <a href={member.public_linkedin} target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary">
                <i class="ph ph-linkedin-logo" aria-hidden="true"></i> LinkedIn
              </a>
            )}
          </div>

          {/* Info */}
          <div class="md:col-span-2">
            <h1 class="text-3xl font-serif font-bold text-secondary mb-2">{member.public_name}</h1>
            <p class="text-lg text-primary font-semibold mb-6">{member.public_title}</p>

            {member.public_bio && (
              <div class="prose prose-sm max-w-none">
                <p class="text-gray-600 whitespace-pre-wrap">{member.public_bio}</p>
              </div>
            )}

            {member.public_email && (
              <div class="mt-8 pt-6 border-t border-gray-100">
                <h3 class="text-sm font-semibold text-gray-700 mb-2">Contato</h3>
                <a href={`mailto:${member.public_email}`} class="text-primary hover:underline">{member.public_email}</a>
              </div>
            )}

            <div class="mt-6">
              <a href={`${b}/contato`} class="inline-block bg-primary text-white px-6 py-2.5 rounded-lg font-semibold hover:opacity-90 transition text-sm">
                Agendar Consulta
              </a>
            </div>
          </div>
        </div>
      </div>
    ), `${member.public_name} — ${tenant.name}`, member.public_bio?.slice(0, 160), attorneyJsonLd),
  );
});

// =========================================================================
// GET /lgpd — Privacy policy
// =========================================================================
publicSiteRoutes.get("/lgpd", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  return c.html(
    renderPublic(c, tenant, "lgpd", (
      <div class="max-w-3xl mx-auto px-4 py-16">
        <h1 class="text-3xl font-serif font-bold text-secondary mb-8">Política de Privacidade</h1>
        <div class="prose prose-sm max-w-none text-gray-600 space-y-4">
          <p><strong>Última atualização:</strong> 02 de agosto de 2026</p>
          <p>{tenant.name} ("Escritório", "nós" ou "nosso") leva a privacidade dos dados pessoais a sério. Esta política descreve como coletamos, usamos e protegemos as informações que você nos fornece.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">1. Dados Coletados</h2>
          <p>Coletamos os seguintes dados quando você interage com nosso site ou serviços:</p>
          <ul class="list-disc pl-6 space-y-1">
            <li>Nome, email e telefone (formulário de contato)</li>
            <li>Informações de navegação (cookies essenciais)</li>
            <li>Conteúdo de mensagens enviadas via formulário</li>
          </ul>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">2. Uso dos Dados</h2>
          <p>Utilizamos seus dados para:</p>
          <ul class="list-disc pl-6 space-y-1">
            <li>Responder solicitações de contato e consultas</li>
            <li>Enviar conteúdos informativos (mediante consentimento)</li>
            <li>Cumprir obrigações legais e regulatórias</li>
          </ul>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">3. Base Legal</h2>
          <p>O tratamento dos seus dados pessoais é fundamentado na Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018), com base no consentimento e na execução de contratos.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">4. Seus Direitos</h2>
          <p>Você tem direito a acessar, corrigir, excluir ou portar seus dados pessoais. Para exercer esses direitos, entre em contato pelo email {tenant.email_public ?? "nosso email de contato"}.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">5. Segurança</h2>
          <p>Adotamos medidas técnicas e organizacionais para proteger seus dados contra acessos não autorizados, alteração ou divulgação indevida.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">6. Contato</h2>
          <p>Para questões relacionadas a esta política, entre em contato através da nossa <a href={`${b}/contato`} class="text-primary hover:underline">página de contato</a>.</p>
        </div>
      </div>
    )),
  );
});

// =========================================================================
// GET /lgpd/termos — Terms of use
// =========================================================================
publicSiteRoutes.get("/lgpd/termos", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  return c.html(
    renderPublic(c, tenant, "lgpd", (
      <div class="max-w-3xl mx-auto px-4 py-16">
        <h1 class="text-3xl font-serif font-bold text-secondary mb-8">Termos de Uso</h1>
        <div class="prose prose-sm max-w-none text-gray-600 space-y-4">
          <p><strong>Última atualização:</strong> 02 de agosto de 2026</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">1. Natureza do Serviço</h2>
          <p>Este site tem caráter informativo. As informações aqui apresentadas não constituem aconselhamento jurídico e não substituem a consulta com um advogado.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">2. Uso Permitido</h2>
          <p>Você concorda em utilizar o site de forma ética e legal, não reproduzindo conteúdo sem autorização expressa.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">3. Propriedade Intelectual</h2>
          <p>Todo o conteúdo deste site (textos, imagens, logotipos, artigos) é protegido por direitos autorais e pertence a {tenant.name}, salvo quando indicado o contrário.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">4. Limitação de Responsabilidade</h2>
          <p>{tenant.name} não se responsabiliza por decisões tomadas com base exclusivamente no conteúdo deste site, sem a devida consulta profissional.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">5. Alterações</h2>
          <p>Estes termos podem ser alterados a qualquer momento, sem aviso prévio. Recomendamos a consulta periódica a esta página.</p>
        </div>
      </div>
    )),
  );
});

// =========================================================================
// GET /sitemap.xml — Dynamic sitemap per tenant
// =========================================================================
publicSiteRoutes.get("/sitemap.xml", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  // Build base URL (prefer custom domain, then subdomain, then path-based)
  const host = c.req.header("host") ?? "pragmaos.app";
  const protocol = c.req.header("x-forwarded-proto") ?? "https";
  const baseUrl = b ? `${protocol}://${host}${b}` : `${protocol}://${host}`;

  const staticUrls = [
    { loc: `${baseUrl}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${baseUrl}/areas`, priority: "0.8", changefreq: "monthly" },
    { loc: `${baseUrl}/equipe`, priority: "0.8", changefreq: "monthly" },
    { loc: `${baseUrl}/artigos`, priority: "0.8", changefreq: "weekly" },
    { loc: `${baseUrl}/sobre`, priority: "0.6", changefreq: "monthly" },
    { loc: `${baseUrl}/contato`, priority: "0.6", changefreq: "monthly" },
    { loc: `${baseUrl}/reconhecimentos`, priority: "0.5", changefreq: "monthly" },
  ];

  // Fetch dynamic content for sitemap
  const [areasRes, articlesRes, teamRes] = await Promise.all([
    supabase.from("tenant_law_areas").select("law_areas(slug)").eq("tenant_id", tenant.id),
    supabase.from("articles").select("slug, published_at").eq("tenant_id", tenant.id).eq("status", "published"),
    supabase.from("public_team_members").select("slug").eq("tenant_id", tenant.id).eq("is_published", true),
  ]);

  const areaUrls = (areasRes.data ?? []).map((a: any) => ({ loc: `${baseUrl}/areas/${a.law_areas.slug}`, priority: "0.7", changefreq: "monthly" }));
  const articleUrls = (articlesRes.data ?? []).map((a: any) => ({ loc: `${baseUrl}/artigos/${a.slug}`, priority: "0.7", changefreq: "weekly", lastmod: a.published_at?.split("T")[0] }));
  const teamUrls = (teamRes.data ?? []).map((m: any) => ({ loc: `${baseUrl}/equipe/${m.slug}`, priority: "0.6", changefreq: "monthly" }));

  const allUrls = [...staticUrls, ...areaUrls, ...articleUrls, ...teamUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
    ${"lastmod" in u && u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
});

// =========================================================================
// GET /robots.txt — Per tenant
// =========================================================================
publicSiteRoutes.get("/robots.txt", (c) => {
  const b = getBasePath(c);
  const host = c.req.header("host") ?? "pragmaos.app";
  const protocol = c.req.header("x-forwarded-proto") ?? "https";
  const baseUrl = b ? `${protocol}://${host}${b}` : `${protocol}://${host}`;

  const body = `User-agent: *
Allow: /
Disallow: /contato?error=

Sitemap: ${baseUrl}/sitemap.xml`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
