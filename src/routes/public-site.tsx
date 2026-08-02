// Public site routes — served when a tenant is resolved by host.
// Routes: / (home), /sobre, /areas, /areas/:slug, /artigos, /artigos/:slug, /contato

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { supabase } from "../lib/supabase";
import { log } from "../lib/logger";
import type { ResolvedTenant } from "../lib/tenant-resolver";
import { resolveTenantByHost, resolveTenantBySlug } from "../lib/tenant-resolver";
import { PublicLayout } from "../components/public-layout";

export const publicSiteRoutes = new Hono<AppEnv>();

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
function renderPublic(c: any, tenant: ResolvedTenant, active: string, content: any) {
  const basePath = getBasePath(c);
  return (
    <PublicLayout tenant={tenant} active={active} basePath={basePath}>
      {content}
    </PublicLayout>
  );
}

// =========================================================================
// GET / — Home page
// =========================================================================
publicSiteRoutes.get("/", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);

  // Fetch tenant's law areas
  const { data: areas }: any = await supabase
    .from("tenant_law_areas")
    .select(`
      description, sort_order,
      law_areas (id, name, slug, icon)
    `)
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true });

  // Fetch latest published articles
  const { data: articles }: any = await supabase
    .from("articles")
    .select("id, title, slug, excerpt, cover_image_url, published_at, reading_time_min")
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(3);

  // Fetch published stats
  const { data: stats }: any = await supabase
    .from("site_stats")
    .select("label, value, prefix, suffix, icon")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  // Fetch featured team members
  const { data: teamMembers }: any = await supabase
    .from("team_members")
    .select("public_name, public_title, public_photo_url, slug")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .eq("is_featured", true)
    .order("sort_order", { ascending: true })
    .limit(4);

  // Fetch testimonials
  const { data: testimonials }: any = await supabase
    .from("testimonials")
    .select("author_name, author_role, content, rating")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .limit(3);

  // Fetch client logos
  const { data: clients }: any = await supabase
    .from("client_logos")
    .select("name, logo_url, website_url")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  // Fetch recognitions
  const { data: recognitions }: any = await supabase
    .from("recognitions")
    .select("title, organization, year, ranking_position, icon")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .order("year", { ascending: false })
    .limit(6);

  // Fetch offices
  const { data: offices }: any = await supabase
    .from("offices")
    .select("label, address, city, state, phone, email")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

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
            <div class="flex gap-4 justify-center">
              <a href={`${b}/contato`} class="btn bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
                Fale Conosco
              </a>
              <a href={`${b}/areas`} class="btn border border-white/30 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition">
                Áreas de Atuação
              </a>
            </div>
          </div>
        </section>

        {/* Law areas preview */}
        {areas && areas.length > 0 && (
          <section class="py-16 px-4 max-w-6xl mx-auto">
            <h2 class="text-3xl font-serif font-bold text-center text-secondary mb-2">Áreas de Atuação</h2>
            <p class="text-center text-gray-500 mb-10">Como podemos ajudar você</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              {areas.map((a: any) => (
                <a href={`${b}/areas/${a.law_areas.slug}`} class="block p-6 rounded-xl border border-gray-100 hover:border-primary hover:shadow-lg transition group">
                  <div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition">
                    <i class={`${a.law_areas.icon ?? "ph-scales"} text-2xl text-primary group-hover:text-white`} aria-hidden="true" />
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
                <div>
                  {s.icon && <i class={`${s.icon} text-3xl text-primary mb-2 block`} aria-hidden="true" />}
                  <div class="text-4xl font-serif font-bold">
                    {s.prefix}{s.value}{s.suffix}
                  </div>
                  <div class="text-sm text-gray-400 mt-1">{s.label}</div>
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
                <a href={`${b}/equipe/${m.slug}`} class="group text-center">
                  <div class="w-24 h-24 mx-auto rounded-full overflow-hidden border-4 border-gray-100 group-hover:border-primary transition mb-3">
                    {m.public_photo_url ? (
                      <img src={m.public_photo_url} alt={m.public_name} class="w-full h-full object-cover" />
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
              <a href={`${b}/equipe`} class="text-primary font-semibold hover:underline">Conheça toda a equipe →</a>
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
                personalizadas e estrategicas para nossos clientes.
              </p>
              <a href={`${b}/sobre`} class="inline-block mt-6 text-primary font-semibold hover:underline">
                Conheça nossa historia →
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
                    <img src={article.cover_image_url} alt={article.title} class="w-full h-48 object-cover rounded-xl mb-4" />
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
              <a href={`${b}/artigos`} class="text-primary font-semibold hover:underline">Ver todos os artigos →</a>
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Client logos */}
        {clients && clients.length > 0 && (
          <section class="py-12 px-4 max-w-6xl mx-auto">
            <h2 class="text-center text-lg font-semibold text-gray-400 mb-8 uppercase tracking-wider">Nossos Clientes</h2>
            <div class="flex flex-wrap items-center justify-center gap-8">
              {clients.map((cl: any) => (
                <a href={cl.website_url ?? "#"} target="_blank" rel="noopener" class="grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition">
                  {cl.logo_url ? (
                    <img src={cl.logo_url} alt={cl.name} class="h-12 w-auto max-w-32 object-contain" />
                  ) : (
                    <span class="text-lg font-semibold text-gray-400">{cl.name}</span>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Recognitions */}
        {recognitions && recognitions.length > 0 && (
          <section class="py-16 px-4 bg-secondary text-white">
            <div class="max-w-5xl mx-auto">
              <h2 class="text-3xl font-serif font-bold text-center mb-10">Reconhecimentos</h2>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                {recognitions.map((r: any) => (
                  <div class="text-center">
                    {r.icon && <i class={`${r.icon} text-4xl text-primary mb-3 block`} aria-hidden="true" />}
                    <h3 class="font-semibold text-lg">{r.title}</h3>
                    {r.organization && <p class="text-sm text-gray-400">{r.organization}</p>}
                    {r.year && <p class="text-sm text-gray-500">{r.year}{r.ranking_position ? ` • ${r.ranking_position}` : ""}</p>}
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
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            <form method="post" action={`${b}/newsletter`} class="flex gap-2 max-w-md mx-auto">
              <input type="email" name="email" required placeholder="Seu email..." class="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-primary text-sm" />
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
              <div class="text-sm text-gray-500">Areas de atuacao</div>
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
                  <i class={`${a.law_areas.icon ?? "ph-scales"} text-2xl text-primary`} aria-hidden="true" />
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
            <p>Em breve nossas areas de atuacao.</p>
          </div>
        ) : (
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {areas.map((a: any) => (
              <a href={`${b}/areas/${a.law_areas.slug}`} class="block p-8 rounded-xl border border-gray-100 hover:border-primary hover:shadow-xl transition group">
                <div class="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary transition">
                  <i class={`${a.law_areas.icon ?? "ph-scales"} text-3xl text-primary group-hover:text-white`} aria-hidden="true" />
                </div>
                <h3 class="text-xl font-serif font-bold text-secondary mb-3">{a.law_areas.name}</h3>
                {a.description && <p class="text-gray-500 line-clamp-4">{a.description}</p>}
                <span class="text-primary font-semibold text-sm mt-4 inline-block">Saiba mais →</span>
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
          <a href={`${b}/areas`} class="text-primary hover:underline">← Voltar para areas</a>
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
        {/* Hero */}
        <section class="bg-secondary text-white py-16 px-4">
          <div class="max-w-4xl mx-auto">
            <div class="w-16 h-16 rounded-xl bg-primary flex items-center justify-center mb-6">
              <i class={`${areaData.law_areas.icon ?? "ph-scales"} text-3xl text-white`} aria-hidden="true" />
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
            <h3 class="text-xl font-semibold text-secondary mb-2">Precisa de ajuda nesta area?</h3>
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

  const { data: articles, count } = await supabase
    .from("articles")
    .select("id, title, slug, excerpt, cover_image_url, published_at, reading_time_min, law_areas(name)", { count: "exact" })
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalPages = Math.ceil((count ?? 0) / limit);

  return c.html(
    renderPublic(c, tenant, "artigos", (
      <div class="max-w-6xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-secondary mb-2 text-center">Artigos</h1>
        <p class="text-center text-gray-500 mb-12">Conteudo juridico produzido por nossa equipe</p>

        {(!articles || articles.length === 0) ? (
          <div class="text-center py-12 text-gray-400">
            <i class="ph ph-file-text text-5xl block mb-4" aria-hidden="true" />
            <p>Nenhum artigo publicado ainda.</p>
          </div>
        ) : (
          <>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
              {articles.map((article: any) => (
                <a href={`${b}/artigos/${article.slug}`} class="group">
                  {article.cover_image_url ? (
                    <img src={article.cover_image_url} alt={article.title} class="w-full h-48 object-cover rounded-xl mb-4" />
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
                {page > 1 && <a href={`${b}/artigos?page=${page - 1}`} class="px-4 py-2 rounded-lg border border-gray-200 hover:border-primary">← Anterior</a>}
                <span class="px-4 py-2 text-gray-500">Página {page} de {totalPages}</span>
                {page < totalPages && <a href={`${b}/artigos?page=${page + 1}`} class="px-4 py-2 rounded-lg border border-gray-200 hover:border-primary">Próxima →</a>}
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
          <a href={`${b}/artigos`} class="text-primary hover:underline">← Voltar para artigos</a>
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

  return c.html(
    renderPublic(c, tenant, "artigos", (
      <article>
        {/* Hero */}
        {articleData.cover_image_url && (
          <div class="w-full h-64 md:h-96 bg-gray-100 overflow-hidden">
            <img src={articleData.cover_image_url} alt={articleData.title} class="w-full h-full object-cover" />
          </div>
        )}

        <div class="max-w-3xl mx-auto px-4 py-12">
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

          <div class="prose prose-lg max-w-none text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: articleData.content.replace(/\n/g, "<br />") }} />

          {/* CTA */}
          <div class="mt-12 p-6 bg-gray-50 rounded-xl text-center">
            <h3 class="text-lg font-semibold text-secondary mb-2">Gostou do conteudo?</h3>
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
    )),
  );
});

// =========================================================================
// GET /contato — Contact form
// =========================================================================
publicSiteRoutes.get("/contato", async (c) => {
  const tenant = getTenant(c);
  const b = getBasePath(c);
  const error = c.req.query("error");

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
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">Nome *</label>
                  <input type="text" name="name" required class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">E-mail *</label>
                  <input type="email" name="email" required class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">Telefone</label>
                  <input type="tel" name="phone" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
                </div>
                {areas && areas.length > 0 && (
                  <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Area de Interesse</label>
                    <select name="law_area_id" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary">
                      <option value="">Selecione...</option>
                      {areas.map((a: any) => (
                        <option value={a.law_areas.id}>{a.law_areas.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Assunto</label>
                <input type="text" name="subject" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Mensagem *</label>
                <textarea name="message" required rows={5} class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" />
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

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim() || null;
  const subject = String(body.subject ?? "").trim() || null;
  const message = String(body.message ?? "").trim();
  const lawAreaId = String(body.law_area_id ?? "").trim() || null;

  if (!name || !email || !message) {
    return c.redirect(`${b}/contato?error=${encodeURIComponent("Por favor, preencha todos os campos obrigatórios.")}`);
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
          Voltar ao Inicio
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

  if (!email) return c.redirect(`${b}/`);

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
        <h1 class="text-3xl font-serif font-bold text-secondary mb-3">Inscricao Confirmada!</h1>
        <p class="text-gray-500 mb-8">Obrigado! Voce recebera nossos conteudos no email {email}.</p>
        <a href={`${b}/`} class="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
          Voltar ao Inicio
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
          Nossos reconhecimentos e premiacoes sao reflexo do compromisso com a excelencia juridica.
        </p>

        {recognitions && recognitions.length > 0 ? (
          <div class="space-y-6">
            {recognitions.map((r: any) => (
              <div class="flex items-start gap-4 p-6 rounded-xl border border-gray-100 hover:shadow-md transition">
                <div class="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <i class={`${r.icon ?? "ph-trophy"} text-2xl text-primary`} aria-hidden="true" />
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
    .from("team_members")
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
                    <img src={m.public_photo_url} alt={m.public_name} class="w-full h-full object-cover" />
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
          <p class="text-center text-gray-400">Em breve conhecera nossa equipe.</p>
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
    .from("team_members")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!member) {
    return c.html(
      renderPublic(c, tenant, "equipe", (
        <div class="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 class="text-2xl font-serif font-bold text-secondary mb-4">Profissional nao encontrado</h1>
          <a href={`${b}/equipe`} class="text-primary hover:underline">← Ver toda a equipe</a>
        </div>
      )),
      404,
    );
  }

  return c.html(
    renderPublic(c, tenant, "equipe", (
      <div class="max-w-4xl mx-auto px-4 py-16">
        <a href={`${b}/equipe`} class="text-primary hover:underline text-sm mb-6 inline-block">← Voltar para a equipe</a>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Photo */}
          <div class="text-center">
            <div class="w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-gray-100 mb-4">
              {member.public_photo_url ? (
                <img src={member.public_photo_url} alt={member.public_name} class="w-full h-full object-cover" />
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
    )),
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
        <h1 class="text-3xl font-serif font-bold text-secondary mb-8">Politica de Privacidade</h1>
        <div class="prose prose-sm max-w-none text-gray-600 space-y-4">
          <p><strong>Ultima atualizacao:</strong> {new Date().toLocaleDateString("pt-BR")}</p>
          <p>{tenant.name} ("Escritório", "nos" ou "nosso") leva a privacidade dos dados pessoais a serio. Esta politica descreve como coletamos, usamos e protegemos as informacoes que você nos fornece.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">1. Dados Coletados</h2>
          <p>Coletamos os seguintes dados quando você interage com nosso site ou servi-os:</p>
          <ul class="list-disc pl-6 space-y-1">
            <li>Nome, email e telefone (formulario de contato)</li>
            <li>Informacoes de navegacao (cookies essenciais)</li>
            <li>Conteudo de mensagens enviadas via formulario</li>
          </ul>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">2. Uso dos Dados</h2>
          <p>Utilizamos seus dados para:</p>
          <ul class="list-disc pl-6 space-y-1">
            <li>Responder solicitacoes de contato e consultas</li>
            <li>Enviar conteudos informativos (mediante consentimento)</li>
            <li>Cumprir obrigacoes legais e regulatorias</li>
          </ul>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">3. Base Legal</h2>
          <p>O tratamento dos seus dados pessoais e fundamentado na Lei Geral de Protecao de Dados (LGPD - Lei 13.709/2018), com base no consentimento e na execucao de contratos.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">4. Seus Direitos</h2>
          <p>Voce tem direito a acessar, corrigir, excluir ou portar seus dados pessoais. Para exercer esses direitos, entre em contato pelo email {tenant.email_public ?? "nosso email de contato"}.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">5. Seguranca</h2>
          <p>Adotamos medidas tecnicas e organizacionais para proteger seus dados contra acessos nao autorizados, alteracao ou divulgacao indevida.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">6. Contato</h2>
          <p>Para questoes relacionadas a esta politica, entre em contato atraves da nossa <a href={`${b}/contato`} class="text-primary hover:underline">pagina de contato</a>.</p>
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
          <p><strong>Ultima atualizacao:</strong> {new Date().toLocaleDateString("pt-BR")}</p>
          <p>Ao acessar e utilizar o site de {tenant.name}, você concorda com os termos e condicoes descritos abaixo.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">1. Natureza do Servico</h2>
          <p>Este site tem carater informativo. As informacoes aqui apresentadas nao constituem aconselhamento juridico e nao substituem a consulta com um advogado.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">2. Uso Permitido</h2>
          <p>Voce concorda a utilizar o site de forma etica e legal, nao reproduzindo conteudo sem autorizacao expressa.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">3. Propriedade Intelectual</h2>
          <p>Todo o conteudo deste site (textos, imagens, logotipos, artigos) e protegido por direitos autorais e pertence a {tenant.name}, salvo quando indicado o contrario.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">4. Limitacao de Responsabilidade</h2>
          <p>{tenant.name} nao se responsabiliza por decisoes tomadas com base exclusivamente no conteudo deste site, sem a devida consulta profissional.</p>

          <h2 class="text-xl font-semibold text-secondary mt-6 mb-2">5. Alteracoes</h2>
          <p>Estes termos podem ser alterados a qualquer momento, sem aviso previo. Recomendamos a consulta periodica a esta pagina.</p>
        </div>
      </div>
    )),
  );
});
