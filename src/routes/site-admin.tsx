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

// =========================================================================
// GET /site/team — Manage team members shown on public site
// =========================================================================
siteAdminRoutes.get("/team", async (c) => {
  const user = c.get("user");

  const { data: members }: any = await supabase
    .from("team_members")
    .select("*")
    .eq("tenant_id", user.tenantId)
    .order("sort_order", { ascending: true });

  // Also fetch profiles for the "add from existing" dropdown
  const { data: profiles }: any = await supabase
    .from("profiles")
    .select("id, full_name, role, photo_url, oab_number")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("full_name");

  const rows = (members ?? []).map((m: any) => [
    <div class="flex items-center gap-2">
      {m.public_photo_url ? (
        <img src={m.public_photo_url} alt={m.public_name} class="h-8 w-8 rounded-full object-cover" />
      ) : (
        <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-semibold">
          {m.public_name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
      )}
      <span>{m.public_name}</span>
    </div> as unknown as string,
    m.public_title,
    m.slug,
    m.is_featured ? <Badge color="yellow">Destaque</Badge> : <Badge color="gray">Normal</Badge> as unknown as string,
    m.is_published ? <Badge color="green">Publicado</Badge> : <Badge color="gray">Oculto</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/site/team/${m.id}`} class="text-terracota-600 hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/site/team/${m.id}/delete`} class="inline" onsubmit="return confirm('Remover este membro do site?')">
        <button type="submit" class="text-status-red hover:underline text-body-sm">Remover</button>
      </form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Equipe do Site", active: "site" },
    <>
      <PageHeader
        title="Equipe do Site"
        icon="ph-users-three"
        actions={() => (
          <Modal
            id="newTeamMember"
            title="Adicionar Membro"
            icon="ph-user-plus"
            triggerText="Adicionar Membro"
            triggerIcon="ph-plus"
            action="/site/team"
            submitLabel="Adicionar"
            large
          >
            <Select label="Profissional cadastrado (opcional)" id="profile_id" name="profile_id"
              options={[{ value: "", label: "— Digitar manualmente —" }, ...(profiles ?? []).map((p: any) => ({ value: p.id, label: `${p.full_name} (${p.role})` }))]}
            />
            <TextField label="Nome publico" id="public_name" name="public_name" required placeholder="Dr. Joao Silva" />
            <TextField label="Cargo / Titulo" id="public_title" name="public_title" required placeholder="Socio Fundador" />
            <TextField label="Slug (URL)" id="slug" name="slug" required placeholder="joao-silva" />
            <TextField label="Foto (URL)" id="public_photo_url" name="public_photo_url" placeholder="https://..." />
            <TextField label="LinkedIn" id="public_linkedin" name="public_linkedin" placeholder="https://linkedin.com/in/..." />
            <TextField label="Email publico" id="public_email" name="public_email" placeholder="joao@escritorio.com" />
            <Textarea label="Biografia publica" id="public_bio" name="public_bio" placeholder="Breve biografia para o site..." />
            <Select label="Destacar na home?" id="is_featured" name="is_featured"
              options={[{ value: "false", label: "Nao" }, { value: "true", label: "Sim - mostrar na home" }]}
            />
          </Modal>
        )}
      />
      <Table
        columns={[{ label: "Nome" }, { label: "Cargo" }, { label: "Slug" }, { label: "Destaque" }, { label: "Status" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhum membro no site ainda. Adicione profissionais para exibi-los publicamente."
        emptyIcon="ph-users-three"
        ariaLabel="Lista de membros da equipe no site"
      />
    </>,
  );
});

// POST /site/team — create
siteAdminRoutes.post("/team", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();

  const profileId = (body.profile_id as string) || null;
  let photoUrl = (body.public_photo_url as string) || null;
  let publicName = (body.public_name as string) || "";
  let linkedin = (body.public_linkedin as string) || null;

  // If a profile was selected, prefill from it
  if (profileId) {
    const { data: profile }: any = await supabase
      .from("profiles")
      .select("full_name, photo_url, linkedin_url")
      .eq("id", profileId)
      .single();
    if (profile) {
      if (!publicName) publicName = profile.full_name;
      if (!photoUrl) photoUrl = profile.photo_url;
      if (!linkedin) linkedin = profile.linkedin_url;
    }
  }

  await supabase.from("team_members").insert({
    tenant_id: user.tenantId,
    profile_id: profileId,
    public_name: publicName,
    public_title: body.public_title as string,
    public_bio: (body.public_bio as string) || null,
    public_photo_url: photoUrl,
    public_linkedin: linkedin,
    public_email: (body.public_email as string) || null,
    slug: body.slug as string,
    is_featured: body.is_featured === "true",
    is_published: true,
  });

  return c.redirect("/site/team");
});

// GET /site/team/:id — edit
siteAdminRoutes.get("/team/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: member }: any = await supabase
    .from("team_members")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!member) return c.html("Membro nao encontrado.", 404);

  return renderPage(
    c,
    { title: member.public_name, active: "site" },
    <>
      <PageHeader title={member.public_name} icon="ph-user-circle" actions={() => (
        <div class="flex gap-2">
          <Modal
            id="editMember"
            title="Editar Membro"
            icon="ph-pencil"
            triggerText="Editar"
            triggerIcon="ph-pencil"
            triggerVariant="secondary"
            action={`/site/team/${member.id}`}
            submitLabel="Salvar"
            large
          >
            <TextField label="Nome publico" id="public_name" name="public_name" required value={member.public_name} />
            <TextField label="Cargo / Titulo" id="public_title" name="public_title" required value={member.public_title} />
            <TextField label="Slug (URL)" id="slug" name="slug" required value={member.slug} />
            <TextField label="Foto (URL)" id="public_photo_url" name="public_photo_url" value={member.public_photo_url ?? ""} />
            <TextField label="LinkedIn" id="public_linkedin" name="public_linkedin" value={member.public_linkedin ?? ""} />
            <TextField label="Email publico" id="public_email" name="public_email" value={member.public_email ?? ""} />
            <Textarea label="Biografia publica" id="public_bio" name="public_bio" value={member.public_bio ?? ""} />
            <TextField label="Ordem" id="sort_order" name="sort_order" type="number" value={String(member.sort_order)} />
            <Select label="Destacar na home?" id="is_featured" name="is_featured"
              options={[{ value: "false", label: "Nao" }, { value: "true", label: "Sim" }]}
              selected={member.is_featured ? "true" : "false"}
            />
            <Select label="Publicado?" id="is_published" name="is_published"
              options={[{ value: "true", label: "Publicado" }, { value: "false", label: "Oculto" }]}
              selected={member.is_published ? "true" : "false"}
            />
          </Modal>
          <form method="post" action={`/site/team/${member.id}/delete`}>
            <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Remover do site?')">
              <i class="ph ph-trash" aria-hidden="true"></i>Remover
            </button>
          </form>
        </div>
      )} />
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Perfil" icon="ph-user-circle">
          <div class="flex flex-col items-center gap-3">
            {member.public_photo_url ? (
              <img src={member.public_photo_url} alt={member.public_name} class="h-32 w-32 rounded-full object-cover border-4 border-gray-100" />
            ) : (
              <div class="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-h1 font-semibold">
                {member.public_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
            <div class="text-center">
              <h3 class="font-semibold text-gray-800">{member.public_name}</h3>
              <p class="text-body-sm text-gray-500">{member.public_title}</p>
              <div class="mt-2 flex gap-2 justify-center">
                {member.is_featured ? <Badge color="yellow">Destaque</Badge> : null}
                {member.is_published ? <Badge color="green">Publicado</Badge> : <Badge color="gray">Oculto</Badge>}
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Dados" icon="ph-identification-card">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Slug: </dt><dd class="inline">/equipe/{member.slug}</dd></div>
            {member.public_email && <div><dt class="font-semibold text-gray-700 inline">Email: </dt><dd class="inline">{member.public_email}</dd></div>}
            {member.public_linkedin && <div><dt class="font-semibold text-gray-700 inline">LinkedIn: </dt><dd class="inline"><a href={member.public_linkedin} target="_blank" rel="noopener" class="text-terracota-600 hover:underline">Ver</a></dd></div>}
            <div><dt class="font-semibold text-gray-700 inline">Ordem: </dt><dd class="inline">{member.sort_order}</dd></div>
          </dl>
        </Panel>
        {member.public_bio && (
          <Panel title="Biografia" icon="ph-text-aa">
            <p class="text-body-sm text-gray-600 whitespace-pre-wrap">{member.public_bio}</p>
          </Panel>
        )}
      </div>
    </>,
  );
});

// POST /site/team/:id — update
siteAdminRoutes.post("/team/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();

  await supabase
    .from("team_members")
    .update({
      public_name: body.public_name as string,
      public_title: body.public_title as string,
      slug: body.slug as string,
      public_photo_url: (body.public_photo_url as string) || null,
      public_linkedin: (body.public_linkedin as string) || null,
      public_email: (body.public_email as string) || null,
      public_bio: (body.public_bio as string) || null,
      sort_order: parseInt(body.sort_order as string) || 0,
      is_featured: body.is_featured === "true",
      is_published: body.is_published === "true",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/site/team/${id}`);
});

// POST /site/team/:id/delete
siteAdminRoutes.post("/team/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("team_members")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/site/team");
});

// =========================================================================
// GET /site/stats — Manage stats shown on public home
// =========================================================================
siteAdminRoutes.get("/stats", async (c) => {
  const user = c.get("user");

  const { data: stats }: any = await supabase
    .from("site_stats")
    .select("*")
    .eq("tenant_id", user.tenantId)
    .order("sort_order", { ascending: true });

  const rows = (stats ?? []).map((s: any) => [
    s.label,
    <span class="font-semibold">{s.prefix}{s.value}{s.suffix}</span> as unknown as string,
    s.icon ? <code class="text-body-sm text-gray-600">{s.icon}</code> : "—" as unknown as string,
    s.sort_order,
    s.is_published ? <Badge color="green">Publicado</Badge> : <Badge color="gray">Oculto</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/site/stats/${s.id}`} class="text-terracota-600 hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/site/stats/${s.id}/delete`} class="inline" onsubmit="return confirm('Excluir esta estatistica?')">
        <button type="submit" class="text-status-red hover:underline text-body-sm">Excluir</button>
      </form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Numeros do Escritorio", active: "site" },
    <>
      <PageHeader
        title="Numeros do Escritorio"
        icon="ph-chart-bar"
        actions={() => (
          <Modal
            id="newStat"
            title="Nova Estatistica"
            icon="ph-plus"
            triggerText="Adicionar"
            triggerIcon="ph-plus"
            action="/site/stats"
            submitLabel="Criar"
          >
            <TextField label="Label" id="label" name="label" required placeholder="anos de experiencia" />
            <TextField label="Valor" id="value" name="value" required placeholder="20" />
            <TextField label="Prefixo (opcional)" id="prefix" name="prefix" placeholder="+" />
            <TextField label="Sufixo (opcional)" id="suffix" name="suffix" placeholder="mil" />
            <TextField label="Icone Phosphor (opcional)" id="icon" name="icon" placeholder="ph-calendar-check" />
            <TextField label="Ordem" id="sort_order" name="sort_order" type="number" value="0" />
          </Modal>
        )}
      />
      <p class="text-body-sm text-gray-500 mb-4">Estes numeros aparecem em destaque na pagina inicial do site publico.</p>
      <Table
        columns={[{ label: "Label" }, { label: "Valor" }, { label: "Icone" }, { label: "Ordem" }, { label: "Status" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhuma estatistica cadastrada."
        emptyIcon="ph-chart-bar"
        ariaLabel="Lista de estatisticas"
      />
    </>,
  );
});

// POST /site/stats — create
siteAdminRoutes.post("/stats", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();

  await supabase.from("site_stats").insert({
    tenant_id: user.tenantId,
    label: body.label as string,
    value: body.value as string,
    prefix: (body.prefix as string) || "",
    suffix: (body.suffix as string) || "",
    icon: (body.icon as string) || null,
    sort_order: parseInt(body.sort_order as string) || 0,
    is_published: true,
  });

  return c.redirect("/site/stats");
});

// GET /site/stats/:id — edit
siteAdminRoutes.get("/stats/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: stat }: any = await supabase
    .from("site_stats")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!stat) return c.html("Estatistica nao encontrada.", 404);

  return renderPage(
    c,
    { title: stat.label, active: "site" },
    <>
      <PageHeader title={stat.label} icon="ph-chart-bar" actions={() => (
        <div class="flex gap-2">
          <Modal
            id="editStat"
            title="Editar Estatistica"
            icon="ph-pencil"
            triggerText="Editar"
            triggerIcon="ph-pencil"
            triggerVariant="secondary"
            action={`/site/stats/${stat.id}`}
            submitLabel="Salvar"
          >
            <TextField label="Label" id="label" name="label" required value={stat.label} />
            <TextField label="Valor" id="value" name="value" required value={stat.value} />
            <TextField label="Prefixo" id="prefix" name="prefix" value={stat.prefix ?? ""} />
            <TextField label="Sufixo" id="suffix" name="suffix" value={stat.suffix ?? ""} />
            <TextField label="Icone Phosphor" id="icon" name="icon" value={stat.icon ?? ""} />
            <TextField label="Ordem" id="sort_order" name="sort_order" type="number" value={String(stat.sort_order)} />
            <Select label="Publicado?" id="is_published" name="is_published"
              options={[{ value: "true", label: "Publicado" }, { value: "false", label: "Oculto" }]}
              selected={stat.is_published ? "true" : "false"}
            />
          </Modal>
          <form method="post" action={`/site/stats/${stat.id}/delete`}>
            <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir?')">
              <i class="ph ph-trash" aria-hidden="true"></i>Excluir
            </button>
          </form>
        </div>
      )} />
      <Panel title="Estatistica" icon="ph-chart-bar">
        <dl class="flex flex-col gap-2 text-body-sm">
          <div><dt class="font-semibold text-gray-700 inline">Label: </dt><dd class="inline">{stat.label}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Valor exibido: </dt><dd class="inline font-semibold text-h4 text-primary">{stat.prefix}{stat.value}{stat.suffix}</dd></div>
          {stat.icon && <div><dt class="font-semibold text-gray-700 inline">Icone: </dt><dd class="inline"><code>{stat.icon}</code></dd></div>}
          <div><dt class="font-semibold text-gray-700 inline">Ordem: </dt><dd class="inline">{stat.sort_order}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline">{stat.is_published ? "Publicado" : "Oculto"}</dd></div>
        </dl>
      </Panel>
    </>,
  );
});

// POST /site/stats/:id — update
siteAdminRoutes.post("/stats/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();

  await supabase
    .from("site_stats")
    .update({
      label: body.label as string,
      value: body.value as string,
      prefix: (body.prefix as string) || "",
      suffix: (body.suffix as string) || "",
      icon: (body.icon as string) || null,
      sort_order: parseInt(body.sort_order as string) || 0,
      is_published: body.is_published === "true",
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/site/stats/${id}`);
});

// POST /site/stats/:id/delete
siteAdminRoutes.post("/stats/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("site_stats")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/site/stats");
});

// =========================================================================
// TESTIMONIALS — Depoimentos
// =========================================================================
siteAdminRoutes.get("/testimonials", async (c) => {
  const user = c.get("user");
  const { data: items }: any = await supabase
    .from("testimonials")
    .select("*")
    .eq("tenant_id", user.tenantId)
    .order("sort_order", { ascending: true });

  const rows = (items ?? []).map((t: any) => [
    t.author_name,
    t.author_role ?? "—",
    <div class="flex items-center gap-1">{Array.from({ length: 5 }, (_, i) => <i class={`ph-bold ${i < (t.rating ?? 5) ? "ph-star text-yellow-500" : "ph-star text-gray-300"} text-sm`} aria-hidden="true" />)}</div> as unknown as string,
    t.source,
    t.is_published ? <Badge color="green">Publicado</Badge> : <Badge color="gray">Oculto</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/site/testimonials/${t.id}`} class="text-terracota-600 hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/site/testimonials/${t.id}/delete`} class="inline" onsubmit="return confirm('Excluir?')"><button type="submit" class="text-status-red hover:underline text-body-sm">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(c, { title: "Depoimentos", active: "site" }, <>
    <PageHeader title="Depoimentos" icon="ph-quotes" actions={() => (
      <Modal id="newTestimonial" title="Novo Depoimento" icon="ph-plus" triggerText="Adicionar" triggerIcon="ph-plus" action="/site/testimonials" submitLabel="Criar" large>
        <TextField label="Autor" id="author_name" name="author_name" required placeholder="Joao Silva" />
        <TextField label="Cargo / Empresa" id="author_role" name="author_role" placeholder="CEO, Empresa X" />
        <Textarea label="Depoimento" id="content" name="content" required placeholder="Excelente atendimento..." />
        <Select label="Avaliacao" id="rating" name="rating" options={[{value:"5",label:"5 estrelas"},{value:"4",label:"4"},{value:"3",label:"3"},{value:"2",label:"2"},{value:"1",label:"1"}]} />
        <Select label="Origem" id="source" name="source" options={[{value:"website",label:"Website"},{value:"google",label:"Google"},{value:"manual",label:"Manual"}]} />
      </Modal>
    )} />
    <Table columns={[{label:"Autor"},{label:"Cargo"},{label:"Avaliacao"},{label:"Origem"},{label:"Status"},{label:"Acoes"}]} rows={rows} emptyMsg="Nenhum depoimento." emptyIcon="ph-quotes" ariaLabel="Depoimentos" />
  </>);
});

siteAdminRoutes.post("/testimonials", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  await supabase.from("testimonials").insert({
    tenant_id: user.tenantId,
    author_name: body.author_name as string,
    author_role: (body.author_role as string) || null,
    content: body.content as string,
    rating: parseInt(body.rating as string) || 5,
    source: (body.source as string) || "website",
    is_published: true,
  });
  return c.redirect("/site/testimonials");
});

siteAdminRoutes.get("/testimonials/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { data: t }: any = await supabase.from("testimonials").select("*").eq("id", id).eq("tenant_id", user.tenantId).single();
  if (!t) return c.html("Nao encontrado.", 404);

  return renderPage(c, { title: t.author_name, active: "site" }, <>
    <PageHeader title={t.author_name} icon="ph-quotes" actions={() => (
      <div class="flex gap-2">
        <Modal id="editTestimonial" title="Editar Depoimento" icon="ph-pencil" triggerText="Editar" triggerIcon="ph-pencil" triggerVariant="secondary" action={`/site/testimonials/${t.id}`} submitLabel="Salvar" large>
          <TextField label="Autor" id="author_name" name="author_name" required value={t.author_name} />
          <TextField label="Cargo / Empresa" id="author_role" name="author_role" value={t.author_role ?? ""} />
          <Textarea label="Depoimento" id="content" name="content" required value={t.content} />
          <Select label="Avaliacao" id="rating" name="rating" options={[{value:"5",label:"5"},{value:"4",label:"4"},{value:"3",label:"3"},{value:"2",label:"2"},{value:"1",label:"1"}]} selected={String(t.rating ?? 5)} />
          <Select label="Origem" id="source" name="source" options={[{value:"website",label:"Website"},{value:"google",label:"Google"},{value:"manual",label:"Manual"}]} selected={t.source ?? "website"} />
          <Select label="Publicado?" id="is_published" name="is_published" options={[{value:"true",label:"Sim"},{value:"false",label:"Nao"}]} selected={t.is_published ? "true" : "false"} />
        </Modal>
        <form method="post" action={`/site/testimonials/${t.id}/delete`}><button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir?')"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button></form>
      </div>
    )} />
    <Panel title="Depoimento" icon="ph-quotes">
      <div class="flex items-center gap-1 mb-3">{Array.from({ length: 5 }, (_, i) => <i class={`ph-bold ${i < (t.rating ?? 5) ? "ph-star text-yellow-500" : "ph-star text-gray-300"} text-lg`} aria-hidden="true" />)}</div>
      <p class="text-gray-600 italic mb-4">"{t.content}"</p>
      <dl class="flex flex-col gap-1 text-body-sm">
        <div><dt class="font-semibold inline">Autor: </dt><dd class="inline">{t.author_name}</dd></div>
        {t.author_role && <div><dt class="font-semibold inline">Cargo: </dt><dd class="inline">{t.author_role}</dd></div>}
        <div><dt class="font-semibold inline">Origem: </dt><dd class="inline">{t.source}</dd></div>
        <div><dt class="font-semibold inline">Status: </dt><dd class="inline">{t.is_published ? "Publicado" : "Oculto"}</dd></div>
      </dl>
    </Panel>
  </>);
});

