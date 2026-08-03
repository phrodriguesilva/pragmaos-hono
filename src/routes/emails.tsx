import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { sendGmailEmail, sendOutlookEmail } from "../lib/integrations";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";
import { rateLimit } from "../lib/rate-limit";

const emailSendRateLimit = rateLimit(10, 60_000); // 10 emails per minute per IP

export const emailRoutes = new Hono<AppEnv>();

emailRoutes.use("*", requireAuth);
emailRoutes.use("*", requireRole("socio", "admin", "advogado"));

const accountSchema = z.object({
  provider: z.enum(["gmail", "outlook", "imap", "smtp"]),
  email: z.string().email("E-mail invalido"),
});

const composeSchema = z.object({
  to_email: z.string().email("Destinatario invalido").max(255),
  subject: z.string().max(500).optional(),
  body: z.string().max(10000).optional(),
  case_id: z.string().max(36).optional(),
  client_id: z.string().max(36).optional(),
});

// GET / -- email dashboard.
emailRoutes.get("/", async (c) => {
  const user = c.get("user");

  const [inboxRes, sentRes, unreadRes, recentRes, casesRes, clientsRes] = await Promise.all([
    supabase.from("email_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("direction", "inbound"),
    supabase.from("email_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("direction", "outbound"),
    supabase.from("email_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("read", false),
    supabase.from("email_messages")
      .select("id, from_email, to_email, subject, direction, read, received_at, created_at")
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const inboxCount = inboxRes.count ?? 0;
  const sentCount = sentRes.count ?? 0;
  const unreadCount = unreadRes.count ?? 0;

  const rows = (recentRes.data ?? []).map((m) => [
    m.from_email ?? "-",
    m.to_email ?? "-",
    m.subject ?? "-",
    m.received_at ? new Date(m.received_at).toLocaleString("pt-BR") : new Date(m.created_at).toLocaleString("pt-BR"),
    <Badge color={m.direction === "inbound" ? "blue" : "gray"}>{m.direction === "inbound" ? "Recebida" : "Enviada"}</Badge> as unknown as string,
    m.read ? <Badge color="green">Lida</Badge> as unknown as string : <Badge color="yellow">Nao lida</Badge> as unknown as string,
    <a href={`/emails/${m.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "E-mails", active: "emails" },
    <>
      <PageHeader
        title="E-mails"
        icon="ph-envelope"
        actions={() => (
          <div class="flex gap-2">
            <a href="/emails/accounts" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-at" aria-hidden="true"></i>Contas</a>
            <Modal
              id="compose-email"
              title="Enviar E-mail"
              icon="ph-paper-plane-tilt"
              triggerText="Enviar E-mail"
              triggerIcon="ph-paper-plane-tilt"
              action="/emails/send"
              submitLabel="Enviar"
              submitIcon="ph-paper-plane-tilt"
              large
            >
              <TextField label="Para" id="to_email" name="to_email" type="email" required placeholder="destinatario@email.com" icon="ph-envelope" />
              <TextField label="Assunto" id="subject" name="subject" placeholder="Assunto do e-mail" />
              <Textarea label="Mensagem" id="body" name="body" rows={8} />
              <div class="grid grid-cols-2 gap-4">
                <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
                  options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
                />
                <ComboBox label="Cliente (opcional)" id="client_id" name="client_id"
                  options={[{ value: "", label: "Nenhum" }, ...(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))]}
                />
              </div>
            </Modal>
          </div>
        )}
      />
      <div class="grid grid-cols-3 gap-4 mb-4">
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-tray text-h3 text-[#0568ff]" aria-hidden="true"></i>Caixa de Entrada
          </div>
          <div class="text-h1 font-bold text-[#0568ff]">{inboxCount}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-paper-plane-tilt text-h3 text-[#0568ff]" aria-hidden="true"></i>Enviados
          </div>
          <div class="text-h1 font-bold text-[#0568ff]">{sentCount}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-envelope-simple-open text-h3 text-[#0568ff]" aria-hidden="true"></i>Nao Lidas
          </div>
          <div class="text-h1 font-bold text-[#0568ff]">{unreadCount}</div>
        </Panel>
      </div>
      <Table
        columns={[
          { label: "De" }, { label: "Para" }, { label: "Assunto" },
          { label: "Data" }, { label: "Direcao" }, { label: "Status" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhum e-mail encontrado."
        emptyIcon="ph-envelope"
        ariaLabel="E-mails recentes"
      />
    </>,
  );
});

// GET /accounts -- list email accounts.
emailRoutes.get("/accounts", async (c) => {
  const user = c.get("user");
  const { data: accounts } = await supabase
    .from("email_accounts")
    .select("id, email, provider, active, last_sync_at")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  const rows = (accounts ?? []).map((a) => [
    a.email,
    a.provider,
    a.active ? <Badge color="green">Ativa</Badge> as unknown as string : <Badge color="gray">Inativa</Badge> as unknown as string,
    a.last_sync_at ? new Date(a.last_sync_at).toLocaleString("pt-BR") : "-",
    <>
      <form method="post" action={`/emails/accounts/${a.id}/sync`} class="inline">
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Sincronizar</button>
      </form>
    </> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Contas de E-mail", active: "emails" },
    <>
      <PageHeader
        title="Contas de E-mail"
        icon="ph-at"
        actions={() => (
          <Modal
            id="new-email-account"
            title="Nova Conta de E-mail"
            icon="ph-at"
            triggerText="Nova Conta"
            triggerIcon="ph-plus"
            action="/emails/accounts"
            submitLabel="Salvar"
          >
            <Select label="Provedor" id="provider" name="provider" required
              options={[
                { value: "gmail", label: "Gmail" },
                { value: "outlook", label: "Outlook" },
                { value: "imap", label: "IMAP" },
                { value: "smtp", label: "SMTP" },
              ]}
            />
            <TextField label="E-mail" id="email" name="email" type="email" required placeholder="seu@email.com" icon="ph-envelope" />
          </Modal>
        )}
      />
      <Table
        columns={[
          { label: "E-mail" }, { label: "Provedor" }, { label: "Status" },
          { label: "Ultima sincronizacao" }, { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma conta configurada."
        emptyIcon="ph-at"
        ariaLabel="Lista de contas de e-mail"
      />
    </>,
  );
});

// POST /accounts -- create email account record.
// Note: OAuth authentication is handled separately via the Integrations page
// (Google/Microsoft). This endpoint creates the account registry entry.
emailRoutes.post("/accounts", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/emails/accounts");

  await supabase.from("email_accounts").insert({
    tenant_id: user.tenantId,
    user_id: user.id,
    provider: parsed.data.provider,
    email: parsed.data.email,
    active: true,
  });

  return c.redirect("/emails/accounts");
});

// POST /accounts/:id/sync -- update last_sync_at timestamp.
emailRoutes.post("/accounts/:id/sync", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("email_accounts")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/emails/accounts");
});

// POST /accounts/:id/delete -- delete account.
emailRoutes.post("/accounts/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("email_accounts")
    .delete()
    .eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/emails/accounts");
});

// POST /send -- send email via configured integration (Gmail or Outlook).
emailRoutes.post("/send", emailSendRateLimit, async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = composeSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/emails");

  const to = parsed.data.to_email;
  const subject = parsed.data.subject ?? "";
  const msgBody = parsed.data.body ?? "";

  // Find active Google or Microsoft integration for the tenant.
  const { data: googleInt } = await supabase
    .from("integrations")
    .select("config, access_token, connected_email")
    .eq("tenant_id", user.tenantId)
    .eq("type", "google")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const { data: msInt } = await supabase
    .from("integrations")
    .select("config, access_token, connected_email")
    .eq("tenant_id", user.tenantId)
    .eq("type", "microsoft")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  let fromEmail = "";
  let status = "draft";
  let statusMessage = "Configure uma integracao de email em Integracoes";

  const googleToken = (googleInt?.access_token as string) ?? ((googleInt?.config as Record<string, unknown>)?.access_token as string) ?? "";
  const msToken = (msInt?.access_token as string) ?? ((msInt?.config as Record<string, unknown>)?.access_token as string) ?? "";

  if (googleToken) {
    const result = await sendGmailEmail(
      (googleInt?.config as Record<string, unknown>) ?? {},
      googleToken,
      to,
      subject,
      msgBody,
    );
    fromEmail = (googleInt?.connected_email as string) ?? "";
    if (result.success) {
      status = "sent";
      statusMessage = result.message;
    } else {
      status = "failed";
      statusMessage = result.message;
    }
  } else if (msToken) {
    const result = await sendOutlookEmail(
      (msInt?.config as Record<string, unknown>) ?? {},
      msToken,
      to,
      subject,
      msgBody,
    );
    fromEmail = (msInt?.connected_email as string) ?? "";
    if (result.success) {
      status = "sent";
      statusMessage = result.message;
    } else {
      status = "failed";
      statusMessage = result.message;
    }
  }

  await supabase.from("email_messages").insert({
    tenant_id: user.tenantId,
    direction: "outbound",
    from_email: fromEmail,
    to_email: to,
    subject: subject || null,
    body: msgBody || null,
    case_id: parsed.data.case_id || null,
    client_id: parsed.data.client_id || null,
    read: true,
    status,
    status_message: statusMessage,
  });

  return c.redirect("/emails");
});

// GET /:id -- view email detail.
emailRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: msg } = await supabase
    .from("email_messages")
    .select("id, from_email, to_email, subject, body, direction, read, received_at, created_at, case_id, client_id, cases(title), clients(name)")
    .eq("id", id).eq("tenant_id", user.tenantId).single();

  if (!msg) return c.html("E-mail nao encontrado.", 404);

  const caseTitle = (msg.cases as unknown as { title: string } | null)?.title;
  const clientName = (msg.clients as unknown as { name: string } | null)?.name;

  return renderPage(
    c,
    { title: msg.subject ?? "E-mail", active: "emails" },
    <>
      <PageHeader title={msg.subject ?? "(sem assunto)"} icon="ph-envelope-open" />
      <Panel title="Detalhes do E-mail" icon="ph-envelope-open">
        <dl class="flex flex-col gap-2 mb-4">
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">De:</dt><dd class="text-gray-900">{msg.from_email ?? "-"}</dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Para:</dt><dd class="text-gray-900">{msg.to_email ?? "-"}</dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Assunto:</dt><dd class="text-gray-900">{msg.subject ?? "-"}</dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Data:</dt><dd class="text-gray-900">{msg.received_at ? new Date(msg.received_at).toLocaleString("pt-BR") : new Date(msg.created_at).toLocaleString("pt-BR")}</dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Direcao:</dt><dd><Badge color={msg.direction === "inbound" ? "blue" : "gray"}>{msg.direction === "inbound" ? "Recebida" : "Enviada"}</Badge></dd></div>
          {caseTitle ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Processo:</dt><dd><a href={`/cases/${msg.case_id}`} class="text-[#0568ff] hover:underline">{caseTitle}</a></dd></div> : null}
          {clientName ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Cliente:</dt><dd><a href={`/clients/${msg.client_id}`} class="text-[#0568ff] hover:underline">{clientName}</a></dd></div> : null}
        </dl>
        <div class="border-t border-gray-200 pt-4">
          <div class="text-body-sm font-semibold text-gray-700 mb-2">Mensagem</div>
          <div class="text-body text-gray-800 whitespace-pre-wrap">{msg.body ?? "(sem conteudo)"}</div>
        </div>
        {!msg.read ? (
          <div class="mt-4">
            <form method="post" action={`/emails/${id}/read`}>
              <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-envelope-open" aria-hidden="true"></i>Marcar como Lida</button>
            </form>
          </div>
        ) : null}
      </Panel>
    </>,
  );
});

// POST /:id/read -- mark as read.
emailRoutes.post("/:id/read", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("email_messages")
    .update({ read: true })
    .eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect(`/emails/${id}`);
});
