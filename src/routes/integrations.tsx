import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge, Modal } from "../components/ui";

export const integrationsRoutes = new Hono<AppEnv>();

integrationsRoutes.use("*", requireAuth);

const integrationSchema = z.object({
  type: z.enum(["cnj", "pje", "esaj", "google", "microsoft", "clicksign", "docusign", "whatsapp", "govbr", "diario_oficial"]),
  name: z.string().min(1, "Nome e obrigatorio"),
  config: z.string().optional(),
  active: z.string().optional(),
});

const TYPE_LABELS: Record<string, string> = {
  cnj: "CNJ",
  pje: "PJe",
  esaj: "e-SAJ",
  google: "Google Workspace",
  microsoft: "Microsoft 365",
  clicksign: "Clicksign",
  docusign: "DocuSign",
  whatsapp: "WhatsApp Business",
  govbr: "Gov.br",
  diario_oficial: "Diario Oficial",
};

const TYPE_ICONS: Record<string, string> = {
  cnj: "ph-scales",
  pje: "ph-folder-open",
  esaj: "ph-folder-open",
  google: "ph-google-logo",
  microsoft: "ph-microsoft-outlook-logo",
  clicksign: "ph-pen-nib",
  docusign: "ph-pen-nib",
  whatsapp: "ph-whatsapp-logo",
  govbr: "ph-shield-check",
  diario_oficial: "ph-newspaper",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// GET /integrations -- list integrations.
integrationsRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: integrations } = await supabase
    .from("integrations")
    .select("id, name, type, active, last_sync_at, created_at")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  const rows = (integrations ?? []).map((int) => [
    <a href={`/integrations/${int.id}`} class="text-terracota-600 hover:underline">{int.name}</a> as unknown as string,
    TYPE_LABELS[int.type] ?? int.type,
    <Badge color={int.active ? "green" : "gray"}>{int.active ? "Ativo" : "Inativo"}</Badge> as unknown as string,
    formatDate(int.last_sync_at),
  ]);

  // Available integration types as cards.
  const availableTypes = Object.keys(TYPE_LABELS);
  const configuredTypes = new Set((integrations ?? []).map((i) => i.type));

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
          >
            <Select label="Tipo" id="type" name="type" required
              options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <TextField label="Nome" id="name" name="name" required placeholder="Nome da integracao" icon="ph-tag" />
            <Textarea label="Configuracao (JSON)" id="config" name="config" rows={6}>
              {"{\n  \n}"}
            </Textarea>
            <div class="flex items-center gap-2">
              <input type="checkbox" id="active" name="active" value="true" checked />
              <label for="active" class="text-body-sm font-semibold text-gray-700">Ativar integracao</label>
            </div>
          </Modal>
        )}
      />
      <div class="grid grid-cols-3 gap-4 mb-6">
        {availableTypes.map((type) => (
          <Panel>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i class={`ph ${TYPE_ICONS[type] ?? "ph-plug"} text-h2 text-carvao-600`} aria-hidden="true"></i>
                <span class="font-semibold text-gray-800">{TYPE_LABELS[type]}</span>
              </div>
              {configuredTypes.has(type) ? (
                <Badge color="green" icon="ph-check">Configurado</Badge>
              ) : (
                <Badge color="gray">Disponivel</Badge>
              )}
            </div>
          </Panel>
        ))}
      </div>
      <Table
        columns={[
          { label: "Nome" },
          { label: "Tipo" },
          { label: "Status" },
          { label: "Ultima sincronizacao" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma integracao configurada."
        emptyIcon="ph-plugs-connected"
        ariaLabel="Lista de integracoes"
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

  let configJson: Record<string, unknown> = {};
  if (parsed.data.config) {
    try {
      configJson = JSON.parse(parsed.data.config);
    } catch {
      configJson = {};
    }
  }

  const { error } = await supabase.from("integrations").insert({
    tenant_id: user.tenantId,
    type: parsed.data.type,
    name: parsed.data.name,
    config: configJson,
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

  const configDisplay = int.config ? JSON.stringify(int.config, null, 2) : "{}";

  return renderPage(
    c,
    { title: int.name, active: "integrations" },
    <>
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
            >
              <Select label="Tipo" id="type" name="type" required selected={int.type}
                options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <TextField label="Nome" id="name" name="name" required value={int.name} icon="ph-tag" />
              <Textarea label="Configuracao (JSON)" id="config" name="config" rows={6}>
                {int.config ? JSON.stringify(int.config, null, 2) : "{\n  \n}"}
              </Textarea>
              <div class="flex items-center gap-2">
                <input type="checkbox" id="active" name="active" value="true" checked={int.active} />
                <label for="active" class="text-body-sm font-semibold text-gray-700">Ativar integracao</label>
              </div>
            </Modal>
            <form method="post" action={`/integrations/${id}/toggle`}>
              <button type="submit" class={`btn ${int.active ? "btn-danger" : "btn-primary"} inline-flex items-center gap-1`}>
                <i class={`ph ${int.active ? "ph-power" : "ph-power"} `} aria-hidden="true"></i>{int.active ? "Desativar" : "Ativar"}
              </button>
            </form>
            <form method="post" action={`/integrations/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta integracao?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="flex gap-2 mb-6">
        <form method="post" action={`/integrations/${id}/sync`}>
          <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Sincronizar Agora</button>
        </form>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <Panel title="Dados da integracao" icon="ph-plugs-connected">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Nome: </dt><dd class="inline">{int.name}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{TYPE_LABELS[int.type] ?? int.type}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={int.active ? "green" : "gray"}>{int.active ? "Ativo" : "Inativo"}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Ultima sincronizacao: </dt><dd class="inline">{formatDate(int.last_sync_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{formatDate(int.created_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Atualizado em: </dt><dd class="inline">{formatDate(int.updated_at)}</dd></div>
          </dl>
        </Panel>
        <Panel title="Configuracao" icon="ph-gear">
          <pre class="text-body-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-2 border border-border">{configDisplay}</pre>
        </Panel>
      </div>
    </>,
  );
});

// POST /integrations/:id/sync -- update last_sync_at (stub).
integrationsRoutes.post("/:id/sync", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("integrations")
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/integrations/${id}`);
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

  let configJson: Record<string, unknown> = {};
  if (parsed.data.config) {
    try {
      configJson = JSON.parse(parsed.data.config);
    } catch {
      configJson = {};
    }
  }

  await supabase
    .from("integrations")
    .update({
      type: parsed.data.type,
      name: parsed.data.name,
      config: configJson,
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
