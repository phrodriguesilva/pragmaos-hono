// Site Publico admin routes — manage the tenant's public website.
// Routes: /site/appearance, /site/areas, /site/articles, /site/contacts, /site/settings

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireAuth } from "../lib/session";
import { supabase } from "../lib/supabase";
import { renderPage } from "../lib/render"; // render.tsx
import { PageHeader, Panel, TextField, Textarea, Select, Modal, Table, Badge } from "../components/ui";
import { log } from "../lib/logger";

export const siteAdminRoutes = new Hono<AppEnv>();

siteAdminRoutes.use("*", requireAuth);

// =========================================================================
// GET /site/appearance — Branding & appearance settings
// =========================================================================
siteAdminRoutes.get("/appearance", async (c) => {
  const user = c.get("user");

  const { data: tenant }: any = await supabase
    .from("tenants")
    .select(`
      id, name, slug, subdomain, custom_domain,
      logo_url, primary_color, secondary_color,
      tagline, description, founded_year, oab_number,
      address, phone, whatsapp, email_public,
      social_facebook, social_instagram, social_linkedin,
      site_published
    `)
    .eq("id", user.tenantId)
    .single();

  if (!tenant) {
    return c.html(<PageHeader title="Erro" icon="ph-warning" />);
  }

  const appDomain = "pragmaos-hono.vercel.app";
  const slug = tenant.subdomain ?? tenant.slug ?? "seu-escritorio";
  const baseUrl = tenant.custom_domain
    ? `https://${tenant.custom_domain}`
    : `https://${appDomain}/site/${slug}`;

  return renderPage(
    c,
    { title: "Aparencia do Site", active: "site-appearance" },
    <>
      <PageHeader title="Aparencia do Site" icon="ph-palette" actions={() => (
        <div class="flex gap-2">
          <a href={baseUrl} target="_blank" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-square-out" aria-hidden="true"></i>Ver Site
          </a>
        </div>
      )} />

      {/* Site status */}
      <div class={`mb-6 p-4 rounded-xl border ${tenant.site_published ? "bg-status-green-bg border-status-green" : "bg-gray-50 border-gray-200"}`}>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <i class={`ph ${tenant.site_published ? "ph-check-circle text-status-green" : "ph-clock text-gray-400"} text-h3`} aria-hidden="true"></i>
            <div>
              <div class="font-semibold text-gray-800">
                {tenant.site_published ? "Site Publicado" : "Site Rascunho (nao publicado)"}
              </div>
              <div class="text-body-xs text-gray-500">
                {tenant.site_published
                  ? `Seu site esta no ar em ${baseUrl}`
                  : "Publique seu site para que ele fique acessivel ao publico"}
              </div>
            </div>
          </div>
          <form method="post" action="/site/appearance/toggle-publish" class="inline">
            <button type="submit" class={`btn ${tenant.site_published ? "btn-secondary" : "btn-primary"}`}>
              {tenant.site_published ? "Despublicar" : "Publicar Site"}
            </button>
          </form>
        </div>
      </div>

      {/* Domain info */}
      <Panel title="Endereco do Site" icon="ph-globe-stand">
        <div class="space-y-3 text-body-sm">
          <div>
            <span class="text-gray-500">Subdominio:</span>{" "}
            <span class="font-mono font-semibold text-gray-800">{tenant.subdomain ?? tenant.slug ?? "(nao definido)"}</span>
            <span class="text-gray-400">/site/{tenant.subdomain ?? tenant.slug ?? "seu-escritorio"}</span>
          </div>
          {tenant.custom_domain && (
            <div>
              <span class="text-gray-500">Dominio customizado:</span>{" "}
              <span class="font-mono font-semibold text-gray-800">{tenant.custom_domain}</span>
            </div>
          )}
          <p class="text-body-xs text-gray-400">
            Para configurar um dominio customizado (ex: www.seuescritorio.com.br), entre em contato com o suporte.
          </p>
        </div>
      </Panel>

      {/* Branding form */}
      <form method="post" action="/site/appearance" class="space-y-6 mt-6">
        <Panel title="Identidade Visual" icon="ph-palette">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="Nome do Escritorio (exibido no site)" id="name" name="name" value={tenant.name} required />
            <TextField label="Slogan / Tagline" id="tagline" name="tagline" value={tenant.tagline ?? ""} placeholder="Ex: Advocacia especializada e personalizada" />
            <TextField label="Cor Primaria" id="primary_color" name="primary_color" type="color" value={tenant.primary_color ?? "#c8553d"} />
            <TextField label="Cor Secundaria" id="secondary_color" name="secondary_color" type="color" value={tenant.secondary_color ?? "#2b2925"} />
            <TextField label="URL do Logo" id="logo_url" name="logo_url" value={tenant.logo_url ?? ""} placeholder="https://..." icon="ph-image" />
          </div>
        </Panel>

        <Panel title="Descricao e Historia" icon="ph-text-aa">
          <Textarea label="Descricao (exibida na home e sobre)" id="description" name="description" rows={4} value={tenant.description ?? ""} placeholder="Breve descricao do escritorio e sua missao..." />
          <div class="mt-4">
            <TextField label="Ano de Fundacao" id="founded_year" name="founded_year" type="number" value={tenant.founded_year?.toString() ?? ""} placeholder="Ex: 2010" />
          </div>
          <div class="mt-4">
            <TextField label="Numero OAB" id="oab_number" name="oab_number" value={tenant.oab_number ?? ""} placeholder="Ex: SP 123456" />
          </div>
        </Panel>

        <Panel title="Contato Publico" icon="ph-phone">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="E-mail Publico" id="email_public" name="email_public" type="email" value={tenant.email_public ?? ""} placeholder="contato@escritorio.com.br" icon="ph-envelope" />
            <TextField label="Telefone" id="phone" name="phone" value={tenant.phone ?? ""} placeholder="(11) 3000-0000" icon="ph-phone" />
            <TextField label="WhatsApp" id="whatsapp" name="whatsapp" value={tenant.whatsapp ?? ""} placeholder="(11) 90000-0000" icon="ph-whatsapp-logo" />
            <TextField label="Endereco" id="address" name="address" value={tenant.address ?? ""} placeholder="Av. Paulista, 1000 - Sao Paulo/SP" icon="ph-map-pin" />
          </div>
        </Panel>

        <Panel title="Redes Sociais" icon="ph-at">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField label="Facebook" id="social_facebook" name="social_facebook" value={tenant.social_facebook ?? ""} placeholder="https://facebook.com/..." icon="ph-facebook-logo" />
            <TextField label="Instagram" id="social_instagram" name="social_instagram" value={tenant.social_instagram ?? ""} placeholder="https://instagram.com/..." icon="ph-instagram-logo" />
            <TextField label="LinkedIn" id="social_linkedin" name="social_linkedin" value={tenant.social_linkedin ?? ""} placeholder="https://linkedin.com/..." icon="ph-linkedin-logo" />
          </div>
        </Panel>

        <div class="flex justify-end">
          <button type="submit" class="btn btn-primary">Salvar Alteracoes</button>
        </div>
      </form>
    </>,
  );
});

