// Subscription routes — SaaS billing for the PragmaOS subscription itself.
// Routes: /assinatura (overview + plans), /assinatura/assinar/:plan (subscribe),
//          /assinatura/cancelar (cancel), /assinatura/webhook (Asaas webhook)

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { log } from "../lib/logger";
import { getSubscriptionState, shouldBlockAccess, type SubscriptionState } from "../lib/subscription";
import { createCustomer, createSubscription, cancelSubscription, isConfigured as asaasConfigured, type AsaasWebhookEvent } from "../lib/asaas";
import { ASAAS_WEBHOOK_TOKEN } from "../lib/env";
import { PageHeader, Panel, Badge, Select } from "../components/ui";

export const subscriptionRoutes = new Hono<AppEnv>();

subscriptionRoutes.use("*", requireAuth);

// ============================================================
// Plan catalog (mirrors plans table)
// ============================================================
const PLAN_INFO: Record<string, { name: string; price: number; tagline: string }> = {
  trial: { name: "Trial", price: 0, tagline: "14 dias grátis" },
  starter: { name: "Starter", price: 19900, tagline: "Para escritórios iniciantes" },
  pro: { name: "Pro", price: 49900, tagline: "Para escritórios em crescimento" },
  enterprise: { name: "Enterprise", price: 0, tagline: "Sob consulta" },
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function statusBadge(status: string) {
  const map: Record<string, { color: "green" | "yellow" | "red" | "blue" | "gray"; label: string }> = {
    trialing: { color: "blue", label: "Trial ativo" },
    active: { color: "green", label: "Assinatura ativa" },
    past_due: { color: "yellow", label: "Pagamento pendente" },
    suspended: { color: "red", label: "Suspensa" },
    canceled: { color: "gray", label: "Cancelada" },
    none: { color: "gray", label: "Sem assinatura" },
  };
  const info = map[status] ?? map.none;
  const color = (info?.color ?? "gray") as "green" | "yellow" | "red" | "blue" | "gray";
  const label = info?.label ?? status;
  return <Badge color={color}>{label}</Badge>;
}

// ============================================================
// GET /assinatura — overview + plan selection
// ============================================================
subscriptionRoutes.get("/", async (c) => {
  const user = c.get("user");
  const reason = c.req.query("reason") ?? "";
  const state = await getSubscriptionState(user.tenantId);

  // Fetch plan catalog from DB
  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, tagline, price_monthly_cents, price_yearly_cents, max_users, max_cases, has_ai, has_whatsapp, has_public_site, has_api, has_integrations, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  // Fetch recent SaaS invoices
  const { data: invoices } = await supabase
    .from("saas_invoices")
    .select("id, number, amount_cents, status, due_date, paid_at, billing_cycle, pix_copy_paste, asaas_invoice_url, boleto_url")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  const blockReason = shouldBlockAccess(state);

  return renderPage(
    c,
    { title: "Assinatura", active: "billing" },
    <>
      <PageHeader title="Assinatura" icon="ph-credit-card" />

      {/* Status panel */}
      <Panel title="Status da assinatura" icon="ph-info">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            {statusBadge(state.status)}
            <span class="text-body-sm text-gray-500">Plano atual: <strong>{PLAN_INFO[state.plan]?.name ?? state.plan}</strong></span>
          </div>
        </div>

        {state.status === "trialing" && (
          <div class={`rounded-lg p-4 mb-4 ${state.daysLeft <= 3 ? "bg-status-yellow-bg border border-status-yellow-border" : "bg-status-blue-bg border border-status-blue-border"}`}>
            <div class="flex items-center gap-2">
              <i class={`ph-bold ${state.daysLeft <= 3 ? "ph-warning text-status-yellow" : "ph-clock text-status-blue"} text-h4`} aria-hidden="true" />
              <div>
                <div class="font-semibold text-body-sm">
                  {state.daysLeft > 0 ? `Seu trial termina em ${state.daysLeft} dia${state.daysLeft > 1 ? "s" : ""}` : "Seu trial expirou"}
                </div>
                <div class="text-body-sm text-gray-600">
                  {state.daysLeft > 0
                    ? "Escolha um plano para continuar usando o PragmaOS após o trial."
                    : "Assine um plano para reativar seu acesso."}
                </div>
              </div>
            </div>
          </div>
        )}

        {blockReason && reason && (
          <div class="rounded-lg p-4 mb-4 bg-status-red-bg border border-status-red-border">
            <div class="flex items-center gap-2">
              <i class="ph-bold ph-lock text-status-red text-h4" aria-hidden="true" />
              <div>
                <div class="font-semibold text-status-red text-body-sm">Acesso restrito</div>
                <div class="text-body-sm text-status-red">
                  {reason === "trial_expired" && "Seu período de teste expirou. Assine um plano para continuar."}
                  {reason === "past_due" && "Há um pagamento pendente. Regularize para continuar usando."}
                  {reason === "suspended" && "Sua assinatura está suspensa. Assine um plano para reativar."}
                  {reason === "canceled" && "Sua assinatura foi cancelada. Assine um plano para voltar."}
                  {reason === "no_subscription" && "Você não tem uma assinatura ativa. Escolha um plano abaixo."}
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* Plans */}
      <div class="mt-6">
        <h2 class="text-h4 font-bold mb-4">Escolha seu plano</h2>

        {/* Billing cycle toggle (mensal / anual) */}
        <div {...{ "x-data": "{ annual: false }" }} class="flex items-center justify-center gap-3 mb-6">
          <span {...{ ":class": "annual ? 'text-gray-400' : 'text-carvao-800 font-semibold'" }}>Mensal</span>
          <button type="button" {...{ "@click": "annual = !annual", ":class": "annual ? 'bg-terracota-500' : 'bg-gray-200'" }} class="relative w-12 h-6 rounded-full transition-colors" aria-label="Alternar cobrança anual">
            <span {...{ ":class": "annual ? 'translate-x-6' : 'translate-x-0'" }} class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" />
          </button>
          <span {...{ ":class": "annual ? 'text-carvao-800 font-semibold' : 'text-gray-400'" }}>
            Anual <span class="text-terracota-600 text-body-sm">(-20%)</span>
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(plans ?? []).filter((p) => p.id !== "trial" && p.id !== "enterprise").map((p) => {
            const isCurrent = state.plan === p.id && state.status === "active";
            const monthlyPrice = p.price_monthly_cents;
            const yearlyPrice = p.price_yearly_cents ?? Math.round(monthlyPrice * 12 * 0.8);
            const annualMonthly = Math.round(yearlyPrice / 12);
            return (
              <div class={`rounded-xl p-6 border-2 flex flex-col ${p.id === "pro" ? "border-terracota-500 bg-terracota-50" : "border-gray-200 bg-white"}`}>
                {p.id === "pro" && <div class="text-xs font-bold text-terracota-600 uppercase mb-2">Mais popular</div>}
                <h3 class="text-h4 font-bold">{p.name}</h3>
                <p class="text-body-sm text-gray-500 mb-3">{p.tagline}</p>
                <div class="mb-4">
                  {/* Monthly price */}
                  <div {...{ "x-show": "!annual" }} class="flex items-baseline gap-1">
                    <span class="text-h2 font-bold">{formatCurrency(monthlyPrice)}</span>
                    <span class="text-body-sm text-gray-400">/mês</span>
                  </div>
                  {/* Annual price (shows monthly equivalent) */}
                  <div {...{ "x-show": "annual", "x-cloak": "" }} class="flex items-baseline gap-1">
                    <span class="text-h2 font-bold">{formatCurrency(annualMonthly)}</span>
                    <span class="text-body-sm text-gray-400">/mês · cobrado anualmente</span>
                  </div>
                </div>
                <ul class="space-y-2 text-body-sm mb-6 flex-1">
                  <li class="flex gap-2"><i class="ph ph-check text-terracota-600" aria-hidden="true" /> {p.max_users} usuários</li>
                  <li class="flex gap-2"><i class="ph ph-check text-terracota-600" aria-hidden="true" /> {p.max_cases ? `${p.max_cases} processos` : "Processos ilimitados"}</li>
                  {p.has_ai && <li class="flex gap-2"><i class="ph ph-check text-terracota-600" aria-hidden="true" /> IA jurídica</li>}
                  {p.has_whatsapp && <li class="flex gap-2"><i class="ph ph-check text-terracota-600" aria-hidden="true" /> WhatsApp integrado</li>}
                  {p.has_public_site && <li class="flex gap-2"><i class="ph ph-check text-terracota-600" aria-hidden="true" /> Site público</li>}
                  {p.has_api && <li class="flex gap-2"><i class="ph ph-check text-terracota-600" aria-hidden="true" /> API</li>}
                  {p.has_integrations && <li class="flex gap-2"><i class="ph ph-check text-terracota-600" aria-hidden="true" /> Integrações</li>}
                </ul>
                {isCurrent ? (
                  <span class="btn btn-secondary w-full text-center cursor-default">Plano atual</span>
                ) : (
                  <form method="post" action={`/assinatura/assinar/${p.id}`} {...{ "x-data": "{ loading: false }", "@submit": "loading = true" }}>
                    <input type="hidden" name="billing_cycle" value="monthly" {...{ ":value": "annual ? 'yearly' : 'monthly'" }} />
                    <button type="submit" class={`btn w-full ${p.id === "pro" ? "btn-primary" : "btn-secondary"}`} {...{ ":disabled": "loading" }}>
                      <i class="ph ph-spinner animate-spin mr-1" {...{ "x-show": "loading", "x-cloak": "" }} aria-hidden="true" />
                      <span {...{ "x-show": "!loading" }}>Assinar {p.name}</span>
                      <span {...{ "x-show": "loading", "x-cloak": "" }}>Processando...</span>
                    </button>
                  </form>
                )}
              </div>
            );
          })}

          {/* Enterprise card */}
          <div class="rounded-xl p-6 border-2 border-gray-200 bg-carvao-800 text-white flex flex-col">
            <h3 class="text-h4 font-bold">Enterprise</h3>
            <p class="text-body-sm text-gray-300 mb-3">Sob consulta</p>
            <div class="mb-4">
              <span class="text-h2 font-bold">Custom</span>
            </div>
            <ul class="space-y-2 text-body-sm mb-6 flex-1 text-gray-200">
              <li class="flex gap-2"><i class="ph ph-check text-terracota-400" aria-hidden="true" /> Usuarios ilimitados</li>
              <li class="flex gap-2"><i class="ph ph-check text-terracota-400" aria-hidden="true" /> Tudo do Pro +</li>
              <li class="flex gap-2"><i class="ph ph-check text-terracota-400" aria-hidden="true" /> Onboarding personalizado</li>
              <li class="flex gap-2"><i class="ph ph-check text-terracota-400" aria-hidden="true" /> Suporte 24/7</li>
              <li class="flex gap-2"><i class="ph ph-check text-terracota-400" aria-hidden="true" /> Gerente dedicado</li>
            </ul>
            <a href="/contato?plan=enterprise" class="btn bg-terracota-500 text-white w-full text-center hover:bg-terracota-600">Falar com comercial</a>
          </div>
        </div>
      </div>

      {/* Invoices */}
      {invoices && invoices.length > 0 && (
        <div class="mt-8">
          <h2 class="text-h4 font-bold mb-4">Faturas recentes</h2>
          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table class="w-full text-body-sm">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-4 py-3 font-semibold text-gray-600">Número</th>
                  <th class="px-4 py-3 font-semibold text-gray-600">Valor</th>
                  <th class="px-4 py-3 font-semibold text-gray-600">Vencimento</th>
                  <th class="px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th class="px-4 py-3 font-semibold text-gray-600">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr class="border-t border-gray-100">
                    <td class="px-4 py-3">{inv.number}</td>
                    <td class="px-4 py-3">{formatCurrency(inv.amount_cents)}</td>
                    <td class="px-4 py-3">{inv.due_date ? new Date(inv.due_date).toLocaleDateString("pt-BR") : "-"}</td>
                    <td class="px-4 py-3">{statusBadge(inv.status)}</td>
                    <td class="px-4 py-3">
                      {inv.asaas_invoice_url && <a href={inv.asaas_invoice_url} target="_blank" rel="noopener" class="text-terracota-600 hover:underline text-body-sm">Ver fatura</a>}
                      {inv.boleto_url && <a href={inv.boleto_url} target="_blank" rel="noopener" class="text-terracota-600 hover:underline text-body-sm ml-2">Boleto</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancel (only if active) */}
      {state.status === "active" && (
        <div class="mt-8">
          <form method="post" action="/assinatura/cancelar" onsubmit="return confirm('Tem certeza? Seu acesso será suspenso ao fim do período já pago.')">
            <button type="submit" class="text-body-sm text-status-red hover:underline">Cancelar assinatura</button>
          </form>
        </div>
      )}
    </>,
  );
});

// ============================================================
// POST /assinatura/assinar/:plan — subscribe to a plan
// ============================================================
subscriptionRoutes.post("/assinar/:plan", async (c) => {
  const user = c.get("user");
  const planId = c.req.param("plan");
  const body = await c.req.parseBody();
  const billingCycle = (body.billing_cycle as string) === "yearly" ? "yearly" : "monthly";

  if (!PLAN_INFO[planId] || planId === "trial" || planId === "enterprise") {
    return c.redirect("/assinatura");
  }

  // Fetch plan from DB
  const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).single();
  if (!plan) return c.redirect("/assinatura");

  const amount = billingCycle === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents;

  // Fetch tenant data
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, cnpj, email_public, asaas_customer_id, asaas_subscription_id")
    .eq("id", user.tenantId)
    .single();
  if (!tenant) return c.redirect("/assinatura");

  if (!asaasConfigured()) {
    // Demo mode: activate without real payment (for dev/trial)
    log.warn("Asaas not configured — activating subscription in demo mode", { tenantId: user.tenantId, planId });
    await supabase
      .from("tenants")
      .update({
        subscription_status: "active",
        subscription_plan: planId,
        plan: planId,
        max_users: plan.max_users,
        current_period_end: new Date(Date.now() + (billingCycle === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", user.tenantId);

    // Create a saas_invoice record
    const year = new Date().getFullYear();
    const { data: lastInv } = await supabase
      .from("saas_invoices")
      .select("number")
      .like("number", `SaaS-${year}-%`)
      .order("number", { ascending: false })
      .limit(1);
    const seq = Number(lastInv?.[0]?.number?.replace(`SaaS-${year}-`, "") ?? "0") + 1;
    const number = `SaaS-${year}-${String(seq).padStart(4, "0")}`;

    await supabase.from("saas_invoices").insert({
      tenant_id: user.tenantId,
      plan_id: planId,
      number,
      amount_cents: amount,
      status: "paid",
      billing_cycle: billingCycle,
      paid_at: new Date().toISOString(),
    });

    return c.redirect("/assinatura?success=1");
  }

  try {
    // 1. Create or reuse Asaas customer
    let customerId = tenant.asaas_customer_id;
    if (!customerId) {
      const customer = await createCustomer({
        name: tenant.name,
        email: user.email,
        cpfCnpj: tenant.cnpj ?? undefined,
      });
      customerId = customer.id;
    }

    // 2. Cancel existing subscription if any
    if (tenant.asaas_subscription_id) {
      try {
        await cancelSubscription(tenant.asaas_subscription_id);
      } catch (e) {
        log.warn("Failed to cancel old subscription", { error: String(e) });
      }
    }

    // 3. Create new subscription
    const subscription = await createSubscription({
      customerId,
      valueCents: amount,
      billingType: "PIX",
      cycle: billingCycle === "yearly" ? "YEARLY" : "MONTHLY",
      description: `PragmaOS ${plan.name} — ${billingCycle === "yearly" ? "Anual" : "Mensal"}`,
    });

    // 4. Update tenant
    await supabase
      .from("tenants")
      .update({
        asaas_customer_id: customerId,
        asaas_subscription_id: subscription.id,
        subscription_status: "active",
        subscription_plan: planId,
        plan: planId,
        max_users: plan.max_users,
        current_period_end: new Date(Date.now() + (billingCycle === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", user.tenantId);

    return c.redirect("/assinatura?success=1");
  } catch (err) {
    log.error("Subscription creation failed", { tenantId: user.tenantId, planId, error: String(err) });
    return c.redirect("/assinatura?error=1");
  }
});

// ============================================================
// POST /assinatura/cancelar — cancel subscription
// ============================================================
subscriptionRoutes.post("/cancelar", async (c) => {
  const user = c.get("user");
  const { data: tenant } = await supabase
    .from("tenants")
    .select("asaas_subscription_id")
    .eq("id", user.tenantId)
    .single();

  if (tenant?.asaas_subscription_id && asaasConfigured()) {
    try {
      await cancelSubscription(tenant.asaas_subscription_id);
    } catch (e) {
      log.error("Failed to cancel Asaas subscription", { error: String(e) });
    }
  }

  await supabase
    .from("tenants")
    .update({
      subscription_status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("id", user.tenantId);

  return c.redirect("/assinatura");
});

// ============================================================
// POST /assinatura/webhook — Asaas webhook (public, no auth)
// Asaas sends payment status updates here.
// ============================================================
subscriptionRoutes.post("/webhook", async (c) => {
  try {
    // Validate Asaas webhook signature/token
    const asaasToken = c.req.header("asaas-access-token");
    if (!ASAAS_WEBHOOK_TOKEN || !asaasToken || asaasToken !== ASAAS_WEBHOOK_TOKEN) {
      log.warn("Asaas webhook: invalid or missing token", { hasToken: !!asaasToken });
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }

    const event = (await c.req.json()) as AsaasWebhookEvent;
    log.info("Asaas webhook received", { event: event.event, paymentId: event.payment?.id });

    if (!event.payment?.subscription) {
      return c.json({ ok: true });
    }

    // Find the tenant by asaas_subscription_id
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, subscription_status")
      .eq("asaas_subscription_id", event.payment.subscription)
      .maybeSingle();

    if (!tenant) {
      log.warn("Asaas webhook: tenant not found", { subscriptionId: event.payment.subscription });
      return c.json({ ok: true });
    }

    // Update subscription status based on payment status
    const paymentStatus = event.payment.status;
    let newStatus = tenant.subscription_status;

    if (paymentStatus === "CONFIRMED" || paymentStatus === "RECEIVED") {
      newStatus = "active";
    } else if (paymentStatus === "OVERDUE") {
      newStatus = "past_due";
    }

    if (newStatus !== tenant.subscription_status) {
      await supabase
        .from("tenants")
        .update({ subscription_status: newStatus })
        .eq("id", tenant.id);
    }

    // Update or create saas_invoice
    const { data: existing } = await supabase
      .from("saas_invoices")
      .select("id")
      .eq("asaas_payment_id", event.payment.id)
      .maybeSingle();

    const invStatus = paymentStatus === "CONFIRMED" || paymentStatus === "RECEIVED" ? "paid" : paymentStatus === "OVERDUE" ? "overdue" : "open";

    if (existing) {
      await supabase
        .from("saas_invoices")
        .update({
          status: invStatus,
          paid_at: invStatus === "paid" ? new Date().toISOString() : null,
          pix_copy_paste: event.payment.pixCopyPasteCode ?? null,
          asaas_invoice_url: event.payment.invoiceUrl ?? null,
          boleto_url: event.payment.bankSlipUrl ?? null,
        })
        .eq("id", existing.id);
    } else {
      const year = new Date().getFullYear();
      const number = `SaaS-${year}-${event.payment.id.slice(0, 8)}`;
      await supabase.from("saas_invoices").insert({
        tenant_id: tenant.id,
        plan_id: "starter", // will be updated by tenant's plan
        number,
        amount_cents: Math.round(event.payment.value * 100),
        status: invStatus,
        asaas_payment_id: event.payment.id,
        due_date: event.payment.dueDate,
        paid_at: invStatus === "paid" ? new Date().toISOString() : null,
        pix_copy_paste: event.payment.pixCopyPasteCode ?? null,
        asaas_invoice_url: event.payment.invoiceUrl ?? null,
        boleto_url: event.payment.bankSlipUrl ?? null,
      });
    }

    return c.json({ ok: true });
  } catch (err) {
    log.error("Asaas webhook error", { error: String(err) });
    return c.json({ ok: false }, 500);
  }
});
