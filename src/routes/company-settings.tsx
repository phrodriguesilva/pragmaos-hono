// Company settings — operational/fiscal data for the firm itself.
// Distinct from site-admin (which controls the public website) and
// from tenant_settings (which stores app preferences like locale/timezone).
// This page manages: CNPJ, OAB, address, contact, fiscal data, bank accounts.

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, TextField, Textarea, Badge } from "../components/ui";

export const companySettingsRoutes = new Hono<AppEnv>();

companySettingsRoutes.use("*", requireAuth);
companySettingsRoutes.use("*", requireRole("socio", "admin"));

const settingsSchema = z.object({
  name: z.string().min(2, "Nome obrigatorio"),
  cnpj: z.string().optional(),
  oab_number: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email_public: z.string().optional(),
  founded_year: z.coerce.number().int().min(1900).max(2099).optional(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  subdomain: z.string().optional(),
});

// ============================================================
// GET /configuracoes-empresa — settings form
// ============================================================
companySettingsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, cnpj, oab_number, address, phone, whatsapp, email_public, founded_year, tagline, description, primary_color, secondary_color, subdomain, custom_domain, site_published")
    .eq("id", user.tenantId)
    .single();

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("settings")
    .eq("tenant_id", user.tenantId)
    .maybeSingle();

  const prefs = settings?.settings as Record<string, unknown> ?? {};

  return renderPage(
    c,
    { title: "Configuracoes da Empresa", active: "settings" },
    <>
      <PageHeader title="Configuracoes da Empresa" icon="ph-gear" />

      <form method="post" action="/configuracoes-empresa" class="flex flex-col gap-6">
        {/* Dados fiscais */}
        <Panel title="Dados fiscais e juridicos" icon="ph-buildings">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="Nome do escritorio" id="name" name="name" required value={tenant?.name ?? ""} />
            <TextField label="CNPJ" id="cnpj" name="cnpj" placeholder="00.000.000/0000-00" value={tenant?.cnpj ?? ""} />
            <TextField label="Registro OAB" id="oab_number" name="oab_number" placeholder="123456/SP" value={tenant?.oab_number ?? ""} />
            <TextField label="Ano de fundacao" id="founded_year" name="founded_year" type="number" value={tenant?.founded_year ? String(tenant.founded_year) : ""} />
          </div>
        </Panel>

        {/* Contato */}
        <Panel title="Contato" icon="ph-phone">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="Telefone" id="phone" name="phone" placeholder="(11) 3000-0000" value={tenant?.phone ?? ""} />
            <TextField label="WhatsApp" id="whatsapp" name="whatsapp" placeholder="(11) 99999-9999" value={tenant?.whatsapp ?? ""} />
            <TextField label="E-mail publico" id="email_public" name="email_public" type="email" placeholder="contato@escritorio.com" value={tenant?.email_public ?? ""} />
            <TextField label="Endereco" id="address" name="address" placeholder="Av. Paulista, 1000 - SP" value={tenant?.address ?? ""} />
          </div>
        </Panel>

        {/* Identidade */}
        <Panel title="Identidade e marca" icon="ph-palette">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="Slogan / Tagline" id="tagline" name="tagline" placeholder="Advocacia estrategica" value={tenant?.tagline ?? ""} />
            <div class="flex flex-col gap-1">
              <label for="description" class="text-body-sm font-semibold text-gray-700">Descricao curta</label>
              <textarea id="description" name="description" rows={2} class="input" placeholder="Em 1-2 frases">{tenant?.description ?? ""}</textarea>
            </div>
            <div>
              <label for="primary_color" class="text-body-sm font-semibold text-gray-700 mb-1 block">Cor primaria</label>
              <div class="flex items-center gap-2">
                <input id="primary_color" name="primary_color" type="color" value={tenant?.primary_color ?? "#05111e"} class="w-12 h-10 rounded cursor-pointer border border-gray-200" />
                <span class="text-body-sm text-gray-500">{tenant?.primary_color ?? "#05111e"}</span>
              </div>
            </div>
            <div>
              <label for="secondary_color" class="text-body-sm font-semibold text-gray-700 mb-1 block">Cor secundaria</label>
              <div class="flex items-center gap-2">
                <input id="secondary_color" name="secondary_color" type="color" value={tenant?.secondary_color ?? "#1a2634"} class="w-12 h-10 rounded cursor-pointer border border-gray-200" />
                <span class="text-body-sm text-gray-500">{tenant?.secondary_color ?? "#1a2634"}</span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Site publico */}
        <Panel title="Site publico" icon="ph-globe">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="subdomain" class="text-body-sm font-semibold text-gray-700 mb-1 block">Subdominio</label>
              <div class="flex items-center gap-1">
                <input id="subdomain" name="subdomain" type="text" value={tenant?.subdomain ?? ""} class="input flex-1" placeholder="meu-escritorio" />
                <span class="text-body-sm text-gray-400">.pragmaos.app</span>
              </div>
            </div>
            <div>
              <label class="text-body-sm font-semibold text-gray-700 mb-1 block">Dominio proprio</label>
              <input type="text" value={tenant?.custom_domain ?? ""} disabled class="input flex-1 opacity-60" placeholder="www.meu-escritorio.com.br" />
              <p class="text-body-xs text-gray-400 mt-1">Para configurar dominio proprio, entre em contato.</p>
            </div>
          </div>
          <div class="mt-4 flex items-center gap-3">
            <span class="text-body-sm text-gray-600">Status do site:</span>
            {tenant?.site_published ? <Badge color="green">Publicado</Badge> : <Badge color="gray">Nao publicado</Badge>}
            <a href="/site/settings" class="text-body-sm text-terracota-600 hover:underline ml-2">Gerenciar site</a>
          </div>
        </Panel>

        {/* Preferencias do sistema */}
        <Panel title="Preferencias do sistema" icon="ph-gear-six">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="timezone" class="text-body-sm font-semibold text-gray-700 mb-1 block">Fuso horario</label>
              <select id="timezone" name="timezone" class="input" disabled>
                <option selected={prefs.timezone === "America/Sao_Paulo"}>America/Sao_Paulo</option>
              </select>
            </div>
            <div>
              <label for="currency" class="text-body-sm font-semibold text-gray-700 mb-1 block">Moeda</label>
              <select id="currency" name="currency" class="input" disabled>
                <option selected={prefs.currency === "BRL"}>BRL (R$)</option>
              </select>
            </div>
          </div>
          <p class="text-body-xs text-gray-400 mt-2">Preferencias avancadas podem ser editadas nas configuracoes de cada modulo.</p>
        </Panel>

        <div class="flex justify-end">
          <button type="submit" class="btn btn-primary flex items-center gap-2">
            <i class="ph-bold ph-floppy-disk" aria-hidden="true" />
            Salvar configuracoes
          </button>
        </div>
      </form>
    </>,
  );
});

// ============================================================
// POST /configuracoes-empresa — save
// ============================================================
companySettingsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.redirect("/configuracoes-empresa");
  }

  // Check subdomain uniqueness if changed
  let subdomain = parsed.data.subdomain?.trim().toLowerCase() || null;
  if (subdomain) {
    subdomain = subdomain.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("subdomain", subdomain)
      .neq("id", user.tenantId)
      .maybeSingle();
    if (existing) {
      subdomain = `${subdomain}-${Date.now().toString(36)}`;
    }
  }

  await supabase
    .from("tenants")
    .update({
      name: parsed.data.name,
      cnpj: parsed.data.cnpj || null,
      oab_number: parsed.data.oab_number || null,
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
      whatsapp: parsed.data.whatsapp || null,
      email_public: parsed.data.email_public || null,
      founded_year: parsed.data.founded_year ?? null,
      tagline: parsed.data.tagline || null,
      description: parsed.data.description || null,
      primary_color: parsed.data.primary_color || "#05111e",
      secondary_color: parsed.data.secondary_color || "#1a2634",
      subdomain,
    })
    .eq("id", user.tenantId);

  return c.redirect("/configuracoes-empresa?success=1");
});
