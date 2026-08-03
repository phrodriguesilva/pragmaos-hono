// Back-office routes — PragmaOS platform administration panel.
// Accessible only by platform admins (is_platform_admin = true).
// Cross-tenant: manages all tenants, users, subscriptions, revenue.
//
// Routes:
//   GET  /back-office              — Dashboard (MRR, tenants, users, churn)
//   GET  /back-office/tenants      — Tenant list with filters
//   GET  /back-office/tenants/:id  — Tenant detail (users, invoices, plan)
//   POST /back-office/tenants/:id/plan — Change tenant plan
//   POST /back-office/tenants/:id/suspend — Suspend tenant
//   POST /back-office/tenants/:id/reactivate — Reactivate tenant
//   GET  /back-office/users        — All users across tenants
//   GET  /back-office/subscriptions — Subscription overview
//   GET  /back-office/revenue      — Revenue analytics (MRR, ARPA, LTV, CAC)
//   GET  /back-office/leads        — Commercial leads from marketing
//   GET  /back-office/audit        — Platform audit log

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/types";
import { supabase } from "../lib/supabase";
import { requireAuth, requirePlatformAdmin } from "../lib/session";
import { getFlash, setFlash } from "../lib/flash";
import { appCss } from "../generated/css";
import { Panel, Table, Badge } from "../components/ui";
import { sanitizeILike } from "../lib/search-sanitize";
import type { FC, PropsWithChildren } from "hono/jsx";

export const backOfficeRoutes = new Hono<AppEnv>();

// Apply auth + platform admin check to all routes.
backOfficeRoutes.use("*", requireAuth, requirePlatformAdmin);

// ============================================================
// Layout — dedicated back-office shell (separate from tenant app)
// ============================================================

const NAV_ITEMS = [
  { href: "/back-office", label: "Dashboard", icon: "ph-gauge" },
  { href: "/back-office/tenants", label: "Escritórios", icon: "ph-buildings" },
  { href: "/back-office/users", label: "Usuários", icon: "ph-users" },
  { href: "/back-office/subscriptions", label: "Assinaturas", icon: "ph-credit-card" },
  { href: "/back-office/revenue", label: "Receita", icon: "ph-chart-line-up" },
  { href: "/back-office/leads", label: "Leads", icon: "ph-target" },
  { href: "/back-office/audit", label: "Auditoria", icon: "ph-shield-check" },
];

function BackOfficeLayout({ title, active, children }: { title: string; active: string; children: PropsWithChildren["children"] }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{title} — Back-office PragmaOS</title>
        <link rel="icon" href="/static/img/pragmaos-icon.png" type="image/png" />
        <link rel="preload" href="/static/fonts/Phosphor.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="preload" href="/static/fonts/Phosphor-Bold.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="preload" href="/static/fonts/PlusJakartaSans-400.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="preload" href="/static/fonts/PlusJakartaSans-700.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: `@font-face{font-family:"Phosphor";src:url("/static/fonts/Phosphor.woff2") format("woff2");font-display:swap}@font-face{font-family:"Phosphor-Bold";src:url("/static/fonts/Phosphor-Bold.woff2") format("woff2");font-display:swap}` }} />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <script src="/static/js/alpine.min.js" defer />
      </head>
      <body class="bg-gray-50 text-body font-sans antialiased" {...{ "x-data": "{ sidebarOpen: false }" }}>
        {/* Mobile overlay */}
        <div {...{ "x-show": "sidebarOpen", "@click": "sidebarOpen = false" }} x-cloak class="fixed inset-0 bg-black/50 z-40 lg:hidden" />

        {/* Sidebar — fixed, full height, white background */}
        <div
          {...{ ":class": "sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'", "@keydown.escape.window": "sidebarOpen = false" }}
          class="fixed top-0 left-0 z-50 h-screen w-sidebar overflow-y-auto border-r border-gray-200 bg-white transition-transform duration-200 flex flex-col"
        >
          {/* Logo */}
          <div class="px-5 py-5 border-b border-gray-100 flex flex-col gap-1">
            <img src="/static/img/pragmaos-logo.png" alt="PragmaOS" class="h-7 w-auto" />
            <div class="text-xs text-gray-400 font-medium tracking-wide uppercase">Back-office</div>
          </div>

          {/* Nav */}
          <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <a
                href={item.href}
                class={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active === item.href
                    ? "bg-[#0568ff] text-white font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-[#0568ff]"
                }`}
              >
                <i class={`ph-bold ${item.icon} text-lg`} aria-hidden="true" />
                {item.label}
              </a>
            ))}
          </nav>

          {/* Footer */}
          <div class="px-3 py-4 border-t border-gray-100">
            <a href="/dashboard" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-[#0568ff] transition">
              <i class="ph-bold ph-arrow-left text-lg" aria-hidden="true" />
              Voltar ao app
            </a>
            <a href="/logout" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-[#0568ff] transition">
              <i class="ph-bold ph-sign-out text-lg" aria-hidden="true" />
              Sair
            </a>
          </div>
        </div>

        {/* Main */}
        <div class="flex flex-col min-h-screen lg:ml-sidebar">
          {/* Mobile hamburger */}
          <button
            {...{ "@click": "sidebarOpen = true" }}
            class="lg:hidden fixed top-3 left-3 z-30 bg-white p-2 rounded-lg shadow-md border border-gray-100"
            aria-label="Abrir menu"
          >
            <i class="ph ph-list text-h4 text-gray-700" aria-hidden="true" />
          </button>

          {/* Topbar */}
          <header class="w-full h-16 flex items-center justify-between px-6 sticky top-0 z-30" style="background: linear-gradient(135deg, #232856 0%, #0568ff 100%);">
            <span class="text-h3 text-white font-semibold">{title}</span>
            <div class="flex items-center gap-3">
              <span class="badge bg-white/15 text-white">Platform Admin</span>
            </div>
          </header>

          {/* Content */}
          <main class="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ============================================================
// Stat card component
// ============================================================

const StatCard: FC<{ label: string; value: string; icon: string; trend?: string; trendUp?: boolean }> = ({ label, value, icon, trend, trendUp }) => (
  <div class="bg-white rounded-xl border border-gray-200 p-5">
    <div class="flex items-start justify-between mb-3">
      <div class="w-10 h-10 rounded-lg bg-[#e6efff] flex items-center justify-center">
        <i class={`ph-bold ${icon} text-xl text-[#0568ff]`} aria-hidden="true" />
      </div>
      {trend && (
        <span class={`text-xs font-medium flex items-center gap-1 ${trendUp ? "text-green-600" : "text-red-600"}`}>
          <i class={`ph-bold ${trendUp ? "ph-trend-up" : "ph-trend-down"}`} aria-hidden="true" />
          {trend}
        </span>
      )}
    </div>
    <div class="text-2xl font-bold text-gray-800 font-serif">{value}</div>
    <div class="text-sm text-gray-500 mt-1">{label}</div>
  </div>
);