siteAdminRoutes.post("/testimonials/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  await supabase.from("testimonials").update({
    author_name: body.author_name as string,
    author_role: (body.author_role as string) || null,
    content: body.content as string,
    rating: parseInt(body.rating as string) || 5,
    source: (body.source as string) || "website",
    is_published: body.is_published === "true",
  }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect(`/site/testimonials/${id}`);
});

siteAdminRoutes.post("/testimonials/:id/delete", async (c) => {
  const user = c.get("user");
  await supabase.from("testimonials").delete().eq("id", c.req.param("id")).eq("tenant_id", user.tenantId);
  return c.redirect("/site/testimonials");
});

// =========================================================================
// CLIENT LOGOS — Clientes
// =========================================================================
siteAdminRoutes.get("/clients", async (c) => {
  const user = c.get("user");
  const { data: items }: any = await supabase.from("client_logos").select("*").eq("tenant_id", user.tenantId).order("sort_order", { ascending: true });

  const rows = (items ?? []).map((cl: any) => [
    cl.name,
    cl.logo_url ? <img src={cl.logo_url} alt={cl.name} class="h-8 w-auto max-w-32 object-contain" /> : "—" as unknown as string,
    cl.website_url ? <a href={cl.website_url} target="_blank" rel="noopener" class="text-terracota-600 hover:underline text-body-sm">Visitar</a> : "—" as unknown as string,
    cl.is_published ? <Badge color="green">Publicado</Badge> : <Badge color="gray">Oculto</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/site/clients/${cl.id}`} class="text-terracota-600 hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/site/clients/${cl.id}/delete`} class="inline" onsubmit="return confirm('Excluir?')"><button type="submit" class="text-status-red hover:underline text-body-sm">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(c, { title: "Clientes", active: "site" }, <>
    <PageHeader title="Clientes" icon="ph-handshake" actions={() => (
      <Modal id="newClient" title="Novo Cliente" icon="ph-plus" triggerText="Adicionar" triggerIcon="ph-plus" action="/site/clients" submitLabel="Criar">
        <TextField label="Nome" id="name" name="name" required placeholder="Empresa X" />
        <TextField label="Logo (URL)" id="logo_url" name="logo_url" placeholder="https://..." />
        <TextField label="Website" id="website_url" name="website_url" placeholder="https://..." />
      </Modal>
    )} />
    <Table columns={[{label:"Nome"},{label:"Logo"},{label:"Website"},{label:"Status"},{label:"Acoes"}]} rows={rows} emptyMsg="Nenhum cliente cadastrado." emptyIcon="ph-handshake" ariaLabel="Clientes" />
  </>);
});

siteAdminRoutes.post("/clients", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  await supabase.from("client_logos").insert({
    tenant_id: user.tenantId,
    name: body.name as string,
    logo_url: (body.logo_url as string) || null,
    website_url: (body.website_url as string) || null,
    is_published: true,
  });
  return c.redirect("/site/clients");
});