// POST /site/appearance — Save branding
siteAdminRoutes.post("/appearance", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();

  const { error } = await supabase
    .from("tenants")
    .update({
      name: String(body.name ?? "").trim(),
      tagline: String(body.tagline ?? "").trim() || null,
      primary_color: String(body.primary_color ?? "#c8553d"),
      secondary_color: String(body.secondary_color ?? "#2b2925"),
      logo_url: String(body.logo_url ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
      founded_year: body.founded_year ? parseInt(String(body.founded_year), 10) : null,
      oab_number: String(body.oab_number ?? "").trim() || null,
      email_public: String(body.email_public ?? "").trim() || null,
      phone: String(body.phone ?? "").trim() || null,
      whatsapp: String(body.whatsapp ?? "").trim() || null,
      address: String(body.address ?? "").trim() || null,
      social_facebook: String(body.social_facebook ?? "").trim() || null,
      social_instagram: String(body.social_instagram ?? "").trim() || null,
      social_linkedin: String(body.social_linkedin ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.tenantId);

  if (error) {
    log.error("Failed to update site appearance", { error: error.message });
  }

  return c.redirect("/site/appearance");
});

// POST /site/appearance/toggle-publish — Toggle site published state
siteAdminRoutes.post("/appearance/toggle-publish", async (c) => {
  const user = c.get("user");

  const { data: tenant }: any = await supabase
    .from("tenants")
    .select("site_published")
    .eq("id", user.tenantId)
    .single();

  if (tenant) {
    await supabase
      .from("tenants")
      .update({ site_published: !tenant.site_published, updated_at: new Date().toISOString() })
      .eq("id", user.tenantId);
  }

  return c.redirect("/site/appearance");
});

// =========================================================================
// GET /site/areas — Manage law areas
// =========================================================================
siteAdminRoutes.get("/areas", async (c) => {
  const user = c.get("user");

  // Fetch all law areas (catalog)
  const { data: allAreas }: any = await supabase
    .from("law_areas")
    .select("id, name, slug, icon")
    .order("name", { ascending: true });

  // Fetch tenant's selected areas
  const { data: tenantAreas }: any = await supabase
    .from("tenant_law_areas")
    .select(`
      id, description, sort_order,
      law_areas (id, name, slug, icon)
    `)
    .eq("tenant_id", user.tenantId)
    .order("sort_order", { ascending: true });

  const selectedIds = new Set((tenantAreas ?? []).map((ta: any) => ta.law_areas.id));

  return renderPage(
    c,
    { title: "Areas de Atuacao", active: "site-areas" },
    <>
      <PageHeader title="Areas de Atuacao" icon="ph-scales" />

      {/* Selected areas */}
      <Panel title="Areas Selecionadas" icon="ph-check-circle">
        {(!tenantAreas || tenantAreas.length === 0) ? (
          <p class="text-gray-400 text-center py-6">Nenhuma area selecionada. Selecione areas abaixo.</p>
        ) : (
          <div class="space-y-3">
            {tenantAreas.map((ta: any) => (
              <div key={ta.id} class="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                <i class={`ph ${ta.law_areas.icon ?? "ph-scales"} text-h4 text-terracota-600`} aria-hidden="true"></i>
                <div class="flex-1">
                  <div class="font-semibold text-gray-800">{ta.law_areas.name}</div>
                  {ta.description && <div class="text-body-xs text-gray-500 mt-0.5">{ta.description}</div>}
                </div>
                <a href={`/site/areas/${ta.id}`} class="btn btn-secondary text-body-xs">Editar</a>
                <form method="post" action={`/site/areas/${ta.id}/delete`} class="inline" onsubmit="return confirm('Remover esta area?')">
                  <button type="submit" class="btn btn-secondary text-body-xs text-status-red">Remover</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Available areas to add */}
      <div class="mt-6">
        <Panel title="Adicionar Area" icon="ph-plus-circle">
          {(allAreas ?? []).filter((a: any) => !selectedIds.has(a.id)).length === 0 ? (
            <p class="text-gray-400 text-center py-4">Todas as areas disponiveis ja foram selecionadas.</p>
          ) : (
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(allAreas ?? []).filter((a: any) => !selectedIds.has(a.id)).map((a: any) => (
                <form key={a.id} method="post" action="/site/areas/add" class="inline">
                  <input type="hidden" name="law_area_id" value={a.id} />
                  <button type="submit" class="w-full flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:border-terracota-300 hover:bg-terracota-50 transition text-left">
                    <i class={`ph ${a.icon ?? "ph-scales"} text-h5 text-gray-500`} aria-hidden="true"></i>
                    <span class="text-body-sm font-medium text-gray-700">{a.name}</span>
                    <i class="ph ph-plus text-body-xs text-terracota-600 ml-auto" aria-hidden="true"></i>
                  </button>
                </form>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>,
  );
});

// POST /site/areas/add — Add a law area to tenant
siteAdminRoutes.post("/areas/add", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const lawAreaId = String(body.law_area_id ?? "");

  // Get max sort_order
  const { data: existing }: any = await supabase
    .from("tenant_law_areas")
    .select("sort_order")
    .eq("tenant_id", user.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  await supabase
    .from("tenant_law_areas")
    .insert({
      tenant_id: user.tenantId,
      law_area_id: lawAreaId,
      sort_order: nextOrder,
    });

  return c.redirect("/site/areas");
});

// GET /site/areas/:id — Edit tenant law area description
siteAdminRoutes.get("/areas/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: ta }: any = await supabase
    .from("tenant_law_areas")
    .select(`id, description, sort_order, law_areas (name, slug, icon)`)
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!ta) return c.redirect("/site/areas");

  return renderPage(
    c,
    { title: "Editar Area", active: "site-areas" },
    <>
      <PageHeader title={`Editar: ${ta.law_areas.name}`} icon="ph-scales" />
      <form method="post" action={`/site/areas/${id}`} class="space-y-6 max-w-2xl">
        <Panel>
          <Textarea
            label="Descricao (exibida na pagina da area no site publico)"
            id="description"
            name="description"
            rows={6}
            value={ta.description ?? ""}
            placeholder={`Descreva como o escritorio atua em ${ta.law_areas.name}...`}
          />
          <div class="mt-4">
            <TextField label="Ordem de exibicao" id="sort_order" name="sort_order" type="number" value={String(ta.sort_order)} />
          </div>
        </Panel>
        <div class="flex gap-3">
          <button type="submit" class="btn btn-primary">Salvar</button>
          <a href="/site/areas" class="btn btn-secondary">Cancelar</a>
        </div>
      </form>
    </>,
  );
});

// POST /site/areas/:id — Update tenant law area
siteAdminRoutes.post("/areas/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();

  await supabase
    .from("tenant_law_areas")
    .update({
      description: String(body.description ?? "").trim() || null,
      sort_order: parseInt(String(body.sort_order ?? "0"), 10),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/site/areas");
});

// POST /site/areas/:id/delete — Remove law area from tenant
siteAdminRoutes.post("/areas/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("tenant_law_areas")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/site/areas");
});

// =========================================================================
// GET /site/articles — List articles
// =========================================================================
siteAdminRoutes.get("/articles", async (c) => {
  const user = c.get("user");

  const { data: articles }: any = await supabase
    .from("articles")
    .select(`
      id, title, slug, status, published_at, excerpt,
      law_areas (name),
      profiles (full_name)
    `)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  const rows = (articles ?? []).map((a: any) => ({
    cells: [
      a.title,
      a.law_areas?.name ?? "—",
      a.profiles?.full_name ?? "—",
      a.status === "published"
        ? (<Badge color="green" icon="ph-check-circle">Publicado</Badge> as unknown as string)
        : (<Badge color="gray" icon="ph-pencil">Rascunho</Badge> as unknown as string),
      a.published_at ? new Date(a.published_at).toLocaleDateString("pt-BR") : "—",
    ],
    actions: [
      { label: "Editar", href: `/site/articles/${a.id}/edit`, icon: "ph-pencil" },
      { label: "Excluir", href: `/site/articles/${a.id}/delete`, icon: "ph-trash", danger: true },
    ],
  }));

  return renderPage(
    c,
    { title: "Artigos", active: "site-articles" },
    <>
      <PageHeader title="Artigos" icon="ph-file-text" actions={() => (
        <a href="/site/articles/new" class="btn btn-primary inline-flex items-center gap-1">
          <i class="ph ph-plus" aria-hidden="true"></i>Novo Artigo
        </a>
      )} />

      <Table
        columns={[
          { label: "Titulo", icon: "ph-text-aa" },
          { label: "Area", icon: "ph-scales" },
          { label: "Autor", icon: "ph-user" },
          { label: "Status", icon: "ph-circle-half" },
          { label: "Publicado em", icon: "ph-calendar" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhum artigo criado ainda."
        emptyIcon="ph-file-text"
      />
    </>,
  );
});

// GET /site/articles/new — New article form
siteAdminRoutes.get("/articles/new", async (c) => {
  const user = c.get("user");

  const { data: areas } = await supabase
    .from("tenant_law_areas")
    .select(`law_areas (id, name)`)
    .eq("tenant_id", user.tenantId)
    .order("sort_order", { ascending: true });

  return renderPage(
    c,
    { title: "Novo Artigo", active: "site-articles" },
    <>
      <PageHeader title="Novo Artigo" icon="ph-file-text" />
      <form method="post" action="/site/articles" class="space-y-6 max-w-3xl">
        <Panel>
          <TextField label="Titulo" id="title" name="title" required placeholder="Titulo do artigo" />
          <div class="mt-4">
            <TextField label="Resumo (excerpt)" id="excerpt" name="excerpt" placeholder="Breve resumo exibido nas listagens" />
          </div>
          <div class="mt-4 grid grid-cols-2 gap-4">
            <Select label="Area do Direito" id="law_area_id" name="law_area_id" options={[
              { value: "", label: "Nenhuma" },
              ...(areas ?? []).map((a: any) => ({ value: a.law_areas.id, label: a.law_areas.name })),
            ]} />
            <Select label="Status" id="status" name="status" options={[
              { value: "draft", label: "Rascunho" },
              { value: "published", label: "Publicar agora" },
            ]} />
          </div>
          <div class="mt-4">
            <TextField label="URL da Imagem de Capa" id="cover_image_url" name="cover_image_url" placeholder="https://..." icon="ph-image" />
          </div>
          <div class="mt-4">
            <TextField label="Meta Description (SEO)" id="meta_description" name="meta_description" placeholder="Descricao para motores de busca (max 160 chars)" />
          </div>
        </Panel>

        <Panel title="Conteudo" icon="ph-text-aa">
          <Textarea label="Conteudo do Artigo" id="content" name="content" rows={16} required placeholder="Escreva o conteudo do artigo aqui..." />
          <p class="text-body-xs text-gray-400 mt-2">Dica: Use paragrafos separados por linha em branco. HTML basico e suportado.</p>
        </Panel>

        <div class="flex gap-3">
          <button type="submit" class="btn btn-primary">Criar Artigo</button>
          <a href="/site/articles" class="btn btn-secondary">Cancelar</a>
        </div>
      </form>
    </>,
  );
});

// POST /site/articles — Create article
siteAdminRoutes.post("/articles", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();

  const title = String(body.title ?? "").trim();
  if (!title) return c.redirect("/site/articles/new");

  // Generate slug from title
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const status = String(body.status ?? "draft");
  const content = String(body.content ?? "").trim();
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  await supabase
    .from("articles")
    .insert({
      tenant_id: user.tenantId,
      title,
      slug,
      excerpt: String(body.excerpt ?? "").trim() || null,
      content,
      cover_image_url: String(body.cover_image_url ?? "").trim() || null,
      author_id: user.id,
      law_area_id: String(body.law_area_id ?? "").trim() || null,
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      reading_time_min: readingTime,
      meta_description: String(body.meta_description ?? "").trim() || null,
    });

  return c.redirect("/site/articles");
});

// GET /site/articles/:id/edit — Edit article
siteAdminRoutes.get("/articles/:id/edit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: article }: any = await supabase
    .from("articles")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!article) return c.redirect("/site/articles");

  const { data: areas } = await supabase
    .from("tenant_law_areas")
    .select(`law_areas (id, name)`)
    .eq("tenant_id", user.tenantId)
    .order("sort_order", { ascending: true });

  return renderPage(
    c,
    { title: "Editar Artigo", active: "site-articles" },
    <>
      <PageHeader title="Editar Artigo" icon="ph-file-text" />
      <form method="post" action={`/site/articles/${id}/edit`} class="space-y-6 max-w-3xl">
        <Panel>
          <TextField label="Titulo" id="title" name="title" value={article.title} required />
          <div class="mt-4">
            <TextField label="Resumo (excerpt)" id="excerpt" name="excerpt" value={article.excerpt ?? ""} />
          </div>
          <div class="mt-4 grid grid-cols-2 gap-4">
            <Select label="Area do Direito" id="law_area_id" name="law_area_id" selected={article.law_area_id ?? ""} options={[
              { value: "", label: "Nenhuma" },
              ...(areas ?? []).map((a: any) => ({ value: a.law_areas.id, label: a.law_areas.name })),
            ]} />
            <Select label="Status" id="status" name="status" selected={article.status} options={[
              { value: "draft", label: "Rascunho" },
              { value: "published", label: "Publicado" },
            ]} />
          </div>
          <div class="mt-4">
            <TextField label="URL da Imagem de Capa" id="cover_image_url" name="cover_image_url" value={article.cover_image_url ?? ""} icon="ph-image" />
          </div>
          <div class="mt-4">
            <TextField label="Meta Description (SEO)" id="meta_description" name="meta_description" value={article.meta_description ?? ""} />
          </div>
        </Panel>

        <Panel title="Conteudo" icon="ph-text-aa">
          <Textarea label="Conteudo" id="content" name="content" rows={16} required value={article.content} />
        </Panel>

        <div class="flex gap-3">
          <button type="submit" class="btn btn-primary">Salvar Alteracoes</button>
          <a href="/site/articles" class="btn btn-secondary">Cancelar</a>
        </div>
      </form>
    </>,
  );
});

// POST /site/articles/:id/edit — Update article
siteAdminRoutes.post("/articles/:id/edit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();

  const title = String(body.title ?? "").trim();
  const status = String(body.status ?? "draft");
  const content = String(body.content ?? "").trim();
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  // If publishing for the first time, set published_at
  const update: any = {
    title,
    excerpt: String(body.excerpt ?? "").trim() || null,
    content,
    cover_image_url: String(body.cover_image_url ?? "").trim() || null,
    law_area_id: String(body.law_area_id ?? "").trim() || null,
    status,
    reading_time_min: readingTime,
    meta_description: String(body.meta_description ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (status === "published") {
    const { data: existing }: any = await supabase
      .from("articles")
      .select("published_at, status")
      .eq("id", id)
      .single();
    if (!existing?.published_at) {
      update.published_at = new Date().toISOString();
    }
  }

  await supabase
    .from("articles")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/site/articles");
});

// POST /site/articles/:id/delete — Delete article
siteAdminRoutes.post("/articles/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("articles")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/site/articles");
});

// =========================================================================
// GET /site/contacts — List contact submissions
// =========================================================================
siteAdminRoutes.get("/contacts", async (c) => {
  const user = c.get("user");

  const { data: contacts }: any = await supabase
    .from("contact_submissions")
    .select(`
      id, name, email, phone, subject, message, status, created_at,
      law_areas (name),
      lead_id
    `)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (contacts ?? []).map((cs: any) => ({
    cells: [
      cs.name,
      cs.email,
      cs.phone ?? "—",
      cs.subject ?? "—",
      cs.status === "new" ? (<Badge color="blue" icon="ph-circle">Novo</Badge> as unknown as string)
        : cs.status === "contacted" ? (<Badge color="yellow" icon="ph-phone">Contatado</Badge> as unknown as string)
        : cs.status === "converted" ? (<Badge color="green" icon="ph-check-circle">Convertido</Badge> as unknown as string)
        : (<Badge color="gray" icon="ph-archive">Arquivado</Badge> as unknown as string),
      new Date(cs.created_at).toLocaleDateString("pt-BR"),
    ],
    actions: [
      { label: "Ver", href: `/site/contacts/${cs.id}`, icon: "ph-eye" },
    ],
  }));

  return renderPage(
    c,
    { title: "Contatos Recebidos", active: "site-contacts" },
    <>
      <PageHeader title="Contatos Recebidos" icon="ph-tray" />

      <Table
        columns={[
          { label: "Nome", icon: "ph-user" },
          { label: "E-mail", icon: "ph-envelope" },
          { label: "Telefone", icon: "ph-phone" },
          { label: "Assunto", icon: "ph-text-aa" },
          { label: "Status", icon: "ph-circle-half" },
          { label: "Recebido em", icon: "ph-calendar" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhum contato recebido ainda."
        emptyIcon="ph-tray"
      />
    </>,
  );
});

// GET /site/contacts/:id — View contact submission
siteAdminRoutes.get("/contacts/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: contact }: any = await supabase
    .from("contact_submissions")
    .select(`
      *, law_areas (name)
    `)
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!contact) return c.redirect("/site/contacts");

  return renderPage(
    c,
    { title: "Contato", active: "site-contacts" },
    <>
      <PageHeader title="Detalhes do Contato" icon="ph-tray" actions={() => (
        <a href="/site/contacts" class="btn btn-secondary">Voltar</a>
      )} />

      <Panel>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-body-xs text-gray-400">Nome</div>
              <div class="font-semibold text-gray-800">{contact.name}</div>
            </div>
            <div>
              <div class="text-body-xs text-gray-400">E-mail</div>
              <a href={`mailto:${contact.email}`} class="font-semibold text-terracota-600">{contact.email}</a>
            </div>
            {contact.phone && (
              <div>
                <div class="text-body-xs text-gray-400">Telefone</div>
                <div class="font-semibold text-gray-800">{contact.phone}</div>
              </div>
            )}
            {contact.law_areas?.name && (
              <div>
                <div class="text-body-xs text-gray-400">Area de Interesse</div>
                <div class="font-semibold text-gray-800">{contact.law_areas.name}</div>
              </div>
            )}
          </div>

          {contact.subject && (
            <div>
              <div class="text-body-xs text-gray-400">Assunto</div>
              <div class="font-semibold text-gray-800">{contact.subject}</div>
            </div>
          )}

          <div>
            <div class="text-body-xs text-gray-400">Mensagem</div>
            <div class="text-gray-700 whitespace-pre-wrap p-3 bg-gray-50 rounded-lg">{contact.message}</div>
          </div>

          <div class="flex items-center gap-3 pt-4 border-t border-gray-100">
            <div>
              <div class="text-body-xs text-gray-400">Status</div>
              <div class="font-semibold text-gray-800">{contact.status}</div>
            </div>
            {contact.lead_id && (
              <div>
                <div class="text-body-xs text-gray-400">Lead criado</div>
                <a href={`/leads`} class="font-semibold text-terracota-600">Ver no CRM →</a>
              </div>
            )}
          </div>

          {/* Status update */}
          <form method="post" action={`/site/contacts/${id}/status`} class="flex gap-2 pt-4">
            <select name="status" class="px-3 py-2 border border-gray-200 rounded-lg text-body-sm">
              <option value="new" selected={contact.status === "new"}>Novo</option>
              <option value="contacted" selected={contact.status === "contacted"}>Contatado</option>
              <option value="converted" selected={contact.status === "converted"}>Convertido</option>
              <option value="archived" selected={contact.status === "archived"}>Arquivado</option>
            </select>
            <button type="submit" class="btn btn-primary text-body-sm">Atualizar Status</button>
          </form>
        </div>
      </Panel>
    </>,
  );
});

// POST /site/contacts/:id/status — Update contact status
siteAdminRoutes.post("/contacts/:id/status", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();

  await supabase
    .from("contact_submissions")
    .update({ status: String(body.status ?? "new") })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/site/contacts/${id}`);
});

// =========================================================================
// GET /site/settings — Site settings (subdomain, custom domain)
// =========================================================================
siteAdminRoutes.get("/settings", async (c) => {
  const user = c.get("user");

  const { data: tenant }: any = await supabase
    .from("tenants")
    .select("id, slug, subdomain, custom_domain, site_published")
    .eq("id", user.tenantId)
    .single();

  if (!tenant) return c.redirect("/site/appearance");

  return renderPage(
    c,
    { title: "Configuracoes do Site", active: "site-settings" },
    <>
      <PageHeader title="Configuracoes do Site" icon="ph-gear" />

      <form method="post" action="/site/settings" class="space-y-6 max-w-2xl">
        <Panel title="Endereco do Site" icon="ph-globe-stand">
          <div class="space-y-4">
            <div>
              <label class="block text-body-sm font-semibold text-gray-700 mb-1">Subdominio</label>
              <div class="flex items-center">
                <input
                  type="text"
                  name="subdomain"
                  value={tenant.subdomain ?? tenant.slug ?? ""}
                  placeholder="seu-escritorio"
                  class="flex-1 px-4 py-2.5 border border-gray-200 rounded-l-lg focus:ring-2 focus:ring-terracota-500 focus:border-terracota-500"
                />
                <span class="px-4 py-2.5 bg-gray-100 border border-l-0 border-gray-200 rounded-r-lg text-gray-500 text-body-sm">.pragmaos-hono.vercel.app/site/...</span>
              </div>
              <p class="text-body-xs text-gray-400 mt-1">Seu site sera acessivel em <strong>pragmaos-hono.vercel.app/site/{tenant.subdomain ?? tenant.slug ?? "seu-escritorio"}</strong></p>
            </div>

            <div>
              <label class="block text-body-sm font-semibold text-gray-700 mb-1">Dominio Customizado (opcional)</label>
              <input
                type="text"
                name="custom_domain"
                value={tenant.custom_domain ?? ""}
                placeholder="www.seuescritorio.com.br"
                class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-terracota-500 focus:border-terracota-500"
              />
              <p class="text-body-xs text-gray-400 mt-1">
                Para usar um dominio proprio, aponte o DNS para <code class="bg-gray-100 px-1 rounded">cname.vercel-dns.com</code> e informe o dominio acima.
              </p>
            </div>
          </div>
        </Panel>

        <div class="flex justify-end">
          <button type="submit" class="btn btn-primary">Salvar Configuracoes</button>
        </div>
      </form>
    </>,
  );
});

// POST /site/settings — Save settings
siteAdminRoutes.post("/settings", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();

  const subdomain = String(body.subdomain ?? "").trim().toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "") || null;

  const customDomain = String(body.custom_domain ?? "").trim() || null;

  // Check if subdomain is unique (if changed)
  if (subdomain) {
    const { data: existing }: any = await supabase
      .from("tenants")
      .select("id")
      .eq("subdomain", subdomain)
      .neq("id", user.tenantId)
      .maybeSingle();

    if (existing) {
      log.warn("Subdomain already taken", { subdomain });
      return c.redirect("/site/settings");
    }
  }

  // Check if custom domain is unique (if set)
  if (customDomain) {
    const { data: existing }: any = await supabase
      .from("tenants")
      .select("id")
      .eq("custom_domain", customDomain)
      .neq("id", user.tenantId)
      .maybeSingle();

    if (existing) {
      log.warn("Custom domain already taken", { customDomain });
      return c.redirect("/site/settings");
    }
  }

  await supabase
    .from("tenants")
    .update({
      subdomain,
      custom_domain: customDomain,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.tenantId);

  return c.redirect("/site/settings");
});