// ============================================================
// GET /back-office — Dashboard
// ============================================================
backOfficeRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Run all dashboard queries in parallel.
  const [
    tenantsCount,
    activeTenants,
    trialingTenants,
    totalUsers,
    mrrData,
    arrData,
    newTenantsThisMonth,
    churnedThisMonth,
    saasInvoices,
    recentTenants,
    plansDistribution,
  ] = await Promise.all([
    // Total tenants (not deleted)
    supabase.from("tenants").select("id", { count: "exact", head: true }).is("deleted_at", null),
    // Active (paying) tenants
    supabase.from("tenants").select("id", { count: "exact", head: true }).eq("subscription_status", "active").is("deleted_at", null),
    // Trialing tenants
    supabase.from("tenants").select("id", { count: "exact", head: true }).eq("subscription_status", "trialing").is("deleted_at", null),
    // Total users
    supabase.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    // MRR — sum of monthly plan prices for active tenants
    supabase.from("tenants").select("subscription_plan").eq("subscription_status", "active").is("deleted_at", null),
    // ARR — same but we'll calculate from MRR
    Promise.resolve(null),
    // New tenants this month
    supabase.from("tenants").select("id", { count: "exact", head: true }).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()).is("deleted_at", null),
    // Churned (suspended/canceled) this month
    supabase.from("tenants").select("id", { count: "exact", head: true }).in("subscription_status", ["canceled", "suspended"]).gte("updated_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    // Recent SaaS invoices
    supabase.from("saas_invoices").select("id, tenant_id, number, amount_cents, status, billing_cycle, created_at, tenants(name)").order("created_at", { ascending: false }).limit(10),
    // Recent tenants
    supabase.from("tenants").select("id, name, plan, subscription_status, subscription_plan, created_at, trial_ends_at").order("created_at", { ascending: false }).limit(5),
    // Plan distribution
    supabase.from("tenants").select("subscription_plan").is("deleted_at", null),
  ]);

  // Calculate MRR from plan prices.
  const planPrices: Record<string, number> = { trial: 0, starter: 19900, pro: 49900, enterprise: 0 };
  const activePlans = (mrrData.data as any[]) ?? [];
  const mrr = activePlans.reduce((sum, t) => sum + (planPrices[t.subscription_plan] ?? 0), 0);
  const arr = mrr * 12;

  // Plan distribution.
  const allPlans = (plansDistribution.data as any[]) ?? [];
  const planCounts: Record<string, number> = {};
  for (const t of allPlans) {
    const p = t.subscription_plan ?? "trial";
    planCounts[p] = (planCounts[p] ?? 0) + 1;
  }

  // ARPA (Average Revenue Per Account)
  const activeCount = activeTenants.count ?? 0;
  const arpa = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

  // Recent invoices rows.
  const invoiceRows = ((saasInvoices.data as any[]) ?? []).map((inv) => [
    inv.number,
    inv.tenants?.name ?? "—",
    formatBRL(inv.amount_cents),
    <Badge color={inv.status === "paid" ? "green" : inv.status === "overdue" ? "red" : inv.status === "canceled" ? "gray" : "yellow"}>
      {inv.status === "paid" ? "Paga" : inv.status === "overdue" ? "Vencida" : inv.status === "canceled" ? "Cancelada" : "Aberta"}
    </Badge>,
    formatDate(inv.created_at),
  ]);

  return c.html(
    <BackOfficeLayout title="Dashboard" active="/back-office">
      {/* Flash messages */}
      {(() => { const f = getFlash(c); return f && f.type === "error" ? <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-6 text-sm">{f.message}</div> : null; })()}
      {(() => { const f = getFlash(c); return f && f.type === "success" ? <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-6 text-sm">{f.message}</div> : null; })()}

      {/* Stats grid */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="MRR (Receita Mensal)" value={formatBRL(mrr)} icon="ph-currency-dollar" trend={`${activeCount} ativos`} trendUp={true} />
        <StatCard label="ARR (Receita Anual)" value={formatBRL(arr)} icon="ph-chart-bar" />
        <StatCard label="ARPA (Ticket médio)" value={formatBRL(arpa)} icon="ph-calculator" />
        <StatCard label="Total de escritórios" value={String(tenantsCount.count ?? 0)} icon="ph-buildings" trend={`${newTenantsThisMonth.count ?? 0} novos este mês`} trendUp={true} />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Em trial" value={String(trialingTenants.count ?? 0)} icon="ph-clock-countdown" />
        <StatCard label="Pagantes" value={String(activeCount)} icon="ph-check-circle" />
        <StatCard label="Total de usuários" value={String(totalUsers.count ?? 0)} icon="ph-users" />
        <StatCard label="Churn este mês" value={String(churnedThisMonth.count ?? 0)} icon="ph-user-minus" trendUp={false} trend="cancelamentos" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Plan distribution */}
        <Panel title="Distribuição por plano" icon="ph-pie-chart">
          <div class="space-y-3">
            {Object.entries(planCounts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([plan, count]) => {
              const total = allPlans.length || 1;
              const pct = Math.round(((count as number) / total) * 100);
              const colors: Record<string, string> = { trial: "bg-gray-400", starter: "bg-blue-500", pro: "bg-[#0568ff]", enterprise: "bg-purple-500" };
              return (
                <div>
                  <div class="flex items-center justify-between text-sm mb-1">
                    <span class="font-medium capitalize text-gray-700">{plan}</span>
                    <span class="text-gray-500">{count} ({pct}%)</span>
                  </div>
                  <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div class={`h-full rounded-full ${colors[plan] ?? "bg-gray-400"}`} style={`width: ${pct}%`} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Recent tenants */}
        <Panel title="Escritórios recentes" icon="ph-buildings">
          <div class="space-y-3">
            {((recentTenants.data as any[]) ?? []).map((t) => (
              <div class="flex items-center justify-between">
                <a href={`/back-office/tenants/${t.id}`} class="text-sm font-medium text-gray-700 hover:text-[#0568ff]">
                  {t.name}
                </a>
                <div class="flex items-center gap-2">
                  <Badge color={t.subscription_status === "active" ? "green" : t.subscription_status === "trialing" ? "yellow" : "gray"}>
                    {t.subscription_status}
                  </Badge>
                  <span class="text-xs text-gray-400">{formatDate(t.created_at)}</span>
                </div>
              </div>
            ))}
            {(!recentTenants.data || recentTenants.data.length === 0) && (
              <p class="text-sm text-gray-400 text-center py-4">Nenhum escritório cadastrado.</p>
            )}
          </div>
        </Panel>

        {/* Trial expiring soon */}
        <Panel title="Trials expirando" icon="ph-clock-countdown">
          <div class="space-y-3">
            {((recentTenants.data as any[]) ?? []).filter((t) => t.subscription_status === "trialing" && t.trial_ends_at).map((t) => {
              const days = daysUntil(t.trial_ends_at);
              return (
                <div class="flex items-center justify-between">
                  <a href={`/back-office/tenants/${t.id}`} class="text-sm font-medium text-gray-700 hover:text-[#0568ff]">
                    {t.name}
                  </a>
                  <Badge color={days <= 3 ? "red" : days <= 7 ? "yellow" : "green"}>
                    {days > 0 ? `${days} dias` : "Expirado"}
                  </Badge>
                </div>
              );
            })}
            {((recentTenants.data as any[]) ?? []).filter((t) => t.subscription_status === "trialing" && t.trial_ends_at).length === 0 && (
              <p class="text-sm text-gray-400 text-center py-4">Nenhum trial ativo.</p>
            )}
          </div>
        </Panel>
      </div>

      {/* Recent invoices */}
      <Panel title="Faturas recentes (SaaS)" icon="ph-receipt">
        {invoiceRows.length > 0 ? (
          <Table
            columns={[{ label: "Número" }, { label: "Escritório" }, { label: "Valor" }, { label: "Status" }, { label: "Criada em" }]}
            rows={invoiceRows}
            emptyMsg="Nenhuma fatura."
            ariaLabel="Faturas SaaS recentes"
          />
        ) : (
          <p class="text-sm text-gray-400 text-center py-4">Nenhuma fatura emitida ainda.</p>
        )}
      </Panel>
    </BackOfficeLayout>,
  );
});

// ============================================================
// GET /back-office/tenants — Tenant list
// ============================================================
backOfficeRoutes.get("/tenants", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const statusFilter = c.req.query("status") ?? "";
  const planFilter = c.req.query("plan") ?? "";
  const search = c.req.query("q") ?? "";

  let query = supabase
    .from("tenants")
    .select("id, name, cnpj, plan, subscription_status, subscription_plan, trial_ends_at, created_at, deleted_at", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (statusFilter) query = query.eq("subscription_status", statusFilter);
  if (planFilter) query = query.eq("subscription_plan", planFilter);
  if (search) query = query.or(`name.ilike.%${sanitizeILike(search)}%,cnpj.ilike.%${sanitizeILike(search)}%`);

  const { data: tenants, count } = await query.range(offset, offset + limit - 1);
  const totalPages = Math.ceil((count ?? 0) / limit);

  const rows = ((tenants as any[]) ?? []).map((t) => [
    <a href={`/back-office/tenants/${t.id}`} class="text-[#0568ff] hover:underline font-medium">{t.name}</a>,
    t.cnpj ?? "—",
    <Badge color={t.subscription_status === "active" ? "green" : t.subscription_status === "trialing" ? "yellow" : t.subscription_status === "suspended" || t.subscription_status === "canceled" ? "red" : "gray"}>
      {t.subscription_status}
    </Badge>,
    <span class="capitalize">{t.subscription_plan}</span>,
    t.trial_ends_at ? (daysUntil(t.trial_ends_at) > 0 ? `${daysUntil(t.trial_ends_at)} dias` : "Expirado") : "—",
    formatDate(t.created_at),
  ]);

  return c.html(
    <BackOfficeLayout title="Escritórios" active="/back-office/tenants">
      {/* Filters */}
      <div class="flex flex-col sm:flex-row gap-3 mb-6">
        <form method="get" class="flex-1 flex gap-2">
          <input type="text" name="q" value={search} placeholder="Buscar por nome ou CNPJ..." class="input flex-1" />
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {planFilter && <input type="hidden" name="plan" value={planFilter} />}
          <button type="submit" class="btn btn-secondary"><i class="ph ph-magnifying-glass" aria-hidden="true" /></button>
        </form>
        <select onchange={`window.location.href='/back-office/tenants' + (this.value ? '?status=' + this.value : '')`} class="input">
          <option value="">Todos os status</option>
          <option value="active" selected={statusFilter === "active"}>Ativos</option>
          <option value="trialing" selected={statusFilter === "trialing"}>Em trial</option>
          <option value="past_due" selected={statusFilter === "past_due"}>Pagamento atrasado</option>
          <option value="suspended" selected={statusFilter === "suspended"}>Suspensos</option>
          <option value="canceled" selected={statusFilter === "canceled"}>Cancelados</option>
        </select>
        <select onchange={`window.location.href='/back-office/tenants' + (this.value ? '?plan=' + this.value : '')`} class="input">
          <option value="">Todos os planos</option>
          <option value="trial" selected={planFilter === "trial"}>Trial</option>
          <option value="starter" selected={planFilter === "starter"}>Starter</option>
          <option value="pro" selected={planFilter === "pro"}>Pro</option>
          <option value="enterprise" selected={planFilter === "enterprise"}>Enterprise</option>
        </select>
      </div>

      <Table
        columns={[{ label: "Escritório" }, { label: "CNPJ" }, { label: "Status" }, { label: "Plano" }, { label: "Trial" }, { label: "Criado em" }]}
        rows={rows}
        emptyMsg="Nenhum escritório encontrado."
        emptyIcon="ph-buildings"
        ariaLabel="Lista de escritórios"
        count={count ?? 0}
        countLabel="escritório(s)"
        pagination={{ currentPage: page, totalPages, basePath: "/back-office/tenants", queryParams: { ...(statusFilter ? { status: statusFilter } : {}), ...(planFilter ? { plan: planFilter } : {}), ...(search ? { q: search } : {}) } }}
      />
    </BackOfficeLayout>,
  );
});

// ============================================================
// GET /back-office/tenants/:id — Tenant detail
// ============================================================
backOfficeRoutes.get("/tenants/:id", async (c) => {
  const id = c.req.param("id");

  const [tenantRes, usersRes, invoicesRes, casesCount, clientsCount] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", id).single(),
    supabase.from("profiles").select("id, email, full_name, role, active, created_at").eq("tenant_id", id).is("deleted_at", null).order("created_at"),
    supabase.from("saas_invoices").select("id, number, amount_cents, status, billing_cycle, due_date, paid_at, created_at").eq("tenant_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("tenant_id", id),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", id),
  ]);

  const tenant = tenantRes.data as any;
  if (!tenant) {
    setFlash(c, "error", "Escritório não encontrado.");
    return c.redirect("/back-office/tenants");
  }

  const users = (usersRes.data as any[]) ?? [];
  const invoices = (invoicesRes.data as any[]) ?? [];

  const userRows = users.map((u) => [
    u.full_name,
    u.email,
    <span class="capitalize">{u.role}</span>,
    <Badge color={u.active ? "green" : "gray"}>{u.active ? "Ativo" : "Inativo"}</Badge>,
    formatDate(u.created_at),
  ]);

  const invoiceRows = invoices.map((inv) => [
    inv.number,
    formatBRL(inv.amount_cents),
    <span class="capitalize">{inv.billing_cycle === "monthly" ? "Mensal" : "Anual"}</span>,
    <Badge color={inv.status === "paid" ? "green" : inv.status === "overdue" ? "red" : "yellow"}>
      {inv.status === "paid" ? "Paga" : inv.status === "overdue" ? "Vencida" : "Aberta"}
    </Badge>,
    formatDate(inv.due_date),
    formatDate(inv.paid_at),
  ]);

  return c.html(
    <BackOfficeLayout title={tenant.name} active="/back-office/tenants">
      {/* Flash */}
      {(() => { const f = getFlash(c); return f && f.type === "error" ? <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-6 text-sm">{f.message}</div> : null; })()}
      {(() => { const f = getFlash(c); return f && f.type === "success" ? <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-6 text-sm">{f.message}</div> : null; })()}

      {/* Back link */}
      <a href="/back-office/tenants" class="text-sm text-gray-500 hover:text-[#0568ff] mb-4 inline-flex items-center gap-1">
        <i class="ph ph-arrow-left" aria-hidden="true" /> Voltar para lista
      </a>

      {/* Tenant info */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Panel title="Dados do escritório" icon="ph-buildings">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Nome: </dt><dd class="inline">{tenant.name}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">CNPJ: </dt><dd class="inline">{tenant.cnpj ?? "—"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Subdomínio: </dt><dd class="inline">{tenant.subdomain ?? "—"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Plano: </dt><dd class="inline capitalize">{tenant.subscription_plan}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={tenant.subscription_status === "active" ? "green" : tenant.subscription_status === "trialing" ? "yellow" : "red"}>{tenant.subscription_status}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Trial até: </dt><dd class="inline">{formatDate(tenant.trial_ends_at)} {tenant.trial_ends_at && daysUntil(tenant.trial_ends_at) > 0 ? `(${daysUntil(tenant.trial_ends_at)} dias)` : ""}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{formatDate(tenant.created_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Máx. usuários: </dt><dd class="inline">{tenant.max_users ?? "—"}</dd></div>
          </dl>
        </Panel>

        {/* Stats */}
        <Panel title="Métricas" icon="ph-chart-bar">
          <div class="grid grid-cols-2 gap-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-800">{users.length}</div>
              <div class="text-xs text-gray-500">Usuários</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-800">{casesCount.count ?? 0}</div>
              <div class="text-xs text-gray-500">Processos</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-800">{clientsCount.count ?? 0}</div>
              <div class="text-xs text-gray-500">Clientes</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-800">{invoices.filter((i) => i.status === "paid").length}</div>
              <div class="text-xs text-gray-500">Faturas pagas</div>
            </div>
          </div>
        </Panel>

        {/* Actions */}
        <Panel title="Ações administrativas" icon="ph-gear">
          <form method="post" action={`/back-office/tenants/${id}/plan`} class="space-y-3">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Alterar plano</label>
              <select name="plan" class="input">
                <option value="trial" selected={tenant.subscription_plan === "trial"}>Trial</option>
                <option value="starter" selected={tenant.subscription_plan === "starter"}>Starter — R$ 199/mês</option>
                <option value="pro" selected={tenant.subscription_plan === "pro"}>Pro — R$ 499/mês</option>
                <option value="enterprise" selected={tenant.subscription_plan === "enterprise"}>Enterprise</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary w-full" {...{ "x-data": "{ loading: false }", "@submit": "loading = true", ":disabled": "loading" }}>
              <i class="ph ph-spinner animate-spin" {...{ "x-show": "loading", "x-cloak": "" }} aria-hidden="true" />
              <span {...{ "x-show": "!loading" }}>Salvar plano</span>
              <span {...{ "x-show": "loading", "x-cloak": "" }}>Salvando...</span>
            </button>
          </form>

          <div class="mt-4 pt-4 border-t border-gray-100 space-y-2">
            {tenant.subscription_status !== "suspended" ? (
              <form method="post" action={`/back-office/tenants/${id}/suspend`} onsubmit="return confirm('Suspender este escritório? Ele perderá acesso ao sistema.')">
                <button type="submit" class="btn btn-danger w-full" aria-label="Suspender">
                  <i class="ph ph-pause-circle" aria-hidden="true" /> Suspender
                </button>
              </form>
            ) : (
              <form method="post" action={`/back-office/tenants/${id}/reactivate`}>
                <button type="submit" class="btn btn-primary w-full">
                  <i class="ph ph-play-circle" aria-hidden="true" /> Reativar
                </button>
              </form>
            )}
          </div>
        </Panel>
      </div>

      {/* Users */}
      <Panel title={`Usuários (${users.length})`} icon="ph-users">
        {userRows.length > 0 ? (
          <Table columns={[{ label: "Nome" }, { label: "E-mail" }, { label: "Role" }, { label: "Status" }, { label: "Criado em" }]} rows={userRows} emptyMsg="Nenhum usuário." ariaLabel="Usuários do escritório" />
        ) : (
          <p class="text-sm text-gray-400 text-center py-4">Nenhum usuário.</p>
        )}
      </Panel>

      {/* Invoices */}
      <div class="mt-6">
        <Panel title="Faturas SaaS" icon="ph-receipt">
          {invoiceRows.length > 0 ? (
            <Table columns={[{ label: "Número" }, { label: "Valor" }, { label: "Ciclo" }, { label: "Status" }, { label: "Vencimento" }, { label: "Paga em" }]} rows={invoiceRows} emptyMsg="Nenhuma fatura." ariaLabel="Faturas SaaS" />
          ) : (
            <p class="text-sm text-gray-400 text-center py-4">Nenhuma fatura.</p>
          )}
        </Panel>
      </div>
    </BackOfficeLayout>,
  );
});

// ============================================================
// POST /back-office/tenants/:id/plan — Change tenant plan
// ============================================================
const planSchema = z.object({
  plan: z.enum(["trial", "starter", "pro", "enterprise"]),
});

backOfficeRoutes.post("/tenants/:id/plan", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) {
    setFlash(c, "error", "Plano inválido.");
    return c.redirect(`/back-office/tenants/${id}`);
  }
  const newPlan = parsed.data.plan;

  const planMaxUsers: Record<string, number> = { trial: 3, starter: 10, pro: 50, enterprise: 999 };
  const newStatus = newPlan === "trial" ? "trialing" : "active";

  const { error } = await supabase
    .from("tenants")
    .update({
      subscription_plan: newPlan,
      plan: newPlan,
      subscription_status: newStatus,
      max_users: planMaxUsers[newPlan],
      ...(newPlan === "trial" ? { trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("[back-office] change plan failed", { tenantId: id, error: error.message });
    setFlash(c, "error", "Ocorreu um erro ao alterar o plano. Tente novamente.");
  } else {
    // Log to platform audit
    const user = c.get("user");
    await supabase.from("platform_audit_logs").insert({
      admin_id: user.id,
      action: "change_plan",
      target_tenant_id: id,
      details: { new_plan: newPlan },
      ip_address: c.req.header("x-forwarded-for") ?? null,
    });
    setFlash(c, "success", `Plano alterado para ${newPlan}.`);
  }

  return c.redirect(`/back-office/tenants/${id}`);
});

// ============================================================
// POST /back-office/tenants/:id/suspend — Suspend tenant
// ============================================================
backOfficeRoutes.post("/tenants/:id/suspend", async (c) => {
  const id = c.req.param("id");

  const { error } = await supabase
    .from("tenants")
    .update({ subscription_status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[back-office] suspend failed", { tenantId: id, error: error.message });
    setFlash(c, "error", "Ocorreu um erro ao suspender o tenant. Tente novamente.");
  } else {
    const user = c.get("user");
    await supabase.from("platform_audit_logs").insert({
      admin_id: user.id,
      action: "suspend_tenant",
      target_tenant_id: id,
      ip_address: c.req.header("x-forwarded-for") ?? null,
    });

    // Invalidate all sessions for users in this tenant
    const { data: tenantUsers } = await supabase
      .from("profiles")
      .select("id")
      .eq("tenant_id", id)
      .is("deleted_at", null);
    for (const u of tenantUsers ?? []) {
      await supabase.auth.admin.signOut(u.id, "global").catch(() => {});
    }

    setFlash(c, "success", "Escritório suspenso. Todas as sessões foram encerradas.");
  }

  return c.redirect(`/back-office/tenants/${id}`);
});

// ============================================================
// POST /back-office/tenants/:id/reactivate — Reactivate tenant
// ============================================================
backOfficeRoutes.post("/tenants/:id/reactivate", async (c) => {
  const id = c.req.param("id");

  const { data: tenant }: any = await supabase.from("tenants").select("subscription_plan").eq("id", id).single();
  const newStatus = tenant?.subscription_plan === "trial" ? "trialing" : "active";

  const { error } = await supabase
    .from("tenants")
    .update({ subscription_status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[back-office] reactivate failed", { tenantId: id, error: error.message });
    setFlash(c, "error", "Ocorreu um erro ao reativar o tenant. Tente novamente.");
  } else {
    const user = c.get("user");
    await supabase.from("platform_audit_logs").insert({
      admin_id: user.id,
      action: "reactivate_tenant",
      target_tenant_id: id,
      ip_address: c.req.header("x-forwarded-for") ?? null,
    });
    setFlash(c, "success", "Escritório reativado.");
  }

  return c.redirect(`/back-office/tenants/${id}`);
});

// ============================================================
// GET /back-office/users — All users across tenants
// ============================================================
backOfficeRoutes.get("/users", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 25;
  const offset = (page - 1) * limit;
  const search = c.req.query("q") ?? "";

  let query = supabase
    .from("profiles")
    .select("id, email, full_name, role, active, is_platform_admin, created_at, tenants(name)", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) query = query.or(`email.ilike.%${sanitizeILike(search)}%,full_name.ilike.%${sanitizeILike(search)}%`);

  const { data: users, count } = await query.range(offset, offset + limit - 1);
  const totalPages = Math.ceil((count ?? 0) / limit);

  const rows = ((users as any[]) ?? []).map((u) => [
    u.full_name,
    u.email,
    <span class="capitalize">{u.role}</span>,
    u.tenants?.name ?? "—",
    <Badge color={u.active ? "green" : "gray"}>{u.active ? "Ativo" : "Inativo"}</Badge>,
    u.is_platform_admin ? <Badge color="blue">Admin</Badge> : "—",
    formatDate(u.created_at),
  ]);

  return c.html(
    <BackOfficeLayout title="Usuários" active="/back-office/users">
      <div class="mb-6">
        <form method="get" class="flex gap-2 max-w-md">
          <input type="text" name="q" value={search} placeholder="Buscar por nome ou e-mail..." class="input flex-1" />
          <button type="submit" class="btn btn-secondary"><i class="ph ph-magnifying-glass" aria-hidden="true" /></button>
        </form>
      </div>

      <Table
        columns={[{ label: "Nome" }, { label: "E-mail" }, { label: "Role" }, { label: "Escritório" }, { label: "Status" }, { label: "Admin" }, { label: "Criado em" }]}
        rows={rows}
        emptyMsg="Nenhum usuário encontrado."
        emptyIcon="ph-users"
        ariaLabel="Lista de usuários"
        count={count ?? 0}
        countLabel="usuário(s)"
        pagination={{ currentPage: page, totalPages, basePath: "/back-office/users", queryParams: search ? { q: search } : {} }}
      />
    </BackOfficeLayout>,
  );
});

// ============================================================
// GET /back-office/subscriptions — Subscription overview
// ============================================================
backOfficeRoutes.get("/subscriptions", async (c) => {
  const [active, trialing, pastDue, suspended, canceled, recentChanges] = await Promise.all([
    supabase.from("tenants").select("id, name, subscription_plan, subscription_plan, trial_ends_at, created_at", { count: "exact" }).eq("subscription_status", "active").is("deleted_at", null).order("name"),
    supabase.from("tenants").select("id, name, subscription_plan, trial_ends_at", { count: "exact" }).eq("subscription_status", "trialing").is("deleted_at", null).order("trial_ends_at"),
    supabase.from("tenants").select("id, name, subscription_plan", { count: "exact" }).eq("subscription_status", "past_due").is("deleted_at", null),
    supabase.from("tenants").select("id, name, subscription_plan", { count: "exact" }).eq("subscription_status", "suspended").is("deleted_at", null),
    supabase.from("tenants").select("id, name", { count: "exact" }).eq("subscription_status", "canceled").is("deleted_at", null),
    supabase.from("tenants").select("id, name, subscription_status, subscription_plan, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(10),
  ]);

  const planPrices: Record<string, number> = { trial: 0, starter: 19900, pro: 49900, enterprise: 0 };

  // Active subscriptions table
  const activeRows = ((active.data as any[]) ?? []).map((t) => [
    <a href={`/back-office/tenants/${t.id}`} class="text-[#0568ff] hover:underline">{t.name}</a>,
    <span class="capitalize">{t.subscription_plan}</span>,
    formatBRL(planPrices[t.subscription_plan] ?? 0),
    formatDate(t.created_at),
  ]);

  // Trialing table
  const trialingRows = ((trialing.data as any[]) ?? []).map((t) => [
    <a href={`/back-office/tenants/${t.id}`} class="text-[#0568ff] hover:underline">{t.name}</a>,
    <span class="capitalize">{t.subscription_plan}</span>,
    formatDate(t.trial_ends_at),
    daysUntil(t.trial_ends_at) > 0 ? <Badge color={daysUntil(t.trial_ends_at) <= 3 ? "red" : "yellow"}>{daysUntil(t.trial_ends_at)} dias</Badge> : <Badge color="red">Expirado</Badge>,
  ]);

  return c.html(
    <BackOfficeLayout title="Assinaturas" active="/back-office/subscriptions">
      {/* Summary cards */}
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Ativas" value={String(active.count ?? 0)} icon="ph-check-circle" />
        <StatCard label="Em trial" value={String(trialing.count ?? 0)} icon="ph-clock" />
        <StatCard label="Pagamento atrasado" value={String(pastDue.count ?? 0)} icon="ph-warning" />
        <StatCard label="Suspensas" value={String(suspended.count ?? 0)} icon="ph-pause-circle" />
        <StatCard label="Canceladas" value={String(canceled.count ?? 0)} icon="ph-x-circle" />
      </div>

      {/* Active subscriptions */}
      <Panel title="Assinaturas ativas" icon="ph-check-circle">
        {activeRows.length > 0 ? (
          <Table columns={[{ label: "Escritório" }, { label: "Plano" }, { label: "Valor/mês" }, { label: "Desde" }]} rows={activeRows} emptyMsg="Nenhuma assinatura ativa." ariaLabel="Assinaturas ativas" />
        ) : (
          <p class="text-sm text-gray-400 text-center py-4">Nenhuma assinatura ativa.</p>
        )}
      </Panel>

      {/* Trialing */}
      <div class="mt-6">
        <Panel title="Triais ativos" icon="ph-clock-countdown">
          {trialingRows.length > 0 ? (
            <Table columns={[{ label: "Escritório" }, { label: "Plano" }, { label: "Expira em" }, { label: "Tempo restante" }]} rows={trialingRows} emptyMsg="Nenhum trial ativo." ariaLabel="Triais ativos" />
          ) : (
            <p class="text-sm text-gray-400 text-center py-4">Nenhum trial ativo.</p>
          )}
        </Panel>
      </div>
    </BackOfficeLayout>,
  );
});

// ============================================================
// GET /back-office/revenue — Revenue analytics
// ============================================================
backOfficeRoutes.get("/revenue", async (c) => {
  // Get all paid invoices
  const { data: paidInvoices } = await supabase
    .from("saas_invoices")
    .select("amount_cents, billing_cycle, status, paid_at, created_at")
    .eq("status", "paid")
    .order("paid_at", { ascending: false });

  const invoices = (paidInvoices as any[]) ?? [];

  // Total revenue
  const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.amount_cents ?? 0), 0);

  // Revenue this month
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const revenueThisMonth = invoices.filter((i) => i.paid_at && i.paid_at >= monthStart).reduce((s, i) => s + i.amount_cents, 0);

  // Revenue last month
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString();
  const lastMonthEnd = monthStart;
  const revenueLastMonth = invoices.filter((i) => i.paid_at && i.paid_at >= lastMonthStart && i.paid_at < lastMonthEnd).reduce((s, i) => s + i.amount_cents, 0);

  // MRR (current month from active tenants)
  const { data: activeTenants } = await supabase.from("tenants").select("subscription_plan").eq("subscription_status", "active").is("deleted_at", null);
  const planPrices: Record<string, number> = { trial: 0, starter: 19900, pro: 49900, enterprise: 0 };
  const mrr = ((activeTenants as any[]) ?? []).reduce((s, t) => s + (planPrices[t.subscription_plan] ?? 0), 0);

  // LTV estimate (MRR / churn rate — simplified: average customer lifetime)
  // For now, use total revenue / total tenants that ever paid
  const { count: totalEverPaid } = await supabase.from("saas_invoices").select("tenant_id", { count: "exact", head: true }).eq("status", "paid");
  const ltv = totalEverPaid && totalEverPaid > 0 ? Math.round(totalRevenue / totalEverPaid) : 0;

  // Monthly revenue chart (last 6 months)
  const months: { label: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    const end = new Date(new Date().getFullYear(), new Date().getMonth() - i + 1, 1);
    const label = start.toLocaleDateString("pt-BR", { month: "short" });
    const revenue = invoices.filter((inv) => inv.paid_at && inv.paid_at >= start.toISOString() && inv.paid_at < end.toISOString()).reduce((s, i) => s + i.amount_cents, 0);
    months.push({ label, revenue });
  }
  const maxRevenue = Math.max(...months.map((m) => m.revenue), 1);

  return c.html(
    <BackOfficeLayout title="Receita" active="/back-office/revenue">
      {/* Stats */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="MRR atual" value={formatBRL(mrr)} icon="ph-currency-dollar" />
        <StatCard label="Receita total" value={formatBRL(totalRevenue)} icon="ph-coins" />
        <StatCard label="Receita este mês" value={formatBRL(revenueThisMonth)} icon="ph-calendar-check" trend={revenueLastMonth > 0 ? `${Math.round((revenueThisMonth / revenueLastMonth - 1) * 100)}% vs mês ant.` : undefined} trendUp={revenueThisMonth >= revenueLastMonth} />
        <StatCard label="LTV estimado" value={formatBRL(ltv)} icon="ph-infinity" />
      </div>

      {/* Revenue chart (CSS bars) */}
      <Panel title="Receita por mês (últimos 6 meses)" icon="ph-chart-bar">
        <div class="flex items-end justify-between gap-3 h-48 pt-4">
          {months.map((m) => (
            <div class="flex-1 flex flex-col items-center gap-2">
              <div class="text-xs text-gray-500 font-medium">{formatBRL(m.revenue)}</div>
              <div class="w-full bg-gray-100 rounded-t-lg relative flex-1 flex items-end">
                <div class="w-full bg-[#0568ff] rounded-t-lg transition-all" style={`height: ${Math.max((m.revenue / maxRevenue) * 100, 2)}%`} />
              </div>
              <div class="text-xs text-gray-500 capitalize">{m.label}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* CAC placeholder */}
      <div class="mt-6">
        <Panel title="CAC — Custo de Aquisição" icon="ph-target">
          <p class="text-sm text-gray-500 mb-4">O CAC é calculado dividindo o total investido em marketing/vendas pelo número de novos clientes adquiridos no período.</p>
          <div class="bg-[#e6efff] border border-[#b0ccff] rounded-lg p-4 text-sm text-[#0568ff]">
            <i class="ph ph-info" aria-hidden="true" /> Para calcular o CAC automaticamente, integre suas despesas de marketing (Google Ads, Meta Ads, etc.) ou insira manualmente o gasto mensal.
          </div>
        </Panel>
      </div>
    </BackOfficeLayout>,
  );
});

// ============================================================
// GET /back-office/leads — Commercial leads
// ============================================================
backOfficeRoutes.get("/leads", async (c) => {
  const { data: leads } = await supabase
    .from("commercial_leads")
    .select("id, name, email, phone, company, role, team_size, interested_plan, status, message, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = ((leads as any[]) ?? []).map((l) => [
    l.name,
    l.email,
    l.phone ?? "—",
    l.company ?? "—",
    l.interested_plan ? <span class="capitalize">{l.interested_plan}</span> : "—",
    <Badge color={l.status === "new" ? "yellow" : l.status === "converted" ? "green" : l.status === "lost" ? "red" : "blue"}>
      {l.status === "new" ? "Novo" : l.status === "contacted" ? "Contatado" : l.status === "qualified" ? "Qualificado" : l.status === "converted" ? "Convertido" : "Perdido"}
    </Badge>,
    formatDate(l.created_at),
  ]);

  return c.html(
    <BackOfficeLayout title="Leads comerciais" active="/back-office/leads">
      <Table
        columns={[{ label: "Nome" }, { label: "E-mail" }, { label: "Telefone" }, { label: "Empresa" }, { label: "Plano" }, { label: "Status" }, { label: "Recebido em" }]}
        rows={rows}
        emptyMsg="Nenhum lead recebido."
        emptyIcon="ph-target"
        ariaLabel="Leads comerciais"
      />
    </BackOfficeLayout>,
  );
});

// ============================================================
// GET /back-office/audit — Platform audit log
// ============================================================
backOfficeRoutes.get("/audit", async (c) => {
  const { data: logs } = await supabase
    .from("platform_audit_logs")
    .select("id, action, target_tenant_id, details, ip_address, created_at, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const actionLabels: Record<string, string> = {
    change_plan: "Alteração de plano",
    suspend_tenant: "Suspensão",
    reactivate_tenant: "Reativação",
    impersonate: "Impersonação",
    delete_tenant: "Exclusão",
    update_tenant: "Atualização",
    create_tenant: "Criação",
  };

  const rows = ((logs as any[]) ?? []).map((l) => [
    l.profiles?.full_name ?? "—",
    actionLabels[l.action] ?? l.action,
    l.target_tenant_id ? <a href={`/back-office/tenants/${l.target_tenant_id}`} class="text-[#0568ff] hover:underline">Ver escritório</a> : "—",
    l.details ? <code class="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{JSON.stringify(l.details)}</code> : "—",
    l.ip_address ?? "—",
    formatDate(l.created_at),
  ]);

  return c.html(
    <BackOfficeLayout title="Auditoria" active="/back-office/audit">
      <Table
        columns={[{ label: "Admin" }, { label: "Ação" }, { label: "Escritório" }, { label: "Detalhes" }, { label: "IP" }, { label: "Data" }]}
        rows={rows}
        emptyMsg="Nenhum registro de auditoria."
        emptyIcon="ph-shield-check"
        ariaLabel="Logs de auditoria"
      />
    </BackOfficeLayout>,
  );
});
