import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  fetchWhatsAppTemplates,
  isWithin24HourWindow,
  isOptedOut,
  validateE164,
  normalizePhone,
  type IntegrationConfig,
} from "../lib/integrations";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const whatsappRoutes = new Hono<AppEnv>();

whatsappRoutes.use("*", requireAuth);
whatsappRoutes.use("*", requireRole("socio", "admin", "advogado"));

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

// GET / -- dashboard.
whatsappRoutes.get("/", async (c) => {
  const user = c.get("user");

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  // Read sync/error banners from query params.
  const syncStatus = c.req.query("sync");
  const syncMsg = c.req.query("msg");
  const errorMsg = c.req.query("error");

  const [sentRes, receivedRes, deliveredRes, recentRes, clientsRes, templatesRes] = await Promise.all([
    supabase.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("direction", "outbound"),
    supabase.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("direction", "inbound"),
    supabase.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId).eq("direction", "outbound").eq("status", "sent"),
    supabase.from("whatsapp_messages")
      .select("id, phone, direction, message, status, opt_out_status, created_at, clients(name)", { count: "exact" })
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from("clients")
      .select("id, name, phone")
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null)
      .order("name"),
    supabase.from("whatsapp_templates")
      .select("id, name, category, language, status, external_template_id")
      .eq("tenant_id", user.tenantId)
      .order("name"),
  ]);

  const clientOptions = [{ value: "", label: "Nenhum" }, ...(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))];
  const bulkClientOptions = [{ value: "", label: "Todos os clientes" }, ...(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))];

  // Template options for dropdowns (only approved templates).
  const dbTemplates = templatesRes.data ?? [];
  const templateOptions = [
    { value: "", label: "Nenhum (apenas dentro de 24h)" },
    ...dbTemplates
      .filter((t) => t.status === "approved")
      .map((t) => ({ value: t.name, label: `${t.name} (${t.language})` })),
  ];

  const sentCount = sentRes.count ?? 0;
  const receivedCount = receivedRes.count ?? 0;
  const deliveredCount = deliveredRes.count ?? 0;
  const deliveryRate = sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 0;

  const totalCount = recentRes.count ?? 0;
  const totalPages = totalCount ? Math.ceil(totalCount / limit) : 1;

  const rows = (recentRes.data ?? []).map((m) => [
    (m.clients as unknown as { name: string } | null)?.name ?? "-",
    m.phone ?? "-",
    m.message.length > 60 ? m.message.slice(0, 60) + "..." : m.message,
    <Badge color={m.direction === "inbound" ? "blue" : "gray"}>{m.direction === "inbound" ? "Recebida" : "Enviada"}</Badge> as unknown as string,
    <Badge color={m.status === "sent" ? "green" : m.status === "failed" ? "red" : "yellow"}>{m.status}</Badge> as unknown as string,
    m.opt_out_status === "opted_out"
      ? <Badge color="red">Opt-out</Badge> as unknown as string
      : <Badge color="gray">-</Badge> as unknown as string,
    new Date(m.created_at).toLocaleString("pt-BR"),
    <a href={`/whatsapp/${m.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
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
            <form method="post" action="/whatsapp/sync-templates" class="inline">
              <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Sincronizar Templates</button>
            </form>
            <a href="/whatsapp/templates" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-files" aria-hidden="true"></i>Templates</a>
            <Modal
              id="bulk-whatsapp"
              title="Enviar em Massa"
              icon="ph-users-three"
              triggerText="Envio em Massa"
              triggerIcon="ph-users-three"
              triggerVariant="secondary"
              action="/whatsapp/bulk"
              submitLabel="Enviar para todos"
              submitIcon="ph-paper-plane-tilt"
            >
              <Select label="Template (obrigatorio)" id="bulk_template_name" name="template_name" options={templateOptions.filter((o) => o.value !== "")} required icon="ph-files" />
              <Textarea label="Mensagem (opcional, anexo ao template)" id="bulk_message" name="message" rows={3} />
              <ComboBox label="Filtrar por cliente (opcional)" id="bulk_client_id" name="client_id" options={bulkClientOptions} />
              <p class="text-body-sm text-status-red -mt-2"><i class="ph ph-warning" aria-hidden="true"></i> Envio em massa usa templates aprovados. Cada cliente sera verificado por opt-out.</p>
            </Modal>
            <Modal
              id="send-whatsapp"
              title="Enviar Mensagem"
              icon="ph-paper-plane-tilt"
              triggerText="Enviar Mensagem"
              triggerIcon="ph-paper-plane-tilt"
              action="/whatsapp/send"
              submitLabel="Enviar"
              submitIcon="ph-paper-plane-tilt"
            >
              <ComboBox label="Cliente" id="client_id" name="client_id" options={clientOptions} />
              <TextField label="Telefone" id="phone" name="phone" required placeholder="+5511999999999" icon="ph-phone" />
              <Select label="Template (opcional)" id="template_name" name="template_name" options={templateOptions} icon="ph-files" />
              <Textarea label="Mensagem" id="message" name="message" rows={5} required />
              <p class="text-body-sm text-gray-500 -mt-2"><i class="ph ph-info" aria-hidden="true"></i> Se o cliente nao enviou mensagem nas ultimas 24h, selecione um template aprovado.</p>
            </Modal>
          </div>
        )}
      />
      {syncStatus ? (
        <div class={`mb-4 p-3 border border-gray-200 flex items-start gap-2 ${syncStatus === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"}`}>
          <i class={`ph ${syncStatus === "ok" ? "ph-check-circle" : "ph-warning-circle"} text-h4`} aria-hidden="true"></i>
          <div>
            <div class="font-semibold text-body-sm">{syncStatus === "ok" ? "Operacao concluida" : "Falha na operacao"}</div>
            {syncMsg ? <div class="text-body-sm">{decodeURIComponent(syncMsg)}</div> : null}
          </div>
        </div>
      ) : null}
      {errorMsg ? (
        <div class="mb-4 p-3 border border-gray-200 flex items-start gap-2 bg-red-50 text-red-800 border-red-200">
          <i class="ph ph-warning-circle text-h4" aria-hidden="true"></i>
          <div>
            <div class="font-semibold text-body-sm">Erro</div>
            <div class="text-body-sm">{decodeURIComponent(errorMsg)}</div>
          </div>
        </div>
      ) : null}
      <div class="mb-4 p-4 border border-amber-200 bg-amber-50 rounded-md flex items-start gap-3">
        <i class="ph ph-shield-warning text-h4 text-amber-600 mt-0.5" aria-hidden="true"></i>
        <div class="text-body-sm text-amber-800">
          <div class="font-semibold mb-1">Conformidade com a Meta</div>
          <ul class="list-disc list-inside space-y-0.5">
            <li>Mensagens fora da janela de 24h requerem templates aprovados pela Meta.</li>
            <li>Contatos que enviaram STOP nao podem receber mensagens.</li>
            <li>Configure a integracao WhatsApp em <a href="/integrations" class="underline font-semibold">Integracoes</a> antes de enviar.</li>
          </ul>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-4">
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-paper-plane-tilt text-h3 text-[#0568ff]" aria-hidden="true"></i>Total Enviadas
          </div>
          <div class="text-h1 font-bold text-[#0568ff]">{sentCount}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-tray text-h3 text-[#0568ff]" aria-hidden="true"></i>Total Recebidas
          </div>
          <div class="text-h1 font-bold text-[#0568ff]">{receivedCount}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500 mb-1">
            <i class="ph ph-check-circle text-h3 text-[#0568ff]" aria-hidden="true"></i>Taxa de Entrega
          </div>
          <div class="text-h1 font-bold text-[#0568ff]">{deliveryRate}%</div>
        </Panel>
      </div>
      <Table
        columns={[
          { label: "Cliente" }, { label: "Telefone" }, { label: "Mensagem" },
          { label: "Direcao" }, { label: "Status" }, { label: "Opt-out" }, { label: "Data" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma mensagem encontrada."
        emptyIcon="ph-whatsapp-logo"
        ariaLabel="Mensagens recentes"
        count={totalCount}
        countLabel="mensagem(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/whatsapp",
        }}
      />
    </>,
  );
});

// POST /send -- create outbound message and send via WhatsApp Business API.
whatsappRoutes.post("/send", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const phoneRaw = String(body.phone ?? "");
  const message = String(body.message ?? "");
  const templateName = String(body.template_name ?? "");
  const clientId = String(body.client_id ?? "") || null;

  // Validate phone
  const phone = normalizePhone(phoneRaw);
  if (!validateE164(phone)) {
    return c.redirect(`/whatsapp?error=${encodeURIComponent("Telefone invalido. Use formato E.164: +5511999999999")}`);
  }

  // Check opt-out
  const optedOut = await isOptedOut(user.tenantId, phone);
  if (optedOut) {
    return c.redirect(`/whatsapp?error=${encodeURIComponent("Este contato optou por nao receber mensagens (STOP). Nao e possivel enviar.")}`);
  }

  // Find WhatsApp integration
  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", user.tenantId)
    .eq("type", "whatsapp")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return c.redirect(`/whatsapp?error=${encodeURIComponent("Configure a integracao WhatsApp em Integracoes antes de enviar.")}`);
  }

  const config = integration.config as IntegrationConfig;

  // Check 24-hour window
  const { within, lastMessageAt } = await isWithin24HourWindow(user.tenantId, phone);

  let result;
  if (within) {
    result = await sendWhatsAppMessage(config, phone, message);
  } else if (templateName) {
    result = await sendWhatsAppTemplate(config, phone, templateName);
  } else {
    const lastMsg = lastMessageAt ? lastMessageAt.toLocaleString("pt-BR") : "nunca";
    return c.redirect(`/whatsapp?error=${encodeURIComponent(`Fora da janela de 24h (ultima msg do cliente: ${lastMsg}). Use um template aprovado para mensagens business-initiated.`)}`);
  }

  // Save to database
  const msgId = result.success ? (result.data as { messageId?: string })?.messageId : null;
  await supabase.from("whatsapp_messages").insert({
    tenant_id: user.tenantId,
    client_id: clientId,
    phone,
    direction: "outbound",
    message: templateName && !within ? `[Template: ${templateName}] ${message}` : message,
    status: result.success ? "sent" : "failed",
    template_name: templateName || null,
    external_message_id: msgId,
    error_message: result.success ? null : result.message,
  });

  const status = result.success ? "ok" : "error";
  const msg = encodeURIComponent(result.message);
  return c.redirect(`/whatsapp?sync=${status}&msg=${msg}`);
});

