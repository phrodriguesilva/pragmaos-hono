import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage, getNonce } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge } from "../components/ui";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { APP_URL } from "../lib/env";
import { appCss } from "../generated/css";
import { portalLoginRateLimit } from "../lib/rate-limit";
import type { Context } from "hono";

export const portalRoutes = new Hono<AppEnv>();

// === Client auth helper ===

async function getClientFromCookie(c: Context<AppEnv>) {
  const token = getCookie(c, "client-session");
  if (!token) return null;

  const { data: session } = await supabase
    .from("client_sessions")
    .select("client_id, expires_at")
    .eq("token", token)
    .single();

  if (!session || new Date(session.expires_at) < new Date()) return null;

  const { data: access } = await supabase
    .from("client_portal_access")
    .select("client_id, email, active")
    .eq("client_id", session.client_id)
    .eq("active", true)
    .single();

  if (!access) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, phone, tenant_id")
    .eq("id", session.client_id)
    .single();

  return client;
}

// Minimal layout for client portal pages.
function clientLayout(title: string, clientName: string, children: unknown) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - Portal do Cliente - PragmaOS</title>
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <script src="/static/js/alpine.min.js" defer nonce={getNonce()} />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
      </head>
      <body class="bg-gray-50 text-body font-sans min-h-screen antialiased">
        <header class="text-white px-8 py-4 flex items-center justify-between shadow-md" style="background: linear-gradient(135deg, #232856 0%, #0568ff 100%);">
          <div class="flex items-center gap-2.5">
            <img src="/static/img/pragmaos-logo.png" alt="PragmaOS" class="h-7 w-auto brightness-0 invert" />
            <span class="text-body-sm text-white/80 font-normal">Portal do Cliente</span>
          </div>
          <div class="flex items-center gap-5 text-body-sm">
            <span class="flex items-center gap-2"><div class="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white text-body-xs font-bold">{clientName.charAt(0).toUpperCase()}</div>{clientName}</span>
            <a href="/portal/logout" class="flex items-center gap-1.5 hover:text-white text-white/80"><i class="ph ph-sign-out" aria-hidden="true" />Sair</a>
          </div>
        </header>
        <nav class="px-8 py-3 flex gap-1 text-body-sm text-white" style="background: linear-gradient(180deg, #0568ff 0%, #232856 100%);">
          <a href="/portal/home" class="hover:bg-white/10 px-4 py-2 rounded-lg flex items-center gap-2 transition-all"><i class="ph ph-house" aria-hidden="true" />Inicio</a>
          <a href="/portal/cases" class="hover:bg-white/10 px-4 py-2 rounded-lg flex items-center gap-2 transition-all"><i class="ph ph-folder-open" aria-hidden="true" />Processos</a>
          <a href="/portal/documents" class="hover:bg-white/10 px-4 py-2 rounded-lg flex items-center gap-2 transition-all"><i class="ph ph-file-text" aria-hidden="true" />Documentos</a>
          <a href="/portal/messages" class="hover:bg-white/10 px-4 py-2 rounded-lg flex items-center gap-2 transition-all"><i class="ph ph-chats-circle" aria-hidden="true" />Mensagens</a>
          <a href="/portal/invoices" class="hover:bg-white/10 px-4 py-2 rounded-lg flex items-center gap-2 transition-all"><i class="ph ph-receipt" aria-hidden="true" />Faturas</a>
        </nav>
        <main class="max-w-4xl mx-auto p-8">{children}</main>
      </body>
    </html>
  );
}

// === ROOT: redirect to staff dashboard or client login ===

portalRoutes.get("/", (c) => {
  // If user has a staff session, go to staff dashboard; otherwise client login.
  const staffCookie = getCookie(c, "sb-access-token");
  if (staffCookie) return c.redirect("/portal/staff");
  return c.redirect("/portal/login");
});

// === STAFF ROUTES (requireAuth) ===

portalRoutes.use("/staff/*", requireAuth);

