import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge, Modal } from "../components/ui";

export const communicationsRoutes = new Hono<AppEnv>();

communicationsRoutes.use("*", requireAuth);

const commSchema = z.object({
  case_id: z.string().optional(),
  client_id: z.string().optional(),
  channel: z.string().min(1, "Canal e obrigatorio"),
  direction: z.enum(["inbound", "outbound"]),
  message_body: z.string().min(1, "Mensagem e obrigatoria"),
  subject: z.string().optional(),
  sent_at: z.string().optional(),
});

// GET / -- list communications with create modal.
communicationsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [logsRes, casesRes, clientsRes] = await Promise.all([
    supabase
      .from("communications_log")
      .select("id, channel, direction, message_body, subject, sent_at, cases(title), clients(name)")
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null)
      .order("sent_at", { ascending: false })
      .limit(50),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const logs = logsRes.data ?? [];
  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];

  const rows = logs.map((l) => [
    new Date(l.sent_at).toLocaleString("pt-BR"),
    l.channel,
    <Badge color={l.direction === "inbound" ? "blue" : "gray"}>{l.direction === "inbound" ? "Recebida" : "Enviada"}</Badge> as unknown as string,
    (l.cases as unknown as { title: string } | null)?.title ?? "-",
    (l.clients as unknown as { name: string } | null)?.name ?? "-",
    l.message_body.length > 60 ? l.message_body.slice(0, 60) + "..." : l.message_body,
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
            <Select label="Processo (opcional)" id="case_id" name="case_id"
              options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
            />
            <Select label="Cliente (opcional)" id="client_id" name="client_id"
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
      <Table
        columns={[{ label: "Data" }, { label: "Canal" }, { label: "Direcao" }, { label: "Processo" }, { label: "Cliente" }, { label: "Mensagem" }]}
        rows={rows}
        emptyMsg="Nenhuma comunicacao registrada."
        emptyIcon="ph-chats-circle"
        ariaLabel="Log de comunicacao"
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
              <Select label="Processo (opcional)" id="case_id" name="case_id"
                options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
                selected={log.case_id ?? ""}
              />
              <Select label="Cliente (opcional)" id="client_id" name="client_id"
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
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta comunicacao?')">
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
            {caseTitle ? <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline"><a href={`/cases/${log.case_id}`} class="text-terracota-600 hover:underline">{caseTitle}</a></dd></div> : null}
            {clientName ? <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${log.client_id}`} class="text-terracota-600 hover:underline">{clientName}</a></dd></div> : null}
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