siteAdminRoutes.get("/clients/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { data: cl }: any = await supabase.from("client_logos").select("*").eq("id", id).eq("tenant_id", user.tenantId).single();
  if (!cl) return c.html("Nao encontrado.", 404);

  return renderPage(c, { title: cl.name, active: "site" }, <>
    <PageHeader title={cl.name} icon="ph-handshake" actions={() => (
      <div class="flex gap-2">
        <Modal id="editClient" title="Editar Cliente" icon="ph-pencil" triggerText="Editar" triggerIcon="ph-pencil" triggerVariant="secondary" action={`/site/clients/${cl.id}`} submitLabel="Salvar">
          <TextField label="Nome" id="name" name="name" required value={cl.name} />
          <TextField label="Logo (URL)" id="logo_url" name="logo_url" value={cl.logo_url ?? ""} />
          <TextField label="Website" id="website_url" name="website_url" value={cl.website_url ?? ""} />
          <TextField label="Ordem" id="sort_order" name="sort_order" type="number" value={String(cl.sort_order)} />
          <Select label="Publicado?" id="is_published" name="is_published" options={[{value:"true",label:"Sim"},{value:"false",label:"Nao"}]} selected={cl.is_published ? "true" : "false"} />
        </Modal>
        <form method="post" action={`/site/clients/${cl.id}/delete`}><button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir?')"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button></form>
      </div>
    )} />
    <Panel title="Cliente" icon="ph-handshake">
      {cl.logo_url && <img src={cl.logo_url} alt={cl.name} class="h-20 w-auto max-w-48 object-contain mb-4" />}
      <dl class="flex flex-col gap-1 text-body-sm">
        <div><dt class="font-semibold inline">Nome: </dt><dd class="inline">{cl.name}</dd></div>
        {cl.website_url && <div><dt class="font-semibold inline">Website: </dt><dd class="inline"><a href={cl.website_url} target="_blank" rel="noopener" class="text-terracota-600 hover:underline">{cl.website_url}</a></dd></div>}
        <div><dt class="font-semibold inline">Status: </dt><dd class="inline">{cl.is_published ? "Publicado" : "Oculto"}</dd></div>
      </dl>
    </Panel>
  </>);
});