// GET /portal/staff -- staff dashboard.
portalRoutes.get("/staff", async (c) => {
  const user = c.get("user");

  const [accessRes, messagesRes, clientsRes] = await Promise.all([
    supabase.from("client_portal_access").select("id, email, active, last_login_at, clients(name)").eq("tenant_id", user.tenantId).order("created_at", { ascending: false }),
    supabase.from("client_messages").select("id, subject, body, direction, read, created_at, clients(name)").eq("tenant_id", user.tenantId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(10),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const accessRows = (accessRes.data ?? []).map((a) => {
    const clientName = (a.clients as unknown as { name: string } | null)?.name ?? "-";
    return [
      clientName,
      a.email,
      a.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge> as unknown as string,
      a.last_login_at ? new Date(a.last_login_at).toLocaleDateString("pt-BR") : "Nunca",
    ];
  });

  const messageRows = (messagesRes.data ?? []).map((m) => {
    const clientName = (m.clients as unknown as { name: string } | null)?.name ?? "-";
    return [
      clientName,
      m.subject ?? "-",
      m.body.length > 60 ? m.body.slice(0, 60) + "..." : m.body,
      new Date(m.created_at).toLocaleString("pt-BR"),
      m.read ? <Badge color="gray">Lida</Badge> : <Badge color="blue">Nova</Badge> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Portal do Cliente", active: "portal" },
    <>
      <PageHeader title="Portal do Cliente" icon="ph-globe" />

      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Clientes com acesso" icon="ph-users">
          <Table
            columns={[{ label: "Cliente", icon: "ph-user" }, { label: "Email", icon: "ph-envelope" }, { label: "Status", icon: "ph-circle-half" }, { label: "Ultimo login", icon: "ph-clock" }]}
            rows={accessRows}
            emptyMsg="Nenhum cliente com acesso ao portal."
            emptyIcon="ph-globe"
          />
        </Panel>
        <Panel title="Mensagens recebidas" icon="ph-chats-circle">
          <Table
            columns={[{ label: "Cliente", icon: "ph-user" }, { label: "Assunto", icon: "ph-text-aa" }, { label: "Mensagem", icon: "ph-chat" }, { label: "Data", icon: "ph-calendar" }, { label: "Status", icon: "ph-circle-half" }]}
            rows={messageRows}
            emptyMsg="Nenhuma mensagem de cliente."
            emptyIcon="ph-chats-circle"
          />
        </Panel>
      </div>

      <Panel title="Gerenciar acesso" icon="ph-key">
        <p class="text-body-sm text-gray-600 mb-3">Para habilitar o acesso ao portal para um cliente, selecione o cliente abaixo. O sistema criara credenciais de acesso.</p>
        <form method="get" action="/portal/staff/enable" class="flex gap-2 items-end">
          <ComboBox label="Cliente" id="client_id" name="client_id" required icon="ph-users"
            options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-key" aria-hidden="true" />Habilitar acesso
          </button>
        </form>
      </Panel>
    </>,
  );
});

// GET /portal/staff/enable -- staff enables portal access for a client.
portalRoutes.get("/staff/enable", async (c) => {
  const user = c.get("user");
  const clientId = c.req.query("client_id") ?? "";

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("name");

  const selectedClient = (clients ?? []).find((cl) => cl.id === clientId);

  return renderPage(
    c,
    { title: "Habilitar Portal", active: "portal" },
    <>
      <PageHeader title="Habilitar Acesso ao Portal" icon="ph-key" />
      <Panel>
        <form method="post" action="/portal/staff/enable" class="flex flex-col gap-4">
          <ComboBox label="Cliente" id="client_id" name="client_id" required selected={clientId} icon="ph-users"
            options={(clients ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <TextField label="Email de acesso" id="email" name="email" type="email" required icon="ph-envelope"
            value={selectedClient?.email ?? ""} placeholder="cliente@email.com"
          />
          <TextField label="Senha inicial" id="password" name="password" required icon="ph-lock"
            placeholder="Senha temporaria (min 6 caracteres)"
          />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-check" aria-hidden="true" />Habilitar
            </button>
            <a href="/portal/staff" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-x" aria-hidden="true" />Cancelar
            </a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

const portalStaffSchema = z.object({
  client_id: z.string().uuid().max(36),
  email: z.string().email().max(255),
  password: z.string().min(8).max(1024),
  name: z.string().max(255).optional(),
});

// POST /portal/staff/enable -- create portal access.
portalRoutes.post("/staff/enable", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = portalStaffSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/portal/staff/enable");
  const { client_id: clientId, email, password } = parsed.data;

  // Create auth user via Supabase Admin.
  const { data: authData, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !authData.user) {
    return renderPage(c, { title: "Erro", active: "portal" }, <>
      <PageHeader title="Erro" icon="ph-warning" />
      <Panel><div class="text-status-red">Erro: {error?.message ?? "falha ao criar usuario"}</div></Panel>
    </>);
  }

  await supabase.from("client_portal_access").insert({
    tenant_id: user.tenantId,
    client_id: clientId,
    email,
    password_hash: "managed-by-supabase-auth",
    active: true,
  });

  return c.redirect("/portal/staff");
});

// GET /portal/staff/messages -- staff views all messages.
portalRoutes.get("/staff/messages", async (c) => {
  const user = c.get("user");
  const { data: messages } = await supabase
    .from("client_messages")
    .select("id, subject, body, direction, read, created_at, clients(name), client_id")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (messages ?? []).map((m) => {
    const clientName = (m.clients as unknown as { name: string } | null)?.name ?? "-";
    return [
      clientName,
      <Badge color={m.direction === "inbound" ? "blue" : "gray"} icon={m.direction === "inbound" ? "ph-arrow-down-left" : "ph-arrow-up-right"}>{m.direction === "inbound" ? "Recebida" : "Enviada"}</Badge> as unknown as string,
      m.subject ?? "-",
      m.body.length > 60 ? m.body.slice(0, 60) + "..." : m.body,
      new Date(m.created_at).toLocaleString("pt-BR"),
    ];
  });

  return renderPage(c, { title: "Mensagens do Portal", active: "portal" }, <>
    <PageHeader title="Mensagens do Portal" icon="ph-chats-circle" />
    <Table
      columns={[{ label: "Cliente", icon: "ph-user" }, { label: "Direcao", icon: "ph-arrows-left-right" }, { label: "Assunto", icon: "ph-text-aa" }, { label: "Mensagem", icon: "ph-chat" }, { label: "Data", icon: "ph-calendar" }]}
      rows={rows}
      emptyMsg="Nenhuma mensagem."
      emptyIcon="ph-chats-circle"
    />
  </>);
});

// === CLIENT ROUTES (separate auth) ===

// GET /portal/login -- client login form.
portalRoutes.get("/login", (c) => {
  return c.html(
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Portal do Cliente - PragmaOS</title>
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <script src="/static/js/alpine.min.js" defer nonce={getNonce()} />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
      </head>
      <body class="bg-[#232856] text-body font-sans min-h-screen flex items-center justify-center">
        <div class="w-full max-w-sm border border-carvao-700 bg-white p-8">
          <div class="flex flex-col items-center mb-2">
            <img src="/static/img/pragmaos-logo.png" alt="PragmaOS" class="h-10 w-auto mb-2" />
          </div>
          <p class="text-body-sm text-gray-500 mb-6">Portal do Cliente — acesse seus processos e documentos.</p>
          <form method="post" action="/portal/login" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <label for="email" class="text-body-sm font-semibold text-gray-700">Email<span class="text-status-red"> *</span></label>
              <div class="relative">
                <i class="ph ph-envelope absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400" aria-hidden="true" />
                <input id="email" name="email" type="email" required placeholder="voce@email.com" class="input pl-7" />
              </div>
            </div>
            <div {...{ "x-data": "{ show: false }" }} class="flex flex-col gap-1">
              <label for="password" class="text-body-sm font-semibold text-gray-700">Senha<span class="text-status-red"> *</span></label>
              <div class="relative">
                <i class="ph ph-lock absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400" aria-hidden="true" />
                <input id="password" name="password" type="password" required placeholder="********" autocomplete="current-password" class="input pl-7 pr-7" {...{ ":type": "show ? 'text' : 'password'" }} />
                <button type="button" {...{ "@click": "show = !show" }} aria-label="Mostrar senha" class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 px-1">
                  <i {...{ ":class": "show ? 'ph ph-eye-slash' : 'ph ph-eye'" }} class="ph ph-eye text-body" aria-hidden="true" />
                </button>
              </div>
            </div>
            <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2">
              <i class="ph ph-sign-in" aria-hidden="true" />Entrar
            </button>
          </form>
        </div>
      </body>
    </html>,
  );
});

// POST /portal/login -- authenticate client.
portalRoutes.post("/login", portalLoginRateLimit, async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) return c.redirect("/portal/login");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return c.redirect("/portal/login");

  // Find client_portal_access by email.
  const { data: access } = await supabase
    .from("client_portal_access")
    .select("client_id, tenant_id, active")
    .eq("email", email)
    .eq("active", true)
    .single();

  if (!access) return c.redirect("/portal/login");

  // Create session token (256 bits of entropy).
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  await supabase.from("client_sessions").insert({
    tenant_id: access.tenant_id,
    client_id: access.client_id,
    token,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  // Update last_login_at.
  await supabase.from("client_portal_access").update({ last_login_at: new Date().toISOString() }).eq("email", email);

  setCookie(c, "client-session", token, {
    httpOnly: true,
    secure: APP_URL.startsWith("https"),
    sameSite: "Strict",
    path: "/",
    maxAge: 86400,
  });

  return c.redirect("/portal/home");
});

// GET /portal/home -- client dashboard.
portalRoutes.get("/home", async (c) => {
  const client = await getClientFromCookie(c);
  if (!client) return c.redirect("/portal/login");

  const [casesRes, messagesRes, invoicesRes] = await Promise.all([
    supabase.from("cases").select("id, title, case_number, case_type, status").eq("client_id", client.id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("client_messages").select("id, subject, direction, read, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("honorarios").select("id, description, amount_cents, status, due_date").eq("client_id", client.id).neq("status", "cancelled").order("due_date", { ascending: true }).limit(5),
  ]);

  const fmt = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  return c.html(clientLayout("Inicio", client.name,
    <>
      <h1 class="text-h1 font-bold text-gray-900 mb-4">Ola, {client.name}</h1>

      <div class="grid grid-cols-3 gap-4 mb-6">
        <Panel><div class="text-body-sm text-gray-500 flex items-center gap-1"><i class="ph ph-folder-open" aria-hidden="true" />Processos</div><div class="text-h1 font-bold text-[#0568ff]">{casesRes.data?.length ?? 0}</div></Panel>
        <Panel><div class="text-body-sm text-gray-500 flex items-center gap-1"><i class="ph ph-chats-circle" aria-hidden="true" />Mensagens</div><div class="text-h1 font-bold text-[#0568ff]">{messagesRes.data?.length ?? 0}</div></Panel>
        <Panel><div class="text-body-sm text-gray-500 flex items-center gap-1"><i class="ph ph-receipt" aria-hidden="true" />Faturas pendentes</div><div class="text-h1 font-bold text-status-yellow">{invoicesRes.data?.length ?? 0}</div></Panel>
      </div>

      <Panel title="Meus processos" icon="ph-folder-open">
        <Table
          columns={[{ label: "Titulo", icon: "ph-text-aa" }, { label: "Numero", icon: "ph-hash" }, { label: "Tipo", icon: "ph-tag" }, { label: "Status", icon: "ph-circle-half" }]}
          rows={(casesRes.data ?? []).map((cs) => [
            <a href={`/portal/cases/${cs.id}`} class="text-[#0568ff] hover:underline">{cs.title}</a> as unknown as string,
            cs.case_number ?? "-",
            cs.case_type,
            <Badge color={cs.status === "active" ? "green" : cs.status === "suspended" ? "yellow" : "gray"}>{cs.status === "active" ? "Ativo" : cs.status === "suspended" ? "Suspenso" : "Arquivado"}</Badge> as unknown as string,
          ])}
          emptyMsg="Nenhum processo vinculado."
          emptyIcon="ph-folder-open"
        />
      </Panel>

      {(invoicesRes.data ?? []).length > 0 ? (
        <div class="mt-4">
          <Panel title="Faturas pendentes" icon="ph-receipt">
            <Table
              columns={[{ label: "Descricao", icon: "ph-text-aa" }, { label: "Valor", icon: "ph-currency-dollar" }, { label: "Vencimento", icon: "ph-calendar" }, { label: "Status", icon: "ph-circle-half" }]}
              rows={(invoicesRes.data ?? []).map((inv) => [
                inv.description,
                fmt(inv.amount_cents),
                inv.due_date ? new Date(inv.due_date).toLocaleDateString("pt-BR") : "-",
                <Badge color={inv.status === "overdue" ? "red" : "yellow"}>{inv.status === "overdue" ? "Atrasado" : "Pendente"}</Badge> as unknown as string,
              ])}
            />
          </Panel>
        </div>
      ) : null}
    </>,
  ));
});

// GET /portal/cases -- client sees their cases.
portalRoutes.get("/cases", async (c) => {
  const client = await getClientFromCookie(c);
  if (!client) return c.redirect("/portal/login");

  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, case_number, case_type, status, tribunal, created_at")
    .eq("client_id", client.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return c.html(clientLayout("Meus Processos", client.name,
    <>
      <h1 class="text-h1 font-bold text-gray-900 mb-4">Meus Processos</h1>
      <Panel>
        <Table
          columns={[{ label: "Titulo", icon: "ph-text-aa" }, { label: "Numero", icon: "ph-hash" }, { label: "Tipo", icon: "ph-tag" }, { label: "Tribunal", icon: "ph-building" }, { label: "Status", icon: "ph-circle-half" }]}
          rows={(cases ?? []).map((cs) => [
            <a href={`/portal/cases/${cs.id}`} class="text-[#0568ff] hover:underline">{cs.title}</a> as unknown as string,
            cs.case_number ?? "-",
            cs.case_type,
            cs.tribunal ?? "-",
            <Badge color={cs.status === "active" ? "green" : cs.status === "suspended" ? "yellow" : "gray"}>{cs.status === "active" ? "Ativo" : cs.status === "suspended" ? "Suspenso" : "Arquivado"}</Badge> as unknown as string,
          ])}
          emptyMsg="Nenhum processo vinculado."
          emptyIcon="ph-folder-open"
        />
      </Panel>
    </>,
  ));
});

// GET /portal/cases/:id -- client sees case details.
portalRoutes.get("/cases/:id", async (c) => {
  const client = await getClientFromCookie(c);
  if (!client) return c.redirect("/portal/login");
  const id = c.req.param("id");

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, title, case_number, case_type, status, tribunal, district, court_branch, phase, opposing_party, description, created_at")
    .eq("id", id)
    .eq("client_id", client.id)
    .is("deleted_at", null)
    .single();

  if (!caseRow) return c.html("Processo nao encontrado.", 404);

  return c.html(clientLayout(caseRow.title, client.name,
    <>
      <h1 class="text-h1 font-bold text-gray-900 mb-4">{caseRow.title}</h1>
      <Panel title="Dados do processo" icon="ph-folder-open">
        <dl class="flex flex-col gap-2 text-body-sm">
          <div><dt class="font-semibold text-gray-700 inline">Numero: </dt><dd class="inline">{caseRow.case_number ?? "-"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{caseRow.case_type}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Tribunal: </dt><dd class="inline">{caseRow.tribunal ?? "-"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Comarca: </dt><dd class="inline">{caseRow.district ?? "-"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Vara: </dt><dd class="inline">{caseRow.court_branch ?? "-"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Fase: </dt><dd class="inline">{caseRow.phase ?? "-"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Parte contraria: </dt><dd class="inline">{caseRow.opposing_party ?? "-"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={caseRow.status === "active" ? "green" : "gray"}>{caseRow.status}</Badge></dd></div>
        </dl>
      </Panel>
      {caseRow.description ? (
        <div class="mt-4">
          <Panel title="Descricao" icon="ph-text-aa">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{caseRow.description}</p>
          </Panel>
        </div>
      ) : null}
    </>,
  ));
});

// GET /portal/documents -- client sees their documents.
portalRoutes.get("/documents", async (c) => {
  const client = await getClientFromCookie(c);
  if (!client) return c.redirect("/portal/login");

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, doc_type, created_at")
    .eq("client_id", client.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return c.html(clientLayout("Documentos", client.name,
    <>
      <h1 class="text-h1 font-bold text-gray-900 mb-4">Meus Documentos</h1>
      <Panel>
        <Table
          columns={[{ label: "Titulo", icon: "ph-file-text" }, { label: "Tipo", icon: "ph-tag" }, { label: "Data", icon: "ph-calendar" }]}
          rows={(docs ?? []).map((d) => [
            d.title,
            <Badge color="gray">{d.doc_type}</Badge> as unknown as string,
            new Date(d.created_at).toLocaleDateString("pt-BR"),
          ])}
          emptyMsg="Nenhum documento disponivel."
          emptyIcon="ph-file-text"
        />
      </Panel>
    </>,
  ));
});

// GET /portal/messages -- client sees messages.
portalRoutes.get("/messages", async (c) => {
  const client = await getClientFromCookie(c);
  if (!client) return c.redirect("/portal/login");

  const { data: messages } = await supabase
    .from("client_messages")
    .select("id, subject, body, direction, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  return c.html(clientLayout("Mensagens", client.name,
    <>
      <h1 class="text-h1 font-bold text-gray-900 mb-4">Mensagens</h1>

      <Panel title="Enviar mensagem" icon="ph-paper-plane-tilt">
        <form method="post" action="/portal/messages" class="flex flex-col gap-3">
          <TextField label="Assunto" id="subject" name="subject" required icon="ph-text-aa" />
          <Textarea label="Mensagem" id="body" name="body" rows={4} required />
          <button type="submit" class="btn btn-primary inline-flex items-center gap-1 self-start">
            <i class="ph ph-paper-plane-tilt" aria-hidden="true" />Enviar
          </button>
        </form>
      </Panel>

      <div class="mt-4">
        <Panel title="Historico de mensagens" icon="ph-chats-circle">
          <div class="flex flex-col gap-3">
            {(messages ?? []).length === 0 ? (
              <div class="text-body-sm text-gray-400 text-center py-4">
                <i class="ph ph-tray text-h2 block mb-1 text-gray-300" aria-hidden="true" />
                Nenhuma mensagem.
              </div>
            ) : (
              (messages ?? []).map((m) => (
                <div class={`border-b border-gray-200 pb-2 last:border-0 ${m.direction === "inbound" ? "" : "text-right"}`}>
                  <div class="text-body-sm text-gray-400 mb-1">
                    {m.direction === "inbound" ? "Voce" : "Escritorio"} - {new Date(m.created_at).toLocaleString("pt-BR")}
                  </div>
                  <div class="text-body-sm font-semibold text-gray-800">{m.subject ?? "(sem assunto)"}</div>
                  <div class="text-body-sm text-gray-600 mt-1">{m.body}</div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </>,
  ));
});

const portalMessageSchema = z.object({
  subject: z.string().max(200),
  body: z.string().max(10000),
});

// POST /portal/messages -- client sends a message.
portalRoutes.post("/messages", async (c) => {
  const client = await getClientFromCookie(c);
  if (!client) return c.redirect("/portal/login");

  const body = await c.req.parseBody();
  const parsed = portalMessageSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/portal/messages");
  const subject = parsed.data.subject.trim();
  const msgBody = parsed.data.body.trim();
  if (!subject || !msgBody) return c.redirect("/portal/messages");

  await supabase.from("client_messages").insert({
    tenant_id: client.tenant_id,
    client_id: client.id,
    direction: "inbound",
    subject,
    body: msgBody,
    read: false,
  });

  return c.redirect("/portal/messages");
});

// GET /portal/invoices -- client sees their invoices.
portalRoutes.get("/invoices", async (c) => {
  const client = await getClientFromCookie(c);
  if (!client) return c.redirect("/portal/login");

  const { data: invoices } = await supabase
    .from("honorarios")
    .select("id, description, type, amount_cents, status, due_date, paid_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const fmt = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const typeLabels: Record<string, string> = { contratual: "Contratual", sucumbencial: "Sucumbencial", exito: "Exito", mensalidade: "Mensalidade", parcelamento: "Parcelamento" };
  const statusLabels: Record<string, string> = { pending: "Pendente", paid: "Pago", overdue: "Atrasado", cancelled: "Cancelado" };

  return c.html(clientLayout("Faturas", client.name,
    <>
      <h1 class="text-h1 font-bold text-gray-900 mb-4">Minhas Faturas</h1>
      <Panel>
        <Table
          columns={[{ label: "Descricao", icon: "ph-text-aa" }, { label: "Tipo", icon: "ph-tag" }, { label: "Valor", icon: "ph-currency-dollar" }, { label: "Vencimento", icon: "ph-calendar" }, { label: "Status", icon: "ph-circle-half" }]}
          rows={(invoices ?? []).map((inv) => [
            inv.description,
            typeLabels[inv.type] ?? inv.type,
            fmt(inv.amount_cents),
            inv.due_date ? new Date(inv.due_date).toLocaleDateString("pt-BR") : "-",
            <Badge color={inv.status === "paid" ? "green" : inv.status === "overdue" ? "red" : inv.status === "cancelled" ? "gray" : "yellow"}>{statusLabels[inv.status] ?? inv.status}</Badge> as unknown as string,
          ])}
          emptyMsg="Nenhuma fatura."
          emptyIcon="ph-receipt"
        />
      </Panel>
    </>,
  ));
});

// POST /portal/logout -- clear client session.
portalRoutes.post("/logout", async (c) => {
  const token = getCookie(c, "client-session");
  if (token) {
    await supabase.from("client_sessions").delete().eq("token", token);
  }
  deleteCookie(c, "client-session", { path: "/" });
  return c.redirect("/portal/login");
});

// GET /portal/logout -- convenience redirect.
portalRoutes.get("/logout", (c) => {
  deleteCookie(c, "client-session", { path: "/" });
  return c.redirect("/portal/login");
});
