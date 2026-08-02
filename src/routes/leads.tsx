import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge, Modal } from "../components/ui";

export const leadsRoutes = new Hono<AppEnv>();

leadsRoutes.use("*", requireAuth);

const leadSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("Email invalido").optional().or(z.literal("")),
  origin: z.string().min(1),
  status: z.enum(["novo", "contato", "reuniao", "proposta", "negociacao", "cliente", "perdido"]),
  area_of_interest: z.string().optional(),
  notes: z.string().optional(),
});

const PIPELINE_STAGES = [
  { key: "novo", label: "Novo", color: "gray" as const, icon: "ph-user-plus" },
  { key: "contato", label: "Contato", color: "blue" as const, icon: "ph-phone" },
  { key: "reuniao", label: "Reuniao", color: "blue" as const, icon: "ph-users" },
  { key: "proposta", label: "Proposta", color: "yellow" as const, icon: "ph-file-text" },
  { key: "negociacao", label: "Negociacao", color: "yellow" as const, icon: "ph-handshake" },
  { key: "cliente", label: "Cliente", color: "green" as const, icon: "ph-check-circle" },
  { key: "perdido", label: "Perdido", color: "red" as const, icon: "ph-x-circle" },
];

// GET /leads -- pipeline view (Kanban) + list toggle.
leadsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const view = c.req.query("view") ?? "pipeline";

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, phone, whatsapp, email, origin, status, area_of_interest, assigned_to, profiles(full_name), created_at")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (view === "list") {
    const rows = (leads ?? []).map((l) => {
      const stage = PIPELINE_STAGES.find((s) => s.key === l.status);
      const assigned = (l.profiles as unknown as { full_name: string } | null)?.full_name ?? "-";
      return [
        <a href={`/leads/${l.id}`} class="text-terracota-600 hover:underline">{l.name}</a> as unknown as string,
        l.email ?? "-",
        l.phone ?? "-",
        l.origin,
        l.area_of_interest ?? "-",
        assigned,
        <Badge color={stage?.color ?? "gray"} icon={stage?.icon}>{stage?.label ?? l.status}</Badge> as unknown as string,
        <a href={`/leads/${l.id}`} class="text-terracota-600 hover:underline text-body-sm">Ver</a> as unknown as string,
      ];
    });

    return renderPage(
      c,
      { title: "Leads", active: "leads" },
      <>
        <PageHeader
          title="Leads"
          icon="ph-user-plus"
          actions={() => (
            <div class="flex gap-2">
              <a href="/leads?view=pipeline" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-kanban" aria-hidden="true" />Pipeline
              </a>
              <a href="/leads?view=list" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-list" aria-hidden="true" />Lista
              </a>
              <Modal
                id="newLead"
                title="Novo Lead"
                icon="ph-user-plus"
                triggerText="Novo Lead"
                triggerIcon="ph-plus"
                action="/leads"
                submitLabel="Salvar"
                large
              >
                <TextField label="Nome" id="name" name="name" required placeholder="Nome do lead" icon="ph-user" />
                <div class="grid grid-cols-2 gap-4">
                  <TextField label="Telefone" id="phone" name="phone" placeholder="11999999999" icon="ph-phone" />
                  <TextField label="WhatsApp" id="whatsapp" name="whatsapp" placeholder="11999999999" icon="ph-whatsapp-logo" />
                </div>
                <TextField label="Email" id="email" name="email" type="email" placeholder="lead@email.com" icon="ph-envelope" />
                <div class="grid grid-cols-2 gap-4">
                  <Select label="Origem" id="origin" name="origin" required icon="ph-flag"
                    options={[
                      { value: "indicacao", label: "Indicacao" },
                      { value: "google", label: "Google" },
                      { value: "redes_sociais", label: "Redes Sociais" },
                      { value: "site", label: "Site" },
                      { value: "evento", label: "Evento" },
                      { value: "outro", label: "Outro" },
                    ]}
                  />
                  <Select label="Status" id="status" name="status" required selected="novo" icon="ph-circle-half"
                    options={PIPELINE_STAGES.map((s) => ({ value: s.key, label: s.label }))}
                  />
                </div>
                <TextField label="Area de interesse" id="area_of_interest" name="area_of_interest" placeholder="Civel, Trabalhista, Familia..." icon="ph-tag" />
                <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
              </Modal>
            </div>
          )}
        />
        <Table
          columns={[
            { label: "Nome", icon: "ph-user" },
            { label: "Email", icon: "ph-envelope" },
            { label: "Telefone", icon: "ph-phone" },
            { label: "Origem", icon: "ph-flag" },
            { label: "Area", icon: "ph-tag" },
            { label: "Responsavel", icon: "ph-user-circle" },
            { label: "Status", icon: "ph-circle-half" },
            { label: "Acoes" },
          ]}
          rows={rows}
          emptyMsg="Nenhum lead cadastrado."
          emptyIcon="ph-user-plus"
          ariaLabel="Lista de leads"
        />
      </>,
    );
  }

  // Pipeline (Kanban) view.
  const byStage = (stage: string) => (leads ?? []).filter((l) => l.status === stage);

  return renderPage(
    c,
    { title: "Leads", active: "leads" },
    <>
      <PageHeader
        title="Leads - Pipeline"
        icon="ph-user-plus"
        actions={() => (
          <div class="flex gap-2">
            <a href="/leads?view=pipeline" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-kanban" aria-hidden="true" />Pipeline
            </a>
            <a href="/leads?view=list" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-list" aria-hidden="true" />Lista
            </a>
            <Modal
              id="newLeadPipeline"
              title="Novo Lead"
              icon="ph-user-plus"
              triggerText="Novo Lead"
              triggerIcon="ph-plus"
              action="/leads"
              submitLabel="Salvar"
              large
            >
              <TextField label="Nome" id="name" name="name" required placeholder="Nome do lead" icon="ph-user" />
              <div class="grid grid-cols-2 gap-4">
                <TextField label="Telefone" id="phone" name="phone" placeholder="11999999999" icon="ph-phone" />
                <TextField label="WhatsApp" id="whatsapp" name="whatsapp" placeholder="11999999999" icon="ph-whatsapp-logo" />
              </div>
              <TextField label="Email" id="email" name="email" type="email" placeholder="lead@email.com" icon="ph-envelope" />
              <div class="grid grid-cols-2 gap-4">
                <Select label="Origem" id="origin" name="origin" required icon="ph-flag"
                  options={[
                    { value: "indicacao", label: "Indicacao" },
                    { value: "google", label: "Google" },
                    { value: "redes_sociais", label: "Redes Sociais" },
                    { value: "site", label: "Site" },
                    { value: "evento", label: "Evento" },
                    { value: "outro", label: "Outro" },
                  ]}
                />
                <Select label="Status" id="status" name="status" required selected="novo" icon="ph-circle-half"
                  options={PIPELINE_STAGES.map((s) => ({ value: s.key, label: s.label }))}
                />
              </div>
              <TextField label="Area de interesse" id="area_of_interest" name="area_of_interest" placeholder="Civel, Trabalhista, Familia..." icon="ph-tag" />
              <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
            </Modal>
          </div>
        )}
      />
      <div class="flex gap-5 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = byStage(stage.key);
          return (
            <div class="w-60 shrink-0 bg-gray-50 rounded-xl border border-gray-100">
              <div class="flex items-center gap-2 px-4 py-3 rounded-t-xl font-semibold text-gray-700 border-b border-gray-200">
                <i class={`ph ${stage.icon} text-body text-gray-600`} aria-hidden="true" />
                <span class="text-body-sm">{stage.label}</span>
                <span class="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-gray-200 text-body-sm text-gray-600">{stageLeads.length}</span>
              </div>
              <div class="flex flex-col gap-3 p-3">
                {stageLeads.map((l) => (
                  <a href={`/leads/${l.id}`} class="block bg-white border border-gray-200 p-4 rounded-lg hover:border-terracota-300 hover:shadow-md transition-all">
                    <div class="font-medium text-gray-800">{l.name}</div>
                    {l.area_of_interest ? (
                      <div class="text-body-sm text-gray-500">{l.area_of_interest}</div>
                    ) : null}
                    {l.email ? (
                      <div class="text-body-sm text-gray-500 flex items-center gap-1 mt-1">
                        <i class="ph ph-envelope text-xs" aria-hidden="true" />
                        {l.email}
                      </div>
                    ) : null}
                  </a>
                ))}
                {stageLeads.length === 0 ? (
                  <div class="border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-400 text-body-sm">
                    <i class="ph ph-tray text-h2 block mb-1" aria-hidden="true" />
                    Vazio
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>,
  );
});

// POST /leads -- create.
leadsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = leadSchema.safeParse(body);

  if (!parsed.success) return c.redirect("/leads");

  await supabase.from("leads").insert({
    tenant_id: user.tenantId,
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    whatsapp: parsed.data.whatsapp || null,
    email: parsed.data.email || null,
    origin: parsed.data.origin,
    status: parsed.data.status,
    area_of_interest: parsed.data.area_of_interest || null,
    notes: parsed.data.notes || null,
    assigned_to: user.id,
  });

  return c.redirect("/leads");
});

