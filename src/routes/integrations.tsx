import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import type { FC } from "hono/jsx";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge, Modal } from "../components/ui";
import { CONFIG_FIELDS, syncIntegration, type ConfigField } from "../lib/integrations";

export const integrationsRoutes = new Hono<AppEnv>();

integrationsRoutes.use("*", requireAuth);

const integrationSchema = z.object({
  type: z.enum([
    "pje", "google", "microsoft",
    "clicksign", "docusign", "whatsapp", "govbr",
    "digesto",
  ]),
  name: z.string().min(1, "Nome e obrigatorio"),
  active: z.string().optional(),
});

const TYPE_LABELS: Record<string, string> = {
  pje: "PJe",
  google: "Google Workspace",
  microsoft: "Microsoft 365",
  clicksign: "Clicksign",
  docusign: "DocuSign",
  whatsapp: "WhatsApp Business",
  govbr: "Gov.br",
  digesto: "Digesto",
};

const TYPE_ICONS: Record<string, string> = {
  pje: "ph-folder-open",
  google: "ph-google-logo",
  microsoft: "ph-microsoft-outlook-logo",
  clicksign: "ph-pen-nib",
  docusign: "ph-pen-nib",
  whatsapp: "ph-whatsapp-logo",
  govbr: "ph-shield-check",
  digesto: "ph-newspaper-clipping",
};

const TYPE_IMAGES: Record<string, string> = {
  pje: "/static/img/integrations/logo-pje.png",
  google: "/static/img/integrations/google-workspace.png",
  microsoft: "/static/img/integrations/microsoft-365.png",
  clicksign: "/static/img/integrations/clicksign.png",
  docusign: "/static/img/integrations/docusign.webp",
  whatsapp: "/static/img/integrations/whatsapp-business.png",
  govbr: "/static/img/integrations/gov-br.webp",
  digesto: "/static/img/integrations/digesto.png",
};

// SaaS-managed features (not configurable by the user, included in all plans).
const INCLUDED_FEATURES: { type: string; label: string; image: string; description: string }[] = [
  { type: "cnj", label: "CNJ DataJud", image: "/static/img/integrations/cnj-datajud.png", description: "Consulta e importacao de processos do DataJud. Incluso em todos os planos." },
  { type: "querido_diario", label: "Querido Diario", image: "/static/img/integrations/diario-oficial.png", description: "Busca em diarios oficiais municipais (gratuito). Incluso em todos os planos." },
];

const TYPE_CATEGORIES: Record<string, "tribunal" | "assinatura" | "comunicacao" | "email" | "identidade" | "diario"> = {
  pje: "tribunal",
  clicksign: "assinatura",
  docusign: "assinatura",
  whatsapp: "comunicacao",
  google: "email",
  microsoft: "email",
  govbr: "identidade",
  digesto: "diario",
};

const CATEGORY_LABELS: Record<string, string> = {
  tribunal: "Tribunais e Processos",
  assinatura: "Assinatura Digital",
  comunicacao: "Comunicacao",
  email: "E-mail",
  identidade: "Identidade",
  diario: "Diario Oficial",
};

const CATEGORY_ORDER = ["tribunal", "assinatura", "comunicacao", "email", "identidade", "diario"];

// Integrations that require OAuth (can't sync with just config fields).
const OAUTH_TYPES = new Set(["google", "microsoft", "docusign", "govbr"]);
// Integrations that require special access (convenio, certificate).
const RESTRICTED_TYPES = new Set(["pje"]);

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Render a config field as a form input.
const RenderConfigField: FC<{ field: ConfigField; existingValue?: unknown }> = ({ field, existingValue }) => {
  const value = (typeof existingValue === "string" ? existingValue : (field.default ?? "")) as string;

  switch (field.type) {
    case "select":
      return (
        <Select
          label={field.label}
          id={field.key}
          name={field.key}
          required={field.required}
          selected={value}
          options={field.options ?? []}
        />
      );
    case "textarea":
      return (
        <Textarea label={field.label} id={field.key} name={field.key} rows={4}>
          {value}
        </Textarea>
      );
    case "checkbox":
      return (
        <div class="flex items-center gap-2">
          <input type="checkbox" id={field.key} name={field.key} value="true" checked={value === "true"} />
          <label for={field.key} class="text-body-sm font-semibold text-gray-700">{field.label}</label>
        </div>
      );
    case "password":
      return (
        <TextField
          label={field.label}
          id={field.key}
          name={field.key}
          type="password"
          required={field.required}
          placeholder={field.placeholder}
          icon="ph-key"
        />
      );
    default:
      return (
        <TextField
          label={field.label}
          id={field.key}
          name={field.key}
          type="text"
          required={field.required}
          placeholder={field.placeholder}
          value={value}
        />
      );
  }
};