// POST /sync-templates -- sync templates from Meta.
whatsappRoutes.post("/sync-templates", async (c) => {
  const user = c.get("user");
  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", user.tenantId)
    .eq("type", "whatsapp")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return c.redirect("/whatsapp?error=" + encodeURIComponent("Integracao WhatsApp nao configurada."));
  }

  const config = integration.config as IntegrationConfig;
  const result = await fetchWhatsAppTemplates(config);

  if (!result.success) {
    return c.redirect("/whatsapp?error=" + encodeURIComponent(result.message));
  }

  const templates = result.data as { id: string; name: string; status: string; category: string; language: string; components: unknown[] }[];
  let synced = 0;

  for (const tpl of templates) {
    await supabase.from("whatsapp_templates").upsert({
      tenant_id: user.tenantId,
      name: tpl.name,
      category: tpl.category,
      language: tpl.language,
      components: JSON.stringify(tpl.components),
      status: tpl.status,
      external_template_id: tpl.id,
      approved_at: tpl.status === "approved" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "external_template_id" });
    synced++;
  }

  return c.redirect(`/whatsapp?sync=ok&msg=${encodeURIComponent(`${synced} templates sincronizados com a Meta.`)}`);
});

// GET /templates -- show approved templates list.
whatsappRoutes.get("/templates", async (c) => {
  const user = c.get("user");

  const { data: dbTemplates } = await supabase
    .from("whatsapp_templates")
    .select("id, name, category, language, status, external_template_id")
    .eq("tenant_id", user.tenantId)
    .order("name");

  const rows = (dbTemplates ?? []).map((t) => [
    t.name,
    `${t.category} / ${t.language}`,
    <Badge color={t.status === "approved" ? "green" : t.status === "rejected" ? "red" : "yellow"}>{t.status}</Badge> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Templates", active: "whatsapp" },
    <>
      <PageHeader
        title="Templates"
        icon="ph-files"
        actions={() => (
          <form method="post" action="/whatsapp/sync-templates" class="inline">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Sincronizar com a Meta</button>
          </form>
        )}
      />
      <Table
        columns={[{ label: "Nome" }, { label: "Categoria / Idioma" }, { label: "Status" }]}
        rows={rows}
        emptyMsg="Nenhum template encontrado. Sincronize com a Meta."
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
    .select("id, phone, direction, message, status, template_name, opt_out_status, external_message_id, created_at, client_id, clients(name)")
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
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Cliente:</dt><dd class="text-gray-900">{clientName ? <a href={`/clients/${msg.client_id}`} class="text-[#0568ff] hover:underline">{clientName}</a> : "-"}</dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Telefone:</dt><dd class="text-gray-900">{msg.phone ?? "-"}</dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Direcao:</dt><dd><Badge color={msg.direction === "inbound" ? "blue" : "gray"}>{msg.direction === "inbound" ? "Recebida" : "Enviada"}</Badge></dd></div>
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Status:</dt><dd><Badge color={msg.status === "sent" ? "green" : msg.status === "failed" ? "red" : "yellow"}>{msg.status}</Badge></dd></div>
          {msg.opt_out_status ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Opt-out:</dt><dd><Badge color={msg.opt_out_status === "opted_out" ? "red" : "gray"}>{msg.opt_out_status}</Badge></dd></div> : null}
          {msg.template_name ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Template:</dt><dd class="text-gray-900">{msg.template_name}</dd></div> : null}
          {msg.external_message_id ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">ID Meta:</dt><dd class="text-gray-900 font-mono text-body-xs">{msg.external_message_id}</dd></div> : null}
          <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-24">Data:</dt><dd class="text-gray-900">{new Date(msg.created_at).toLocaleString("pt-BR")}</dd></div>
        </dl>
        <div class="border-t border-gray-200 pt-4">
          <div class="text-body-sm font-semibold text-gray-700 mb-2">Mensagem</div>
          <div class="text-body text-gray-800 whitespace-pre-wrap">{msg.message}</div>
        </div>
      </Panel>
    </>,
  );
});

// POST /bulk -- send template messages to all/filtered clients.
whatsappRoutes.post("/bulk", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const templateName = String(body.template_name ?? "");
  const message = String(body.message ?? "");

  if (!templateName) {
    return c.redirect(`/whatsapp?error=${encodeURIComponent("Envio em massa requer um template aprovado.")}`);
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", user.tenantId)
    .eq("type", "whatsapp")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return c.redirect(`/whatsapp?error=${encodeURIComponent("Configure a integracao WhatsApp em Integracoes.")}`);
  }

  const config = integration.config as IntegrationConfig;

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, phone")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .not("phone", "is", null);

  let sent = 0, failed = 0, skipped = 0;

  for (const client of clients ?? []) {
    const phone = normalizePhone(client.phone ?? "");
    if (!validateE164(phone)) { skipped++; continue; }

    const optedOut = await isOptedOut(user.tenantId, phone);
    if (optedOut) { skipped++; continue; }

    const result = await sendWhatsAppTemplate(config, phone, templateName);
    if (result.success) {
      sent++;
      const msgId = (result.data as { messageId?: string })?.messageId;
      await supabase.from("whatsapp_messages").insert({
        tenant_id: user.tenantId, client_id: client.id, phone,
        direction: "outbound", message: `[Template: ${templateName}]`,
        status: "sent", template_name: templateName, external_message_id: msgId,
      });
    } else {
      failed++;
      await supabase.from("whatsapp_messages").insert({
        tenant_id: user.tenantId, client_id: client.id, phone,
        direction: "outbound", message: `[Template: ${templateName}]`,
        status: "failed", template_name: templateName, error_message: result.message,
      });
    }

    // Basic rate limiting: 1 second between sends
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const msg = encodeURIComponent(`${sent} enviadas, ${failed} falharam, ${skipped} puladas (opt-out ou telefone invalido).`);
  return c.redirect(`/whatsapp?sync=ok&msg=${msg}`);
});
