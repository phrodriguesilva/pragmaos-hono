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
                Areas de Atuacao
              </a>
            </div>
          </div>
        </section>

        {/* Law areas preview */}
        {areas && areas.length > 0 && (
          <section class="py-16 px-4 max-w-6xl mx-auto">
            <h2 class="text-3xl font-serif font-bold text-center text-secondary mb-2">Areas de Atuacao</h2>
            <p class="text-center text-gray-500 mb-10">Como podemos ajudar voce</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              {areas.map((a: any) => (
                <a href={`${b}/areas/${a.law_areas.slug}`} class="block p-6 rounded-xl border border-gray-100 hover:border-primary hover:shadow-lg transition group">
                  <div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition">
                    <i class={`ph ${a.law_areas.icon ?? "ph-scales"} text-2xl text-primary group-hover:text-white`} aria-hidden="true" />
                  </div>
                  <h3 class="text-lg font-semibold text-secondary mb-2">{a.law_areas.name}</h3>
                  {a.description && <p class="text-sm text-gray-500 line-clamp-3">{a.description}</p>}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* About preview */}
        {tenant.founded_year && (
          <section class="bg-gray-50 py-16 px-4">
            <div class="max-w-4xl mx-auto text-center">
              <h2 class="text-3xl font-serif font-bold text-secondary mb-4">Sobre o Escritorio</h2>
              <p class="text-gray-600 max-w-2xl mx-auto">
                {tenant.name} atua desde {tenant.founded_year} oferecendo solucoes juridicas
                personalizadas e estrategicas para nossos clientes.
              </p>
              <a href={`${b}/sobre`} class="inline-block mt-6 text-primary font-semibold hover:underline">
                Conheca nossa historia →
              </a>
            </div>
          </section>
        )}

        {/* Latest articles */}
        {articles && articles.length > 0 && (
          <section class="py-16 px-4 max-w-6xl mx-auto">
            <h2 class="text-3xl font-serif font-bold text-center text-secondary mb-10">Ultimos Artigos</h2>
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

        {/* CTA */}
        <section class="bg-primary py-16 px-4">
          <div class="max-w-2xl mx-auto text-center text-white">
            <h2 class="text-3xl font-serif font-bold mb-4">Precisa de ajuda juridica?</h2>
            <p class="text-white/90 mb-6">Entre em contato e descubra como podemos ajudar voce.</p>
            <a href={`${b}/contato`} class="inline-block bg-white text-primary px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition">
              Agendar Consulta
            </a>
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
              <div class="text-sm text-gray-500">Anos de experiencia</div>
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
              <div class="text-3xl font-bold text-primary">✓</div>
              <div class="text-sm text-gray-500">Atendimento online</div>
            </div>
          )}
        </div>

        {areas && areas.length > 0 && (
          <div class="mt-10">
            <h2 class="text-2xl font-serif font-bold text-secondary mb-6">Nossas Areas de Atuacao</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {areas.map((a: any) => (
                <a href={`${b}/areas/${a.law_areas.slug}`} class="flex items-center gap-3 p-4 rounded-lg border border-gray-100 hover:border-primary transition">
                  <i class={`ph ${a.law_areas.icon ?? "ph-scales"} text-2xl text-primary`} aria-hidden="true" />
                  <span class="font-medium text-secondary">{a.law_areas.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {tenant.address && (
          <div class="mt-10 p-6 bg-gray-50 rounded-xl">
            <h3 class="font-semibold text-secondary mb-2">Endereco</h3>
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
        <h1 class="text-4xl font-serif font-bold text-secondary mb-2 text-center">Areas de Atuacao</h1>
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
                  <i class={`ph ${a.law_areas.icon ?? "ph-scales"} text-3xl text-primary group-hover:text-white`} aria-hidden="true" />
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
          <h1 class="text-2xl font-bold text-gray-400 mb-4">Area nao encontrada</h1>
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
              <i class={`ph ${areaData.law_areas.icon ?? "ph-scales"} text-3xl text-white`} aria-hidden="true" />
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div class="flex justify-center gap-2 mt-12">
                {page > 1 && <a href={`/artigos?page=${page - 1}`} class="px-4 py-2 rounded-lg border border-gray-200 hover:border-primary">← Anterior</a>}
                <span class="px-4 py-2 text-gray-500">Pagina {page} de {totalPages}</span>
                {page < totalPages && <a href={`/artigos?page=${page + 1}`} class="px-4 py-2 rounded-lg border border-gray-200 hover:border-primary">Proxima →</a>}
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
          <h1 class="text-2xl font-bold text-gray-400 mb-4">Artigo nao encontrado</h1>
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

  const { data: areas }: any = await supabase
    .from("tenant_law_areas")
    .select("law_areas (id, name)")
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true });

  return c.html(
    renderPublic(c, tenant, "contato", (
      <div class="max-w-4xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-secondary mb-2 text-center">Entre em Contato</h1>
        <p class="text-center text-gray-500 mb-12">Estamos aqui para ajudar voce</p>

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
                  <h3 class="font-semibold text-secondary text-sm">Endereco</h3>
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
    return c.html(
      renderPublic(c, tenant, "contato", (
        <div class="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 class="text-2xl font-bold text-status-red mb-4">Dados incompletos</h1>
          <p class="text-gray-500 mb-6">Por favor, preencha todos os campos obrigatórios.</p>
          <a href={`${b}/contato`} class="text-primary hover:underline">← Voltar</a>
        </div>
      )),
    );
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
        <p class="text-gray-500 mb-8">Obrigado pelo contato, {name.split(" ")[0]}. Retornaremos o mais breve possivel.</p>
        <a href={`${b}/`} class="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
          Voltar ao Inicio
        </a>
      </div>
    )),
  );
});