// Render all config fields for a given integration type.
const RenderConfigFields: FC<{ type: string; existingConfig?: Record<string, unknown> }> = ({ type, existingConfig }) => {
  const fields = CONFIG_FIELDS[type] ?? [];
  return (
    <>
      {fields.map((field) => {
        const existing = existingConfig?.[field.key];
        // Don't pre-fill password fields from DB for security.
        const val = field.type === "password" ? "" : existing;
        return (
          <div key={field.key}>
            <RenderConfigField field={field} existingValue={val} />
            {field.help ? <p class="text-body-xs text-gray-500 mt-1 mb-2">{field.help}</p> : null}
          </div>
        );
      })}
    </>
  );
};

// GET /integrations -- list integrations.
integrationsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const search = c.req.query("search")?.trim() ?? "";

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let query = supabase
    .from("integrations")
    .select("id, name, type, active, last_sync_at, created_at", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = query.ilike("name", `%${search}%`);

  const { data: integrations, count } = await query;

  const totalPages = count ? Math.ceil(count / limit) : 1;

  const rows = (integrations ?? []).map((int) => [
    <a href={`/integrations/${int.id}`} class="text-[#0568ff] hover:underline">{int.name}</a> as unknown as string,
    TYPE_LABELS[int.type] ?? int.type,
    <Badge color={int.active ? "green" : "gray"}>{int.active ? "Ativo" : "Inativo"}</Badge> as unknown as string,
    formatDate(int.last_sync_at),
    <div class="flex items-center gap-2">
      <a href={`/integrations/${int.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <a href={`/integrations/${int.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/integrations/${int.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  // Available integration types grouped by category.
  const configuredTypes = new Set((integrations ?? []).map((i) => i.type));
  const allTypes = Object.keys(TYPE_LABELS);

  return renderPage(
    c,
    { title: "Integracoes", active: "integrations" },
    <>
      <PageHeader
        title="Integracoes"
        icon="ph-plugs-connected"
        actions={() => (
          <Modal
            id="new-integration"
            title="Nova Integracao"
            icon="ph-plugs-connected"
            triggerText="Nova Integracao"
            triggerIcon="ph-plus"
            action="/integrations"
            submitLabel="Salvar"
            large
          >
            <Select label="Tipo" id="type" name="type" required
              options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <TextField label="Nome" id="name" name="name" required placeholder="Ex: Clicksign Producao" icon="ph-tag" />
            <div id="config-fields-placeholder" />
            <div class="flex items-center gap-2">
              <input type="checkbox" id="active" name="active" value="true" checked />
              <label for="active" class="text-body-sm font-semibold text-gray-700">Ativar integracao</label>
            </div>
            <script dangerouslySetInnerHTML={{ __html: `
              (function() {
                var sel = document.getElementById('type');
                var holder = document.getElementById('config-fields-placeholder');
                var fields = ${JSON.stringify(
                  Object.fromEntries(
                    Object.entries(CONFIG_FIELDS).map(([type, fields]) => [
                      type,
                      fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, placeholder: f.placeholder, help: f.help, options: f.options, default: f.default })),
                    ]),
                  ),
                )};
                function esc(s) {
                  if (!s) return '';
                  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
                }
                function renderFields() {
                  var t = sel.value;
                  var fs = fields[t] || [];
                  var html = '';
                  for (var i = 0; i < fs.length; i++) {
                    var f = fs[i];
                    var req = f.required ? ' *' : '';
                    var lbl = esc(f.label) + req;
                    var help = f.help ? '<p class="text-body-xs text-gray-500 mt-1 mb-2">' + esc(f.help) + '</p>' : '';
                    var ph = esc(f.placeholder || '');
                    if (f.type === 'select') {
                      html += '<div class="form-group"><label class="form-label" for="' + esc(f.key) + '">' + lbl + '</label><select id="' + esc(f.key) + '" name="' + esc(f.key) + '" class="input">';
                      var opts = f.options || [];
                      for (var j = 0; j < opts.length; j++) {
                        html += '<option value="' + esc(opts[j].value) + '"' + (opts[j].value === f.default ? ' selected' : '') + '>' + esc(opts[j].label) + '</option>';
                      }
                      html += '</select></div>' + help;
                    } else if (f.type === 'textarea') {
                      html += '<div class="form-group"><label class="form-label" for="' + esc(f.key) + '">' + lbl + '</label><textarea id="' + esc(f.key) + '" name="' + esc(f.key) + '" rows="4" class="input" placeholder="' + ph + '">' + esc(f.default || '') + '</textarea></div>' + help;
                    } else if (f.type === 'password') {
                      html += '<div class="form-group"><label class="form-label" for="' + esc(f.key) + '">' + lbl + '</label><input type="password" id="' + esc(f.key) + '" name="' + esc(f.key) + '" class="input" placeholder="' + ph + '" /></div>' + help;
                    } else if (f.type === 'checkbox') {
                      html += '<div class="flex items-center gap-2"><input type="checkbox" id="' + esc(f.key) + '" name="' + esc(f.key) + '" value="true"' + (f.default === 'true' ? ' checked' : '') + ' /><label class="text-body-sm font-semibold text-gray-700" for="' + esc(f.key) + '">' + lbl + '</label></div>' + help;
                    } else {
                      html += '<div class="form-group"><label class="form-label" for="' + esc(f.key) + '">' + lbl + '</label><input type="text" id="' + esc(f.key) + '" name="' + esc(f.key) + '" class="input" value="' + esc(f.default || '') + '" placeholder="' + ph + '" /></div>' + help;
                    }
                  }
                  holder.innerHTML = html;
                }
                sel.addEventListener('change', renderFields);
                renderFields();
              })();
            `}} />
          </Modal>
        )}
      />
      {/* Available integrations grouped by category */}
      {CATEGORY_ORDER.map((category) => {
        const typesInCategory = allTypes.filter((t) => TYPE_CATEGORIES[t] === category);
        if (typesInCategory.length === 0) return null;
        return (
          <div class="mb-6">
            <h3 class="text-body-sm font-bold text-gray-700 uppercase tracking-wide mb-3">{CATEGORY_LABELS[category]}</h3>
            <div class="grid grid-cols-3 gap-4">
              {typesInCategory.map((type) => (
                <Panel>
                  <div class="flex flex-col gap-3">
                    {/* Capa com imagem */}
                    <div class="flex items-center justify-center h-16 bg-gray-50 rounded">
                      <img src={TYPE_IMAGES[type] ?? ""} alt={TYPE_LABELS[type]} class="max-h-12 max-w-full object-contain" />
                    </div>
                    {/* Info + status */}
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="font-semibold text-gray-800 text-body-sm">{TYPE_LABELS[type]}</div>
                        {OAUTH_TYPES.has(type) ? (
                          <div class="text-body-xs text-status-yellow">Requer OAuth</div>
                        ) : RESTRICTED_TYPES.has(type) ? (
                          <div class="text-body-xs text-status-red">Requer convenio</div>
                        ) : (
                          <div class="text-body-xs text-gray-500">API Key</div>
                        )}
                      </div>
                      {configuredTypes.has(type) ? (
                        <Badge color="green" icon="ph-check">Configurado</Badge>
                      ) : (
                        <Badge color="gray">Disponivel</Badge>
                      )}
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          </div>
        );
      })}
      {/* Recursos inclusos do PragmaOS -- SaaS-managed, no user configuration needed */}
      <div class="mb-6">
        <h3 class="text-body-sm font-bold text-gray-700 uppercase tracking-wide mb-1">Recursos Inclusos do PragmaOS</h3>
        <p class="text-body-xs text-gray-500 mb-3">Ja disponiveis em todos os planos. Nao requer configuracao.</p>
        <div class="grid grid-cols-3 gap-4">
          {INCLUDED_FEATURES.map((feat) => (
            <Panel>
              <div class="flex flex-col gap-3">
                <div class="flex items-center justify-center h-16 bg-gray-50 rounded">
                  <img src={feat.image} alt={feat.label} class="max-h-12 max-w-full object-contain" />
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-semibold text-gray-800 text-body-sm">{feat.label}</div>
                    <div class="text-body-xs text-gray-500">{feat.description}</div>
                  </div>
                  <Badge color="green" icon="ph-check">Incluso</Badge>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </div>
      <form method="get" action="/integrations" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Nome da integracao..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Nome" },
          { label: "Tipo" },
          { label: "Status" },
          { label: "Ultima sincronizacao" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma integracao configurada."
        emptyIcon="ph-plugs-connected"
        ariaLabel="Lista de integracoes"
        count={count ?? 0}
        countLabel="integracao(oes)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/integrations",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST /integrations -- create.
integrationsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = integrationSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect("/integrations");
  }

  // Build config from type-specific fields.
  const fields = CONFIG_FIELDS[parsed.data.type] ?? [];
  const config: Record<string, unknown> = {};
  for (const field of fields) {
    const val = (body as Record<string, string>)[field.key];
    if (val !== undefined && val !== "") {
      config[field.key] = val;
    }
  }

  const { error } = await supabase.from("integrations").insert({
    tenant_id: user.tenantId,
    type: parsed.data.type,
    name: parsed.data.name,
    config,
    active: parsed.data.active === "true",
  });

  if (error) {
    return c.redirect("/integrations");
  }

  return c.redirect("/integrations");
});

// GET /integrations/:id -- detail.
integrationsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: int } = await supabase
    .from("integrations")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!int) return c.html("Integracao nao encontrada.", 404);

  // Read sync result from query params (set by POST /:id/sync redirect).
  const syncStatus = c.req.query("sync");
  const syncMsg = c.req.query("msg");

  const config = (int.config ?? {}) as Record<string, unknown>;
  const configDisplay = JSON.stringify(config, null, 2);
  const fields = CONFIG_FIELDS[int.type] ?? [];

  // Mask password fields in display.
  const maskedConfig: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    const field = fields.find((f) => f.key === k);
    if (field?.type === "password") {
      maskedConfig[k] = v ? "*** (configurado)" : "";
    } else {
      maskedConfig[k] = v;
    }
  }
  const maskedDisplay = JSON.stringify(maskedConfig, null, 2);

  return renderPage(
    c,
    { title: int.name, active: "integrations" },
    <>
      {/* Capa da integracao */}
      {TYPE_IMAGES[int.type] ? (
        <div class="mb-4 flex items-center justify-center h-24 bg-gray-50 rounded border border-gray-200">
          <img src={TYPE_IMAGES[int.type]} alt={TYPE_LABELS[int.type] ?? int.name} class="max-h-16 max-w-full object-contain" />
        </div>
      ) : null}
      {syncStatus ? (
        <div class={`mb-4 p-3 border border-gray-200 flex items-start gap-2 ${syncStatus === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"}`}>
          <i class={`ph ${syncStatus === "ok" ? "ph-check-circle" : "ph-warning-circle"} text-h4`} aria-hidden="true"></i>
          <div>
            <div class="font-semibold text-body-sm">{syncStatus === "ok" ? "Conexao testada com sucesso" : "Falha na conexao"}</div>
            <div class="text-body-sm">{syncMsg}</div>
          </div>
        </div>
      ) : null}
      <PageHeader
        title={int.name}
        icon="ph-plugs-connected"
        actions={() => (
          <div class="flex gap-2">
            <Modal
              id="edit-integration"
              title={`Editar ${int.name}`}
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/integrations/${id}`}
              submitLabel="Salvar"
              large
            >
              <Select label="Tipo" id="type" name="type" required selected={int.type}
                options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <TextField label="Nome" id="name" name="name" required value={int.name} icon="ph-tag" />
              {fields.map((field) => {
                const existing = config[field.key];
                const val = field.type === "password" ? "" : existing;
                return (
                  <div key={field.key}>
                    <RenderConfigField field={field} existingValue={val} />
                    {field.help ? <p class="text-body-xs text-gray-500 mt-1 mb-2">{field.help}</p> : null}
                  </div>
                );
              })}
              <div class="flex items-center gap-2">
                <input type="checkbox" id="active" name="active" value="true" checked={int.active} />
                <label for="active" class="text-body-sm font-semibold text-gray-700">Ativar integracao</label>
              </div>
            </Modal>
            <form method="post" action={`/integrations/${id}/toggle`}>
              <button type="submit" class={`btn ${int.active ? "btn-danger" : "btn-primary"} inline-flex items-center gap-1`}>
                <i class="ph ph-power" aria-hidden="true"></i>{int.active ? "Desativar" : "Ativar"}
              </button>
            </form>
            <form method="post" action={`/integrations/${id}/delete`} onsubmit="return confirm('Excluir esta integracao?')">
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="flex gap-2 mb-6">
        <form method="post" action={`/integrations/${id}/sync`}>
          <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Testar Conexao</button>
        </form>
        {(int.type === "google" || int.type === "microsoft" || int.type === "docusign") ? (
          int.connected_email ? (
            <a href={`/oauth/${int.type}`} class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Reconectar {int.connected_email}
            </a>
          ) : (
            <a href={`/oauth/${int.type}`} class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-plugs-connected" aria-hidden="true"></i>Conectar via OAuth
            </a>
          )
        ) : null}
      </div>
      <div class="grid grid-cols-2 gap-4">
        <Panel title="Dados da integracao" icon="ph-plugs-connected">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Nome: </dt><dd class="inline">{int.name}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{TYPE_LABELS[int.type] ?? int.type}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={int.active ? "green" : "gray"}>{int.active ? "Ativo" : "Inativo"}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Ultima sincronizacao: </dt><dd class="inline">{formatDate(int.last_sync_at)}</dd></div>
            {int.connected_email ? (
              <div><dt class="font-semibold text-gray-700 inline">Conta conectada: </dt><dd class="inline"><Badge color="green" icon="ph-check-circle">{int.connected_email}</Badge></dd></div>
            ) : null}
            {int.token_expires_at ? (
              <div><dt class="font-semibold text-gray-700 inline">Token expira em: </dt><dd class="inline">{formatDate(int.token_expires_at)}</dd></div>
            ) : null}
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{formatDate(int.created_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Atualizado em: </dt><dd class="inline">{formatDate(int.updated_at)}</dd></div>
          </dl>
        </Panel>
        <Panel title="Configuracao" icon="ph-gear">
          <pre class="text-body-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-2 border border-gray-200">{maskedDisplay}</pre>
        </Panel>
      </div>
    </>,
  );
});

// POST /integrations/:id/sync -- test connection (real API call).
integrationsRoutes.post("/:id/sync", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: int } = await supabase
    .from("integrations")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!int) return c.html("Integracao nao encontrada.", 404);

  const result = await syncIntegration(int.type, (int.config ?? {}) as Record<string, unknown>);

  // Update last_sync_at regardless of success/failure.
  await supabase
    .from("integrations")
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  // Store the sync result message in the session flash (simplified: redirect with query param).
  const status = result.success ? "ok" : "err";
  const msg = encodeURIComponent(result.message.slice(0, 200));
  return c.redirect(`/integrations/${id}?sync=${status}&msg=${msg}`);
});

// POST /integrations/:id/toggle -- toggle active.
integrationsRoutes.post("/:id/toggle", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: int } = await supabase
    .from("integrations")
    .select("active")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!int) return c.html("Integracao nao encontrada.", 404);

  await supabase
    .from("integrations")
    .update({ active: !int.active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/integrations/${id}`);
});

// POST /integrations/:id -- update.
integrationsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = integrationSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/integrations/${id}`);
  }

  // Build config from type-specific fields.
  const fields = CONFIG_FIELDS[parsed.data.type] ?? [];
  const existingConfig = (await supabase
    .from("integrations")
    .select("config")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single())?.data?.config as Record<string, unknown> ?? {};

  const config: Record<string, unknown> = {};
  for (const field of fields) {
    const val = (body as Record<string, string>)[field.key];
    if (val !== undefined && val !== "") {
      config[field.key] = val;
    } else if (field.type === "password" && existingConfig[field.key]) {
      // Keep existing password if not re-entered.
      config[field.key] = existingConfig[field.key];
    }
  }

  await supabase
    .from("integrations")
    .update({
      type: parsed.data.type,
      name: parsed.data.name,
      config,
      active: parsed.data.active === "true",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/integrations/${id}`);
});

// POST /integrations/:id/delete -- hard delete.
integrationsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("integrations")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/integrations");
});