// GET /leads/:id -- detail.
leadsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: lead } = await supabase
    .from("leads")
    .select("*, profiles(full_name)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!lead) return c.html("Lead nao encontrado.", 404);

  const stage = PIPELINE_STAGES.find((s) => s.key === lead.status);
  const assigned = (lead.profiles as unknown as { full_name: string } | null)?.full_name ?? "-";

  return renderPage(
    c,
    { title: lead.name, active: "leads" },
    <>
      <PageHeader
        title={lead.name}
        icon="ph-user-plus"
        actions={() => (
          <div class="flex gap-2">
            <Modal
              id="editLead"
              title="Editar Lead"
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/leads/${id}`}
              submitLabel="Salvar Alteracoes"
              large
            >
              <TextField label="Nome" id="name" name="name" required value={lead.name} icon="ph-user" />
              <div class="grid grid-cols-2 gap-4">
                <TextField label="Telefone" id="phone" name="phone" value={lead.phone ?? ""} icon="ph-phone" />
                <TextField label="WhatsApp" id="whatsapp" name="whatsapp" value={lead.whatsapp ?? ""} icon="ph-whatsapp-logo" />
              </div>
              <TextField label="Email" id="email" name="email" type="email" value={lead.email ?? ""} icon="ph-envelope" />
              <div class="grid grid-cols-2 gap-4">
                <Select label="Origem" id="origin" name="origin" required selected={lead.origin} icon="ph-flag"
                  options={[
                    { value: "indicacao", label: "Indicacao" },
                    { value: "google", label: "Google" },
                    { value: "redes_sociais", label: "Redes Sociais" },
                    { value: "site", label: "Site" },
                    { value: "evento", label: "Evento" },
                    { value: "outro", label: "Outro" },
                  ]}
                />
                <Select label="Status" id="status" name="status" required selected={lead.status} icon="ph-circle-half"
                  options={PIPELINE_STAGES.map((s) => ({ value: s.key, label: s.label }))}
                />
              </div>
              <TextField label="Area de interesse" id="area_of_interest" name="area_of_interest" value={lead.area_of_interest ?? ""} icon="ph-tag" />
              <Textarea label="Observacoes" id="notes" name="notes" rows={3}>{lead.notes ?? ""}</Textarea>
            </Modal>
            <form method="post" action={`/leads/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este lead?')">
                <i class="ph ph-trash" aria-hidden="true" />Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados do lead" icon="ph-user">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={stage?.color ?? "gray"} icon={stage?.icon}>{stage?.label}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Origem: </dt><dd class="inline">{lead.origin}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Area: </dt><dd class="inline">{lead.area_of_interest ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Responsavel: </dt><dd class="inline">{assigned}</dd></div>
            {lead.email ? <div><dt class="font-semibold text-gray-700 inline">Email: </dt><dd class="inline">{lead.email}</dd></div> : null}
            {lead.phone ? <div><dt class="font-semibold text-gray-700 inline">Telefone: </dt><dd class="inline">{lead.phone}</dd></div> : null}
            {lead.whatsapp ? <div><dt class="font-semibold text-gray-700 inline">WhatsApp: </dt><dd class="inline">{lead.whatsapp}</dd></div> : null}
          </dl>
        </Panel>
        {lead.notes ? (
          <Panel title="Observacoes" icon="ph-note">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
          </Panel>
        ) : null}
      </div>

      {/* Stage change form */}
      <Panel title="Mover para etapa" icon="ph-arrows-left-right">
        <form method="post" action={`/leads/${id}/status`} class="flex gap-2 items-end">
          <Select label="Etapa" id="status" name="status" required selected={lead.status}
            options={PIPELINE_STAGES.map((s) => ({ value: s.key, label: s.label }))}
          />
          <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-arrows-left-right" aria-hidden="true" />Mover
          </button>
        </form>
      </Panel>
    </>,
  );
});

// POST /leads/:id/status -- change stage.
leadsRoutes.post("/:id/status", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const status = String(body.status ?? "");

  const valid = PIPELINE_STAGES.some((s) => s.key === status);
  if (!valid) return c.redirect(`/leads/${id}`);

  // If converting to "cliente", we could auto-create a client record.
  await supabase.from("leads").update({ status }).eq("id", id).eq("tenant_id", user.tenantId);

  return c.redirect(`/leads/${id}`);
});

// POST /leads/:id -- update.
leadsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = leadSchema.safeParse(body);

  if (!parsed.success) return c.redirect(`/leads/${id}`);

  await supabase.from("leads").update({
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    whatsapp: parsed.data.whatsapp || null,
    email: parsed.data.email || null,
    origin: parsed.data.origin,
    status: parsed.data.status,
    area_of_interest: parsed.data.area_of_interest || null,
    notes: parsed.data.notes || null,
  }).eq("id", id).eq("tenant_id", user.tenantId);

  return c.redirect(`/leads/${id}`);
});

// POST /leads/:id/delete -- soft delete.
leadsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/leads");
});
