import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { sanitizeILike } from "../lib/search-sanitize";
import { caseBelongsToTenant, clientBelongsToTenant } from "../lib/tenant-ownership";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const communicationsRoutes = new Hono<AppEnv>();

communicationsRoutes.use("*", requireAuth);

const commSchema = z.object({
  case_id: z.string().max(36).optional(),
  client_id: z.string().max(36).optional(),
  channel: z.string().min(1, "Canal e obrigatorio").max(50),
  direction: z.enum(["inbound", "outbound"]),
  message_body: z.string().min(1, "Mensagem e obrigatoria").max(10000),
  subject: z.string().max(500).optional(),
  sent_at: z.string().max(30).optional(),
});

// GET / -- list communications with create modal.
communicationsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let logsQuery = supabase
    .from("communications_log")
    .select("id, channel, direction, message_body, subject, sent_at, cases(title), clients(name)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false });

  if (search) logsQuery = logsQuery.ilike("message_body", `%${sanitizeILike(search)}%`);

  logsQuery = logsQuery.range(offset, offset + limit - 1);

  const [logsRes, casesRes, clientsRes] = await Promise.all([
    logsQuery,
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const logs = logsRes.data ?? [];
  const count = logsRes.count;
  const totalPages = count ? Math.ceil(count / limit) : 1;
  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];

  const rows = logs.map((l) => [
    new Date(l.sent_at).toLocaleString("pt-BR"),
    l.channel,
    <Badge color={l.direction === "inbound" ? "blue" : "gray"}>{l.direction === "inbound" ? "Recebida" : "Enviada"}</Badge> as unknown as string,
    (l.cases as unknown as { title: string } | null)?.title ?? "-",
    (l.clients as unknown as { name: string } | null)?.name ?? "-",
    l.message_body.length > 60 ? l.message_body.slice(0, 60) + "..." : l.message_body,
    <div class="flex items-center gap-2">
      <a href={`/communications/${l.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <a href={`/communications/${l.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/communications/${l.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Comunicacao", active: "communications" },
    <>
      <PageHeader
        title="Comunicacao"
        icon="ph-chats-circle"
        actions={() => (
          <Modal
            id="newComm"
            title="Nova Comunicacao"
            icon="ph-chats-circle"
            triggerText="Nova Comunicacao"
            triggerIcon="ph-plus"
            action="/communications"
            submitLabel="Salvar"
            large
          >
            <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
              options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
            />
            <ComboBox label="Cliente (opcional)" id="client_id" name="client_id"
              options={[{ value: "", label: "Nenhum" }, ...clients.map((cl) => ({ value: cl.id, label: cl.name }))]}
            />
            <div class="grid grid-cols-2 gap-4">
              <Select label="Tipo" id="channel" name="channel" required
                options={[
                  { value: "email", label: "Email" },
                  { value: "whatsapp", label: "WhatsApp" },
                  { value: "phone", label: "Telefone" },
                  { value: "letter", label: "Carta" },
                  { value: "in_person", label: "Presencial" },
                ]}
              />
              <Select label="Direcao" id="direction" name="direction" required selected="outbound"
                options={[
                  { value: "outbound", label: "Enviada" },
                  { value: "inbound", label: "Recebida" },
                ]}
              />
            </div>
            <TextField label="Assunto" id="subject" name="subject" placeholder="Assunto da comunicacao" icon="ph-text-aa" />
            <Textarea label="Conteudo" id="message_body" name="message_body" rows={5} required />
            <TextField label="Data" id="sent_at" name="sent_at" type="date" />
          </Modal>
        )}
      />
      <div class="mb-4 p-3 border border-gray-200 bg-gray-50 flex items-start gap-2">
        <i class="ph ph-info text-h4 text-gray-500" aria-hidden="true"></i>
        <div class="text-body-sm text-gray-600">
          <strong>Sincronizacao com PJe:</strong> Para importar comunicacoes processuais do PJe automaticamente,
          e necessario convenio com o tribunal e certificado digital ICP-Brasil.
          Configure a integracao PJe em <a href="/integrations" class="text-[#0568ff] hover:underline">Integracoes</a>.
          Por enquanto, registre comunicacoes manualmente abaixo.
        </div>
      </div>
      <form method="get" action="/communications" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Mensagem..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[{ label: "Data" }, { label: "Canal" }, { label: "Direcao" }, { label: "Processo" }, { label: "Cliente" }, { label: "Mensagem" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhuma comunicacao registrada."
        emptyIcon="ph-chats-circle"
        ariaLabel="Log de comunicacao"
        count={count ?? 0}
        countLabel="comunicacao(oes)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/communications",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// GET /:id -- detail with edit modal.
communicationsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [logRes, casesRes, clientsRes] = await Promise.all([
    supabase
      .from("communications_log")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null)
      .single(),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const log = logRes.data;
  if (!log) return c.html("Comunicacao nao encontrada.", 404);

  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];

  const caseTitle = (log.cases as unknown as { title: string } | null)?.title;
  const clientName = (log.clients as unknown as { name: string } | null)?.name;

  const toDateInput = (value: string | null | undefined) => {
    if (!value) return "";
    return new Date(value).toISOString().split("T")[0] ?? "";
  };

  return renderPage(
    c,
    { title: "Comunicacao", active: "communications" },
    <>
      <PageHeader
        title="Comunicacao"
        icon="ph-chats-circle"
        actions={() => (
          <div class="flex gap-2">
            <Modal
              id="editComm"
              title="Editar Comunicacao"
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/communications/${id}`}
              submitLabel="Salvar"
              large
            >
              <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
                options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
                selected={log.case_id ?? ""}
              />
              <ComboBox label="Cliente (opcional)" id="client_id" name="client_id"
                options={[{ value: "", label: "Nenhum" }, ...clients.map((cl) => ({ value: cl.id, label: cl.name }))]}
                selected={log.client_id ?? ""}
              />
              <div class="grid grid-cols-2 gap-4">
                <Select label="Tipo" id="channel" name="channel" required
                  options={[
                    { value: "email", label: "Email" },
                    { value: "whatsapp", label: "WhatsApp" },
                    { value: "phone", label: "Telefone" },
                    { value: "letter", label: "Carta" },
                    { value: "in_person", label: "Presencial" },
                  ]}
                  selected={log.channel}
                />
                <Select label="Direcao" id="direction" name="direction" required selected={log.direction}
                  options={[
                    { value: "outbound", label: "Enviada" },
                    { value: "inbound", label: "Recebida" },
                  ]}
                />
              </div>
              <TextField label="Assunto" id="subject" name="subject" value={log.subject ?? ""} icon="ph-text-aa" />
              <Textarea label="Conteudo" id="message_body" name="message_body" rows={5} required>
                {log.message_body}
              </Textarea>
              <TextField label="Data" id="sent_at" name="sent_at" type="date" value={toDateInput(log.sent_at)} />
            </Modal>
            <form method="post" action={`/communications/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta comunicacao?')" aria-label="Excluir">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados da Comunicacao" icon="ph-chats-circle">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Canal: </dt><dd class="inline">{log.channel}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Direcao: </dt><dd class="inline">{log.direction === "inbound" ? "Recebida" : "Enviada"}</dd></div>
            {log.subject ? <div><dt class="font-semibold text-gray-700 inline">Assunto: </dt><dd class="inline">{log.subject}</dd></div> : null}
            <div><dt class="font-semibold text-gray-700 inline">Data: </dt><dd class="inline">{new Date(log.sent_at).toLocaleString("pt-BR")}</dd></div>
            {caseTitle ? <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline"><a href={`/cases/${log.case_id}`} class="text-[#0568ff] hover:underline">{caseTitle}</a></dd></div> : null}
            {clientName ? <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${log.client_id}`} class="text-[#0568ff] hover:underline">{clientName}</a></dd></div> : null}
          </dl>
        </Panel>
        <Panel title="Conteudo" icon="ph-text-aa">
          <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{log.message_body}</p>
        </Panel>
      </div>
    </>,
  );
});

// POST / -- create.
communicationsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = commSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/communications");

  if (parsed.data.case_id) {
    const owns = await caseBelongsToTenant(parsed.data.case_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }
  if (parsed.data.client_id) {
    const owns = await clientBelongsToTenant(parsed.data.client_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }

  await supabase.from("communications_log").insert({
    tenant_id: user.tenantId,
    case_id: parsed.data.case_id || null,
    client_id: parsed.data.client_id || null,
    channel: parsed.data.channel,
    direction: parsed.data.direction,
    message_body: parsed.data.message_body,
    subject: parsed.data.subject || null,
    sent_at: parsed.data.sent_at || new Date().toISOString(),
    status: "sent",
  });

  return c.redirect("/communications");
});

// POST /:id -- update.
communicationsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = commSchema.safeParse(body);
  if (!parsed.success) return c.redirect(`/communications/${id}`);

  if (parsed.data.case_id) {
    const owns = await caseBelongsToTenant(parsed.data.case_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }
  if (parsed.data.client_id) {
    const owns = await clientBelongsToTenant(parsed.data.client_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }

  await supabase
    .from("communications_log")
    .update({
      case_id: parsed.data.case_id || null,
      client_id: parsed.data.client_id || null,
      channel: parsed.data.channel,
      direction: parsed.data.direction,
      message_body: parsed.data.message_body,
      subject: parsed.data.subject || null,
      sent_at: parsed.data.sent_at || new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/communications/${id}`);
});

// POST /:id/delete -- soft delete.
communicationsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("communications_log")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/communications");
});