siteAdminRoutes.post("/clients/:id", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  await supabase.from("client_logos").update({
    name: body.name as string,
    logo_url: (body.logo_url as string) || null,
    website_url: (body.website_url as string) || null,
    sort_order: parseInt(body.sort_order as string) || 0,
    is_published: body.is_published === "true",
  }).eq("id", c.req.param("id")).eq("tenant_id", user.tenantId);
  return c.redirect(`/site/clients/${c.req.param("id")}`);
});

siteAdminRoutes.post("/clients/:id/delete", async (c) => {
  const user = c.get("user");
  await supabase.from("client_logos").delete().eq("id", c.req.param("id")).eq("tenant_id", user.tenantId);
  return c.redirect("/site/clients");
});

// =========================================================================
// RECOGNITIONS — Reconhecimentos
// =========================================================================
siteAdminRoutes.get("/recognitions", async (c) => {
  const user = c.get("user");
  const { data: items }: any = await supabase.from("recognitions").select("*").eq("tenant_id", user.tenantId).order("year", { ascending: false });

  const rows = (items ?? []).map((r: any) => [
    r.title,
    r.organization ?? "—",
    r.year ? String(r.year) : "—",
    r.ranking_position ?? "—",
    r.is_published ? <Badge color="green">Publicado</Badge> : <Badge color="gray">Oculto</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/site/recognitions/${r.id}`} class="text-terracota-600 hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/site/recognitions/${r.id}/delete`} class="inline" onsubmit="return confirm('Excluir?')"><button type="submit" class="text-status-red hover:underline text-body-sm">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(c, { title: "Reconhecimentos", active: "site" }, <>
    <PageHeader title="Reconhecimentos" icon="ph-trophy" actions={() => (
      <Modal id="newRecognition" title="Novo Reconhecimento" icon="ph-plus" triggerText="Adicionar" triggerIcon="ph-plus" action="/site/recognitions" submitLabel="Criar" large>
        <TextField label="Titulo" id="title" name="title" required placeholder="Top 100 advogados" />
        <TextField label="Organizacao" id="organization" name="organization" placeholder="Analise Advocacia 500" />
        <TextField label="Ano" id="year" name="year" type="number" placeholder="2025" />
        <TextField label="Posicao / Ranking" id="ranking_position" name="ranking_position" placeholder="1o lugar" />
        <Textarea label="Descricao" id="description" name="description" placeholder="..." />
      </Modal>
    )} />
    <Table columns={[{label:"Titulo"},{label:"Organizacao"},{label:"Ano"},{label:"Posicao"},{label:"Status"},{label:"Acoes"}]} rows={rows} emptyMsg="Nenhum reconhecimento." emptyIcon="ph-trophy" ariaLabel="Reconhecimentos" />
  </>);
});

siteAdminRoutes.post("/recognitions", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  await supabase.from("recognitions").insert({
    tenant_id: user.tenantId,
    title: body.title as string,
    organization: (body.organization as string) || null,
    year: body.year ? parseInt(body.year as string) : null,
    ranking_position: (body.ranking_position as string) || null,
    description: (body.description as string) || null,
    is_published: true,
  });
  return c.redirect("/site/recognitions");
});

