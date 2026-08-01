import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const whatsappRoutes = new Hono<AppEnv>();

whatsappRoutes.use("*", requireAuth);

const sendSchema = z.object({
  client_id: z.string().optional(),
  phone: z.string().min(1, "Telefone e obrigatorio"),
  message: z.string().min(1, "Mensagem e obrigatoria"),
  template_name: z.string().optional(),
});

const bulkSchema = z.object({
  message: z.string().min(1, "Mensagem e obrigatoria"),
  client_id: z.string().optional(),
});

const TEMPLATES = [
  { name: "Lembrete de prazo", body: "Lembre-se do prazo processual agendado. Entre em contato para mais informacoes." },
  { name: "Convocacao para reuniao", body: "Voce foi convocado para uma reuniao. Confirme sua presenca." },
  { name: "Confirmacao de audiencia", body: "Sua audiencia esta confirmada. Verifique os detalhes com nosso escritorio." },
  { name: "Aviso de pagamento", body: "Lembrete de pagamento pendente. Regularize para evitar interrupcoes." },
  { name: "Documento disponivel", body: "Seu documento esta disponivel para retirada no escritorio." },
];

// GET / -- dashboard.
whatsappRoutes.get("/", async (c) => {
  const user = c.get("user");

  const [sentRes, receivedRes, deliveredRes, recentRes] = await Promise.all([
    supabase.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("direction", "outbound"),
    supabase.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("direction", "inbound"),
    supabase.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("direction", "outbound").eq("status", "sent"),
    supabase.from("whatsapp_messages")
      .select("id, phone, direction, message, status, created_at, clients(name)")
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const sentCount = sentRes.count ?? 0;
  const receivedCount = receivedRes.count ?? 0;
  const deliveredCount = deliveredRes.count ?? 0;
  const deliveryRate = sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 0;

  const rows = (recentRes.data ?? []).map((m) => [
    (m.clients as unknown as { name: string } | null)?.name ?? "-",
    m.phone ?? "-",
    m.message.length > 60 ? m.message.slice(0, 60) + "..." : m.message,
    <Badge color={m.direction === "inbound" ? "blue" : "gray"}>{m.direction === "inbound" ? "Recebida" : "Enviada"}</Badge> as unknown as string,
    <Badge color={m.status === "sent" ? "green" : m.status === "failed" ? "red" : "yellow"}>{m.status}</Badge> as unknown as string,
    new Date(m.created_at).toLocaleString("pt-BR"),
  ]);

  return renderPage(
    c,
    { title: "WhatsApp", active: "whatsapp" },
    <>
      <PageHeader
        title="WhatsApp"
        icon="ph-whatsapp-logo"
        actions={() => (
          <div class="flex gap-2">
            <a href="/whatsapp/templates" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-files" aria-hidden="true"></i>Templates</a>
            <a href="/whatsapp/bulk" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-users-three" aria-hidden="true"></i>Envio em Massa</a>
            <a href="/whatsapp/send" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Enviar Mensagem</a>
          </div>
        )}
      />
      <div class="grid grid-cols-3 gap-4 mb-4">
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-paper-plane-tilt text-h3 text-carvao-600" aria-hidden="true"></i>Total Enviadas
          </div>
          <div class="text-h1 font-bold text-carvao-700">{sentCount}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-tray text-h3 text-carvao-600" aria-hidden="true"></i>Total Recebidas
          </div>
          <div class="text-h1 font-bold text-carvao-700">{receivedCount}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-check-circle text-h3 text-terracota-600" aria-hidden="true"></i>Taxa de Entrega
          </div>
          <div class="text-h1 font-bold text-terracota-600">{deliveryRate}%</div>
        </Panel>
      </div>
      <Table
        columns={[
          { label: "Cliente" }, { label: "Telefone" }, { label: "Mensagem" },
          { label: "Direcao" }, { label: "Status" }, { label: "Data" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma mensagem encontrada."
        emptyIcon="ph-whatsapp-logo"
        ariaLabel="Mensagens recentes"
      />
    </>,
  );
});

// GET /send -- form to send a message.
whatsappRoutes.get("/send", async (c) => {
  const user = c.get("user");
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, phone")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("name");

  return renderPage(
    c,
    { title: "Enviar Mensagem", active: "whatsapp" },
    <>
      <PageHeader title="Enviar Mensagem" icon="ph-paper-plane-tilt" />
      <Panel>
        <form method="post" action="/whatsapp/send" class="flex flex-col gap-4">
          <Select label="Cliente" id="client_id" name="client_id"
            options={[{ value: "", label: "Nenhum" }, ...(clients ?? []).map((cl) => ({ value: cl.id, label: cl.name }))]}
          />
          <TextField label="Telefone" id="phone" name="phone" required placeholder="5511999999999" icon="ph-phone" />
          <Textarea label="Mensagem" id="message" name="message" rows={5} required />
          <TextField label="Template (opcional)" id="template_name" name="template_name" placeholder="Nome do template" icon="ph-files" />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Enviar</button>
            <a href="/whatsapp" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /send -- create outbound message (stub).
whatsappRoutes.post("/send", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/whatsapp/send");

  await supabase.from("whatsapp_messages").insert({
    tenant_id: user.tenantId,
    client_id: parsed.data.client_id || null,
    phone: parsed.data.phone,
    direction: "outbound",
    message: parsed.data.message,
    status: "sent",
    template_name: parsed.data.template_name || null,
  });

  return c.redirect("/whatsapp");
});

// GET /templates -- show approved templates list.
whatsappRoutes.get("/templates", (c) => {
  const rows = TEMPLATES.map((t) => [
    t.name,
    t.body.length > 60 ? t.body.slice(0, 60) + "..." : t.body,
    <Badge color="green">Aprovado</Badge> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Templates", active: "whatsapp" },
    <>
      <PageHeader
        title="Templates"
        icon="ph-files"
        actions={() => (
          <a href="/whatsapp/templates" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-plus" aria-hidden="true"></i>Novo Template</a>
        )}
      />
      <Table
        columns={[{ label: "Nome" }, { label: "Conteudo" }, { label: "Status" }]}
        rows={rows}
        emptyMsg="Nenhum template encontrado."
        emptyIcon="ph-files"
        ariaLabel="Lista de templates"
      />
    </>,
  );
});

// GET /:id -- view message detail.
whatsappRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: msg } = await supabase
    .from("whatsapp_messages")
    .select("id, phone, direction, message, status, template_name, created_at, client_id, clients(name)")
    .eq("id", id).eq("tenant_id", user.tenantId).single();

  if (!msg) return c.html("Mensagem nao encontrada.", 404);

  const clientName = (msg.clients as unknown as { name: string } | null)?.name;

  return renderPage(
    c,
    { title: "Mensagem", active: "whatsapp" },
    <>
      <PageHeader title="Detalhes da Mensagem" icon="ph-whatsapp-logo" />
      <Panel title="Mensagem" icon="ph-whatsapp-logo">
        <dl class="flex flex-col gap-2 mb-4">
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Cliente:</dt><dd class="text-gray-900">{clientName ? <a href={`/clients/${msg.client_id}`} class="text-terracota-600 hover:underline">{clientName}</a> : "-"}</dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Telefone:</dt><dd class="text-gray-900">{msg.phone ?? "-"}</dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Direcao:</dt><dd><Badge color={msg.direction === "inbound" ? "blue" : "gray"}>{msg.direction === "inbound" ? "Recebida" : "Enviada"}</Badge></dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Status:</dt><dd><Badge color={msg.status === "sent" ? "green" : msg.status === "failed" ? "red" : "yellow"}>{msg.status}</Badge></dd></div>
          {msg.template_name ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Template:</dt><dd class="text-gray-900">{msg.template_name}</dd></div> : null}
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Data:</dt><dd class="text-gray-900">{new Date(msg.created_at).toLocaleString("pt-BR")}</dd></div>
        </dl>
        <div class="border-t border-border pt-4">
          <div class="text-body-sm font-semibold text-gray-700 mb-2">Mensagem</div>
          <div class="text-body text-gray-800 whitespace-pre-wrap">{msg.message}</div>
        </div>
      </Panel>
    </>,
  );
});

// GET /bulk -- bulk send form.
whatsappRoutes.get("/bulk", async (c) => {
  const user = c.get("user");
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("name");

  return renderPage(
    c,
    { title: "Envio em Massa", active: "whatsapp" },
    <>
      <PageHeader title="Envio em Massa" icon="ph-users-three" />
      <Panel>
        <div class="mb-4 p-3 border border-border bg-gray-50 flex items-start gap-2">
          <i class="ph ph-warning text-h3 text-terracota-600 mt-0.5" aria-hidden="true"></i>
          <div class="text-body-sm text-gray-600">
            O envio em massa sera realizado para todos os clientes com telefone cadastrado.
            Selecione um cliente para filtrar apenas os contatos associados a ele.
          </div>
        </div>
        <form method="post" action="/whatsapp/bulk" class="flex flex-col gap-4">
          <Textarea label="Mensagem" id="message" name="message" rows={5} required />
          <Select label="Filtrar por cliente (opcional)" id="client_id" name="client_id"
            options={[{ value: "", label: "Todos os clientes" }, ...(clients ?? []).map((cl) => ({ value: cl.id, label: cl.name }))]}
          />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1" onclick="return confirm('Enviar mensagem para todos os clientes selecionados?')"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Enviar para todos</button>
            <a href="/whatsapp" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /bulk -- create messages for all/filtered clients (stub).
whatsappRoutes.post("/bulk", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/whatsapp/bulk");

  let query = supabase
    .from("clients")
    .select("id, phone")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .not("phone", "is", null);

  if (parsed.data.client_id) {
    query = query.eq("id", parsed.data.client_id);
  }

  const { data: clients } = await query;

  if (clients && clients.length > 0) {
    const inserts = clients
      .filter((cl) => cl.phone)
      .map((cl) => ({
        tenant_id: user.tenantId,
        client_id: cl.id,
        phone: cl.phone,
        direction: "outbound",
        message: parsed.data.message,
        status: "sent",
      }));
    if (inserts.length > 0) {
      await supabase.from("whatsapp_messages").insert(inserts);
    }
  }

  return c.redirect("/whatsapp");
});