siteAdminRoutes.get("/recognitions/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { data: r }: any = await supabase.from("recognitions").select("*").eq("id", id).eq("tenant_id", user.tenantId).single();
  if (!r) return c.html("Nao encontrado.", 404);

  return renderPage(c, { title: r.title, active: "site" }, <>
    <PageHeader title={r.title} icon="ph-trophy" actions={() => (
      <div class="flex gap-2">
        <Modal id="editRecognition" title="Editar" icon="ph-pencil" triggerText="Editar" triggerIcon="ph-pencil" triggerVariant="secondary" action={`/site/recognitions/${r.id}`} submitLabel="Salvar" large>
          <TextField label="Titulo" id="title" name="title" required value={r.title} />
          <TextField label="Organizacao" id="organization" name="organization" value={r.organization ?? ""} />
          <TextField label="Ano" id="year" name="year" type="number" value={r.year ? String(r.year) : ""} />
          <TextField label="Posicao" id="ranking_position" name="ranking_position" value={r.ranking_position ?? ""} />
          <Textarea label="Descricao" id="description" name="description" value={r.description ?? ""} />
          <Select label="Publicado?" id="is_published" name="is_published" options={[{value:"true",label:"Sim"},{value:"false",label:"Nao"}]} selected={r.is_published ? "true" : "false"} />
        </Modal>
        <form method="post" action={`/site/recognitions/${r.id}/delete`}><button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir?')"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button></form>
      </div>
    )} />
    <Panel title="Reconhecimento" icon="ph-trophy">
      <dl class="flex flex-col gap-2 text-body-sm">
        <div><dt class="font-semibold inline">Titulo: </dt><dd class="inline">{r.title}</dd></div>
        {r.organization && <div><dt class="font-semibold inline">Organizacao: </dt><dd class="inline">{r.organization}</dd></div>}
        {r.year && <div><dt class="font-semibold inline">Ano: </dt><dd class="inline">{r.year}</dd></div>}
        {r.ranking_position && <div><dt class="font-semibold inline">Posicao: </dt><dd class="inline">{r.ranking_position}</dd></div>}
        {r.description && <div class="mt-2 pt-2 border-t border-gray-100"><p class="text-gray-600">{r.description}</p></div>}
      </dl>
    </Panel>
  </>);
});

siteAdminRoutes.post("/recognitions/:id", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  await supabase.from("recognitions").update({
    title: body.title as string,
    organization: (body.organization as string) || null,
    year: body.year ? parseInt(body.year as string) : null,
    ranking_position: (body.ranking_position as string) || null,
    description: (body.description as string) || null,
    is_published: body.is_published === "true",
  }).eq("id", c.req.param("id")).eq("tenant_id", user.tenantId);
  return c.redirect(`/site/recognitions/${c.req.param("id")}`);
});

siteAdminRoutes.post("/recognitions/:id/delete", async (c) => {
  const user = c.get("user");
  await supabase.from("recognitions").delete().eq("id", c.req.param("id")).eq("tenant_id", user.tenantId);
  return c.redirect("/site/recognitions");
});

// =========================================================================
// NEWSLETTER — Inscritos
// =========================================================================
siteAdminRoutes.get("/newsletter", async (c) => {
  const user = c.get("user");
  const { data: subs, count }: any = await supabase.from("newsletter_subscriptions")
    .select("*", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  const rows = (subs ?? []).map((s: any) => [
    s.email,
    s.name ?? "—",
    s.unsubscribed_at ? <Badge color="gray">Cancelado</Badge> : <Badge color="green">Ativo</Badge> as unknown as string,
    new Date(s.created_at).toLocaleDateString("pt-BR"),
  ]);

  return renderPage(c, { title: "Newsletter", active: "site" }, <>
    <PageHeader title="Newsletter" icon="ph-envelope-simple" />
    <p class="text-body-sm text-gray-500 mb-4">{count ?? 0} inscrito(s)</p>
    <Table columns={[{label:"Email"},{label:"Nome"},{label:"Status"},{label:"Inscrito em"}]} rows={rows} emptyMsg="Nenhuma inscricao." emptyIcon="ph-envelope-simple" ariaLabel="Newsletter" />
  </>);
});

// =========================================================================
// OFFICES — Multiplos escritorios
// =========================================================================
siteAdminRoutes.get("/offices", async (c) => {
  const user = c.get("user");
  const { data: items }: any = await supabase.from("offices").select("*").eq("tenant_id", user.tenantId).order("sort_order", { ascending: true });

  const rows = (items ?? []).map((o: any) => [
    o.label,
    o.city ? `${o.city}/${o.state ?? ""}` : "—",
    o.phone ?? "—",
    o.is_published ? <Badge color="green">Publicado</Badge> : <Badge color="gray">Oculto</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/site/offices/${o.id}`} class="text-terracota-600 hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/site/offices/${o.id}/delete`} class="inline" onsubmit="return confirm('Excluir?')"><button type="submit" class="text-status-red hover:underline text-body-sm">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(c, { title: "Escritorios", active: "site" }, <>
    <PageHeader title="Escritorios" icon="ph-buildings" actions={() => (
      <Modal id="newOffice" title="Novo Escritorio" icon="ph-plus" triggerText="Adicionar" triggerIcon="ph-plus" action="/site/offices" submitLabel="Criar" large>
        <TextField label="Nome / Label" id="label" name="label" required placeholder="Escritorio Sao Paulo" />
        <TextField label="Endereco" id="address" name="address" required placeholder="Av. Paulista, 1000" />
        <div class="grid grid-cols-2 gap-3">
          <TextField label="Cidade" id="city" name="city" placeholder="Sao Paulo" />
          <Select label="UF" id="state" name="state" options={["","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => ({value:uf,label:uf||"—"}))} />
        </div>
        <TextField label="CEP" id="zip" name="zip" placeholder="01310-100" />
        <TextField label="Telefone" id="phone" name="phone" placeholder="(11) 3000-0000" />
        <TextField label="Email" id="email" name="email" type="email" placeholder="sp@escritorio.com" />
      </Modal>
    )} />
    <Table columns={[{label:"Nome"},{label:"Cidade"},{label:"Telefone"},{label:"Status"},{label:"Acoes"}]} rows={rows} emptyMsg="Nenhum escritorio cadastrado." emptyIcon="ph-buildings" ariaLabel="Escritorios" />
  </>);
});

siteAdminRoutes.post("/offices", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  await supabase.from("offices").insert({
    tenant_id: user.tenantId,
    label: body.label as string,
    address: body.address as string,
    city: (body.city as string) || null,
    state: (body.state as string) || null,
    zip: (body.zip as string) || null,
    phone: (body.phone as string) || null,
    email: (body.email as string) || null,
    is_published: true,
  });
  return c.redirect("/site/offices");
});

siteAdminRoutes.get("/offices/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { data: o }: any = await supabase.from("offices").select("*").eq("id", id).eq("tenant_id", user.tenantId).single();
  if (!o) return c.html("Nao encontrado.", 404);

  return renderPage(c, { title: o.label, active: "site" }, <>
    <PageHeader title={o.label} icon="ph-buildings" actions={() => (
      <div class="flex gap-2">
        <Modal id="editOffice" title="Editar Escritorio" icon="ph-pencil" triggerText="Editar" triggerIcon="ph-pencil" triggerVariant="secondary" action={`/site/offices/${o.id}`} submitLabel="Salvar" large>
          <TextField label="Nome / Label" id="label" name="label" required value={o.label} />
          <TextField label="Endereco" id="address" name="address" required value={o.address} />
          <div class="grid grid-cols-2 gap-3">
            <TextField label="Cidade" id="city" name="city" value={o.city ?? ""} />
            <Select label="UF" id="state" name="state" options={["","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => ({value:uf,label:uf||"—"}))} selected={o.state ?? ""} />
          </div>
          <TextField label="CEP" id="zip" name="zip" value={o.zip ?? ""} />
          <TextField label="Telefone" id="phone" name="phone" value={o.phone ?? ""} />
          <TextField label="Email" id="email" name="email" type="email" value={o.email ?? ""} />
          <TextField label="Ordem" id="sort_order" name="sort_order" type="number" value={String(o.sort_order)} />
          <Select label="Publicado?" id="is_published" name="is_published" options={[{value:"true",label:"Sim"},{value:"false",label:"Nao"}]} selected={o.is_published ? "true" : "false"} />
        </Modal>
        <form method="post" action={`/site/offices/${o.id}/delete`}><button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir?')"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button></form>
      </div>
    )} />
    <Panel title="Escritorio" icon="ph-buildings">
      <dl class="flex flex-col gap-2 text-body-sm">
        <div><dt class="font-semibold inline">Nome: </dt><dd class="inline">{o.label}</dd></div>
        <div><dt class="font-semibold inline">Endereco: </dt><dd class="inline">{o.address}</dd></div>
        {o.city && <div><dt class="font-semibold inline">Cidade: </dt><dd class="inline">{o.city}/{o.state ?? ""}</dd></div>}
        {o.zip && <div><dt class="font-semibold inline">CEP: </dt><dd class="inline">{o.zip}</dd></div>}
        {o.phone && <div><dt class="font-semibold inline">Telefone: </dt><dd class="inline">{o.phone}</dd></div>}
        {o.email && <div><dt class="font-semibold inline">Email: </dt><dd class="inline">{o.email}</dd></div>}
      </dl>
    </Panel>
  </>);
});

siteAdminRoutes.post("/offices/:id", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  await supabase.from("offices").update({
    label: body.label as string,
    address: body.address as string,
    city: (body.city as string) || null,
    state: (body.state as string) || null,
    zip: (body.zip as string) || null,
    phone: (body.phone as string) || null,
    email: (body.email as string) || null,
    sort_order: parseInt(body.sort_order as string) || 0,
    is_published: body.is_published === "true",
  }).eq("id", c.req.param("id")).eq("tenant_id", user.tenantId);
  return c.redirect(`/site/offices/${c.req.param("id")}`);
});

siteAdminRoutes.post("/offices/:id/delete", async (c) => {
  const user = c.get("user");
  await supabase.from("offices").delete().eq("id", c.req.param("id")).eq("tenant_id", user.tenantId);
  return c.redirect("/site/offices");
});
