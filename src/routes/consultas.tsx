// Consultas Legais — powered by BigDataCorp.
//
// Routes:
//   GET  /consultas              — dashboard with grid of consultation cards + credit balance
//   GET  /consultas/:type        — form page for a specific consultation type
//   POST /consultas/:type        — execute consultation, save result, redirect
//   GET  /consultas/resultado/:id — show result of a consultation
//   GET  /consultas/historico    — history of all consultations
//   POST /consultas/:id/vincular — link consultation to a case

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { setFlash } from "../lib/flash";
import { getSubscriptionState } from "../lib/subscription";
import { PageHeader, Panel, Badge, Select, BtnLink } from "../components/ui";
import {
  callBigData,
  buildQuery,
  isBigDataConfigured,
  isValidCPF,
  isValidCNPJ,
  isValidPlaca,
  detectDocType,
  formatDoc,
  formatCPF,
  formatCNPJ,
  getPlanCredits,
  getCurrentMonth,
  type BigDataEndpoint,
  type BigDataResponse,
} from "../lib/bigdata";

export const consultasRoutes = new Hono<AppEnv>();

consultasRoutes.use("*", requireAuth);

// --- Types ---

type ConsultaType = {
  id: string;
  label: string;
  description: string | null;
  input_type: string;
  icon: string;
  credits_cost: number;
  category: string;
  bigdata_endpoint: string;
  bigdata_datasets: string;
  enabled: boolean;
  sort_order: number;
};

type ConsultaRecord = {
  id: string;
  tenant_id: string;
  user_id: string;
  type_id: string;
  input_value: string;
  input_type: string;
  input_label: string | null;
  status: string;
  result: BigDataResponse | null;
  error_message: string | null;
  case_id: string | null;
  credits_used: number;
  created_at: string;
  completed_at: string | null;
};

type CreditBalance = {
  included_credits: number;
  used_credits: number;
  purchased_credits: number;
  remaining: number;
};

// --- Helpers ---

const CATEGORY_LABELS: Record<string, string> = {
  pessoas: "Pessoas",
  empresas: "Empresas",
  veiculos: "Veiculos",
  credito: "Credito",
  processos: "Processos",
};

const CATEGORY_ICONS: Record<string, string> = {
  pessoas: "ph-user",
  empresas: "ph-building",
  veiculos: "ph-car",
  credito: "ph-credit-card",
  processos: "ph-scales",
};

const STATUS_CONFIG: Record<string, { label: string; color: "green" | "red" | "yellow" | "blue" | "gray"; icon: string }> = {
  pending: { label: "Pendente", color: "gray", icon: "ph-clock" },
  processing: { label: "Processando", color: "blue", icon: "ph-spinner" },
  completed: { label: "Concluida", color: "green", icon: "ph-check-circle" },
  error: { label: "Erro", color: "red", icon: "ph-warning-circle" },
  no_data: { label: "Sem dados", color: "yellow", icon: "ph-question" },
};

function getStatusConfig(status: string): { label: string; color: "green" | "red" | "yellow" | "blue" | "gray"; icon: string } {
  return STATUS_CONFIG[status] ?? { label: "Pendente", color: "gray" as const, icon: "ph-clock" };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

// Get the credit balance for the current month.
async function getCreditBalance(tenantId: string, plan: string): Promise<CreditBalance> {
  const month = getCurrentMonth();
  const { data } = await supabase
    .from("consulta_credits")
    .select("included_credits, used_credits, purchased_credits")
    .eq("tenant_id", tenantId)
    .eq("month", month)
    .single();

  if (data) {
    return {
      included_credits: data.included_credits,
      used_credits: data.used_credits,
      purchased_credits: data.purchased_credits,
      remaining: data.included_credits + data.purchased_credits - data.used_credits,
    };
  }

  // No row yet — initialize with plan defaults.
  const included = getPlanCredits(plan);
  return {
    included_credits: included,
    used_credits: 0,
    purchased_credits: 0,
    remaining: included,
  };
}

// Ensure the credit row exists for the current month (upsert).
async function ensureCreditRow(tenantId: string, plan: string): Promise<void> {
  const month = getCurrentMonth();
  const included = getPlanCredits(plan);
  await supabase
    .from("consulta_credits")
    .upsert(
      { tenant_id: tenantId, month, included_credits: included, used_credits: 0, purchased_credits: 0 },
      { onConflict: "tenant_id,month" },
    );
}

// Deduct credits after a successful consultation.
async function deductCredits(tenantId: string, plan: string, amount: number): Promise<void> {
  await ensureCreditRow(tenantId, plan);
  const month = getCurrentMonth();
  // Atomic increment of used_credits.
  const { data } = await supabase
    .from("consulta_credits")
    .select("used_credits")
    .eq("tenant_id", tenantId)
    .eq("month", month)
    .single();
  if (data) {
    await supabase
      .from("consulta_credits")
      .update({ used_credits: data.used_credits + amount })
      .eq("tenant_id", tenantId)
      .eq("month", month);
  }
}

// Validate input based on consultation type.
function validateInput(type: ConsultaType, value: string): string | null {
  const clean = value.replace(/\D/g, "");
  switch (type.input_type) {
    case "cpf":
      if (!isValidCPF(value)) return "CPF invalido (deve ter 11 digitos)";
      return null;
    case "cnpj":
      if (!isValidCNPJ(value)) return "CNPJ invalido (deve ter 14 digitos)";
      return null;
    case "placa":
      if (!isValidPlaca(value)) return "Placa invalida (deve ter 7 caracteres)";
      return null;
    case "cpf_cnpj":
      if (!isValidCPF(value) && !isValidCNPJ(value)) return "Documento invalido (CPF com 11 ou CNPJ com 14 digitos)";
      return null;
    default:
      return clean.length < 3 ? "Valor muito curto" : null;
  }
}

// Extract a display label from the API response (name of the person/company).
function extractLabel(result: BigDataResponse | null): string | null {
  if (!result?.Result?.length) return null;
  const entity = result.Result[0];
  if (!entity) return null;
  return entity.BasicData?.Name ?? entity.CompanyData?.CompanyName ?? null;
}

// --- GET /consultas — Dashboard ---

consultasRoutes.get("/", async (c) => {
  const user = c.get("user");
  const subState = await getSubscriptionState(user.tenantId);
  const balance = await getCreditBalance(user.tenantId, subState.plan);

  // Fetch all enabled consultation types.
  const { data: types } = await supabase
    .from("consulta_types")
    .select("*")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  // Group by category.
  const byCategory: Record<string, ConsultaType[]> = {};
  for (const t of (types ?? []) as ConsultaType[]) {
    const cat = t.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat]!.push(t);
  }

  // Recent consultations (last 5).
  const { data: recent } = await supabase
    .from("consultas")
    .select("id, type_id, input_value, input_label, status, created_at, consulta_types(label, icon)")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  const configured = isBigDataConfigured();

  return renderPage(
    c,
    { title: "Consultas Legais", active: "consultas" },
    <>
      <PageHeader title="Consultas Legais" icon="ph-magnifying-glass">
        <p class="text-body-sm text-gray-500">Localize bens, pessoas, empresas e processos</p>
      </PageHeader>

      {/* Credit balance banner */}
      <div class="bg-gradient-to-r from-carvao-800 to-carvao-700 rounded-xl p-5 mb-6 text-white">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div class="flex items-center gap-3">
            <i class="ph-bold ph-coins text-h1 text-amber-400" aria-hidden="true"></i>
            <div>
              <div class="text-body-sm text-gray-300">Creditos disponiveis este mes</div>
              <div class="text-h1 font-bold">{balance.remaining}</div>
            </div>
          </div>
          <div class="flex gap-6 text-body-sm">
            <div>
              <div class="text-gray-300">Inclusos no plano</div>
              <div class="font-semibold">{balance.included_credits}</div>
            </div>
            <div>
              <div class="text-gray-300">Utilizados</div>
              <div class="font-semibold">{balance.used_credits}</div>
            </div>
            <div>
              <div class="text-gray-300">Comprados</div>
              <div class="font-semibold">{balance.purchased_credits}</div>
            </div>
          </div>
          <a href="/consultas/historico" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-clock-countdown" aria-hidden="true"></i>
            Historico
          </a>
        </div>
      </div>

      {!configured && (
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <i class="ph ph-warning text-h4 text-amber-600 mt-0.5" aria-hidden="true"></i>
          <div class="text-body-sm text-amber-800">
            <strong>Consultas Legais nao configuradas.</strong> O administrador precisa definir as credenciais da BigDataCorp (BIGDATA_ACCESS_TOKEN e BIGDATA_TOKEN_ID) para habilitar as consultas.
          </div>
        </div>
      )}

      {/* Consultation cards grouped by category */}
      {Object.entries(byCategory).map(([category, items]) => (
        <div class="mb-6">
          <h2 class="text-h3 font-bold text-gray-800 mb-3 flex items-center gap-2">
            <i class={`ph ${CATEGORY_ICONS[category] ?? "ph-circle"} text-terracota-500`} aria-hidden="true"></i>
            {CATEGORY_LABELS[category] ?? category}
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((t) => (
              <a
                href={`/consultas/${t.id}`}
                class={`block p-5 bg-white rounded-xl border border-gray-100 hover:border-terracota-300 hover:shadow-md transition ${!configured ? "opacity-50 pointer-events-none" : ""}`}
              >
                <div class="flex items-start justify-between mb-3">
                  <div class="w-11 h-11 rounded-lg bg-carvao-50 flex items-center justify-center">
                    <i class={`ph ${t.icon} text-h3 text-carvao-700`} aria-hidden="true"></i>
                  </div>
                  <span class="badge badge-gray text-body-xs">{t.credits_cost} credito{t.credits_cost !== 1 ? "s" : ""}</span>
                </div>
                <div class="font-semibold text-gray-800 mb-1">{t.label}</div>
                <div class="text-body-sm text-gray-500 line-clamp-2">{t.description}</div>
              </a>
            ))}
          </div>
        </div>
      ))}

      {/* Recent consultations */}
      {(recent ?? []).length > 0 && (
        <Panel title="Consultas Recentes" icon="ph-clock">
          <div class="space-y-2">
            {(recent ?? []).map((r) => {
              const ct = r.consulta_types as unknown as { label: string; icon: string } | null;
              const statusCfg = getStatusConfig(r.status);
              return (
                <a
                  href={`/consultas/resultado/${r.id}`}
                  class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition border border-gray-50"
                >
                  <i class={`ph ${ct?.icon ?? "ph-magnifying-glass"} text-h4 text-carvao-600`} aria-hidden="true"></i>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-800 truncate">
                      {ct?.label ?? r.type_id}: {r.input_label ?? formatDoc(r.input_value)}
                    </div>
                    <div class="text-body-xs text-gray-400">{formatDateTime(r.created_at)}</div>
                  </div>
                  <Badge color={statusCfg.color} icon={statusCfg.icon}>{statusCfg.label}</Badge>
                </a>
              );
            })}
          </div>
        </Panel>
      )}
    </>,
  );
});

// --- GET /consultas/historico — History ---

consultasRoutes.get("/historico", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const statusFilter = c.req.query("status") ?? "";

  let query = supabase
    .from("consultas")
    .select("id, type_id, input_value, input_type, input_label, status, error_message, credits_used, created_at, completed_at, case_id, cases(title), consulta_types(label, icon)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: records, count } = await query;
  const totalPages = count ? Math.ceil(count / limit) : 1;

  return renderPage(
    c,
    { title: "Historico de Consultas", active: "consultas" },
    <>
      <PageHeader title="Historico de Consultas" icon="ph-clock-countdown">
        <a href="/consultas" class="btn btn-secondary inline-flex items-center gap-1">
          <i class="ph ph-arrow-left" aria-hidden="true"></i>
          Voltar
        </a>
      </PageHeader>

      <div class="flex gap-2 mb-4 flex-wrap">
        <a href="/consultas/historico" class={`btn btn-sm ${!statusFilter ? "btn-primary" : "btn-secondary"}`}>Todas</a>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <a href={`/consultas/historico?status=${key}`} class={`btn btn-sm ${statusFilter === key ? "btn-primary" : "btn-secondary"}`}>
            <i class={`ph ${cfg.icon}`} aria-hidden="true"></i>
            {cfg.label}
          </a>
        ))}
      </div>

      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Documento</th>
              <th>Status</th>
              <th>Processo</th>
              <th>Creditos</th>
              <th>Data</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {((records ?? []) as unknown as ConsultaRecord[]).length === 0 ? (
              <tr>
                <td colspan={7} class="text-center text-gray-500 py-8">
                  <i class="ph ph-magnifying-glass text-h1 block mb-2 text-gray-300" aria-hidden="true"></i>
                  Nenhuma consulta realizada ainda.
                </td>
              </tr>
            ) : (
              (records ?? []).map((r) => {
                const ct = r.consulta_types as unknown as { label: string; icon: string } | null;
                const caseInfo = r.cases as unknown as { title: string } | null;
                const statusCfg = getStatusConfig(r.status);
                return (
                  <tr>
                    <td>
                      <div class="flex items-center gap-2">
                        <i class={`ph ${ct?.icon ?? "ph-magnifying-glass"} text-carvao-600`} aria-hidden="true"></i>
                        <span class="font-medium">{ct?.label ?? r.type_id}</span>
                      </div>
                    </td>
                    <td>{r.input_label ?? formatDoc(r.input_value)}</td>
                    <td><Badge color={statusCfg.color} icon={statusCfg.icon}>{statusCfg.label}</Badge></td>
                    <td>{caseInfo?.title ? <span class="text-body-sm">{caseInfo.title}</span> : <span class="text-gray-300">-</span>}</td>
                    <td class="text-center">{r.credits_used}</td>
                    <td class="text-body-sm">{formatDateTime(r.created_at)}</td>
                    <td>
                      <a href={`/consultas/resultado/${r.id}`} class="text-terracota-600 hover:underline text-body-sm">Ver</a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div class="flex items-center justify-center gap-1 mt-4">
          {page > 1 && <a href={`/consultas/historico?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`} class="btn btn-secondary btn-sm"><i class="ph ph-caret-left" aria-hidden="true"></i></a>}
          <span class="text-body-sm text-gray-500 px-2">Pagina {page} de {totalPages}</span>
          {page < totalPages && <a href={`/consultas/historico?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`} class="btn btn-secondary btn-sm"><i class="ph ph-caret-right" aria-hidden="true"></i></a>}
        </div>
      )}
    </>,
  );
});

// --- GET /consultas/:type — Form page ---

consultasRoutes.get("/:type", async (c) => {
  const typeId = c.req.param("type");

  // Skip if it's a known non-type route.
  if (typeId === "historico" || typeId === "resultado" || typeId === "lote") {
    return c.notFound();
  }

  const user = c.get("user");
  const subState = await getSubscriptionState(user.tenantId);
  const balance = await getCreditBalance(user.tenantId, subState.plan);

  const { data: type } = await supabase
    .from("consulta_types")
    .select("*")
    .eq("id", typeId)
    .eq("enabled", true)
    .single();

  if (!type) {
    setFlash(c, "error", "Tipo de consulta nao encontrado");
    return c.redirect("/consultas");
  }

  const t = type as ConsultaType;

  // Fetch user's cases for the "vincular ao processo" dropdown.
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, case_number")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title", { ascending: true })
    .limit(100);

  const inputPlaceholder = {
    cpf: "000.000.000-00",
    cnpj: "00.000.000/0000-00",
    placa: "ABC1D23",
    cpf_cnpj: "CPF (11 digitos) ou CNPJ (14 digitos)",
  }[t.input_type] ?? "Documento";

  const inputLabel = {
    cpf: "CPF",
    cnpj: "CNPJ",
    placa: "Placa do veiculo",
    cpf_cnpj: "CPF ou CNPJ",
  }[t.input_type] ?? "Documento";

  const insufficientCredits = balance.remaining < t.credits_cost;
  const configured = isBigDataConfigured();

  return renderPage(
    c,
    { title: t.label, active: "consultas" },
    <>
      <PageHeader title={t.label} icon={t.icon}>
        <a href="/consultas" class="btn btn-secondary inline-flex items-center gap-1">
          <i class="ph ph-arrow-left" aria-hidden="true"></i>
          Voltar
        </a>
      </PageHeader>

      <div class="max-w-2xl">
        <Panel title="Nova Consulta" icon={t.icon}>
          <p class="text-body-sm text-gray-500 mb-4">{t.description}</p>

          <div class="flex items-center gap-2 mb-4 text-body-sm">
            <Badge color="gray" icon="ph-coins">{t.credits_cost} credito{t.credits_cost !== 1 ? "s" : ""}</Badge>
            <span class="text-gray-400">Saldo: {balance.remaining} creditos</span>
          </div>

          {!configured && (
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-body-sm text-amber-800">
              <i class="ph ph-warning" aria-hidden="true"></i> Consultas Legais nao configuradas pelo administrador.
            </div>
          )}

          {insufficientCredits && configured && (
            <div class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-body-sm text-red-800">
              <i class="ph ph-warning-circle" aria-hidden="true"></i> Creditos insuficientes. Voce tem {balance.remaining} creditos e esta consulta custa {t.credits_cost}.
            </div>
          )}

          <form action={`/consultas/${t.id}`} method="post" class="space-y-4">
            <div class="flex flex-col gap-1">
              <label for="input_value" class="text-body-sm font-semibold text-gray-700">
                {inputLabel} <span class="text-status-red">*</span>
              </label>
              <input
                id="input_value"
                name="input_value"
                type="text"
                placeholder={inputPlaceholder}
                required
                class="input"
                style={t.input_type === "placa" ? "text-transform: uppercase;" : ""}
              />
            </div>

            {/* Optional: link to a case */}
            {(cases ?? []).length > 0 && (
              <div class="flex flex-col gap-1">
                <label for="case_id" class="text-body-sm font-semibold text-gray-700">Vincular ao processo (opcional)</label>
                <select id="case_id" name="case_id" class="input">
                  <option value="">Nenhum processo</option>
                  {(cases ?? []).map((cs) => (
                    <option value={cs.id}>{cs.title}{cs.case_number ? ` (${cs.case_number})` : ""}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              class="btn btn-primary inline-flex items-center gap-2"
              disabled={!configured || insufficientCredits}
            >
              <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
              Consultar agora
            </button>
          </form>
        </Panel>

        {/* Previous consultations of this type */}
        <RecentSameType tenantId={user.tenantId} typeId={t.id} />
      </div>
    </>,
  );
});

// Server-side component to show recent consultations of the same type.
// We fetch inline because Hono JSX doesn't support async components.
function RecentSameType({ tenantId, typeId }: { tenantId: string; typeId: string }) {
  // This is rendered synchronously — we can't fetch here.
  // Instead, we'll render a placeholder link to the history filtered by type.
  return (
    <div class="mt-4 text-body-sm">
      <a href={`/consultas/historico`} class="text-terracota-600 hover:underline">
        Ver historico de consultas
      </a>
    </div>
  );
}

// --- POST /consultas/:type — Execute consultation ---

consultasRoutes.post("/:type", async (c) => {
  const typeId = c.req.param("type");
  const user = c.get("user");
  const subState = await getSubscriptionState(user.tenantId);

  const { data: type } = await supabase
    .from("consulta_types")
    .select("*")
    .eq("id", typeId)
    .eq("enabled", true)
    .single();

  if (!type) {
    setFlash(c, "error", "Tipo de consulta nao encontrado");
    return c.redirect("/consultas");
  }

  const t = type as ConsultaType;

  if (!isBigDataConfigured()) {
    setFlash(c, "error", "Consultas Legais nao configuradas pelo administrador");
    return c.redirect(`/consultas/${t.id}`);
  }

  const formData = await c.req.formData();
  const inputValue = (formData.get("input_value") as string ?? "").trim();
  const caseId = (formData.get("case_id") as string ?? "").trim() || null;

  // Validate input.
  const validationError = validateInput(t, inputValue);
  if (validationError) {
    setFlash(c, "error", validationError);
    return c.redirect(`/consultas/${t.id}`);
  }

  // Check credits.
  const balance = await getCreditBalance(user.tenantId, subState.plan);
  if (balance.remaining < t.credits_cost) {
    setFlash(c, "error", `Creditos insuficientes. Voce tem ${balance.remaining} e precisa de ${t.credits_cost}.`);
    return c.redirect(`/consultas/${t.id}`);
  }

  // Determine actual input type for cpf_cnpj.
  const actualInputType = t.input_type === "cpf_cnpj" ? (detectDocType(inputValue) ?? "cpf") : t.input_type;

  // Create a pending consultation record.
  const { data: consulta, error: insertError } = await supabase
    .from("consultas")
    .insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      type_id: t.id,
      input_value: inputValue,
      input_type: actualInputType,
      status: "processing",
      case_id: caseId,
      credits_used: t.credits_cost,
    })
    .select("id")
    .single();

  if (insertError || !consulta) {
    setFlash(c, "error", "Erro ao registrar consulta");
    return c.redirect(`/consultas/${t.id}`);
  }

  // Execute the BigDataCorp API call.
  const query = buildQuery(actualInputType, inputValue);
  const result = await callBigData(t.bigdata_endpoint as BigDataEndpoint, {
    q: query,
    Datasets: t.bigdata_datasets,
  });

  if (!result.success) {
    // Mark as error.
    await supabase
      .from("consultas")
      .update({ status: "error", error_message: result.error ?? "Erro desconhecido", completed_at: new Date().toISOString() })
      .eq("id", consulta.id);
    setFlash(c, "error", `Erro na consulta: ${result.error}`);
    return c.redirect(`/consultas/resultado/${consulta.id}`);
  }

  // Check if we got data.
  const hasData = result.data?.Result?.length && result.data.Result.length > 0;
  const label = extractLabel(result.data ?? null);

  // Update the consultation record with the result.
  await supabase
    .from("consultas")
    .update({
      status: hasData ? "completed" : "no_data",
      result: result.data as unknown as Record<string, unknown>,
      input_label: label,
      completed_at: new Date().toISOString(),
    })
    .eq("id", consulta.id);

  // Deduct credits only on completed (data found) queries.
  if (hasData) {
    await deductCredits(user.tenantId, subState.plan, t.credits_cost);
  }

  setFlash(c, hasData ? "success" : "warning", hasData ? "Consulta concluida com sucesso" : "Nenhum dado encontrado para o documento informado");
  return c.redirect(`/consultas/resultado/${consulta.id}`);
});

// --- GET /consultas/resultado/:id — Show result ---

consultasRoutes.get("/resultado/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const { data: record } = await supabase
    .from("consultas")
    .select("*, consulta_types(*), cases(id, title, case_number)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!record) {
    setFlash(c, "error", "Consulta nao encontrada");
    return c.redirect("/consultas");
  }

  const r = record as ConsultaRecord & {
    consulta_types: ConsultaType;
    cases: { id: string; title: string; case_number: string | null } | null;
  };
  const t = r.consulta_types;
  const statusCfg = getStatusConfig(r.status);

  // Fetch cases for the vincular dropdown.
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, case_number")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title", { ascending: true })
    .limit(100);

  return renderPage(
    c,
    { title: `Resultado: ${t.label}`, active: "consultas" },
    <>
      <PageHeader title={`Resultado: ${t.label}`} icon={t.icon}>
        <div class="flex gap-2">
          <a href={`/consultas/${t.id}`} class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-clock" aria-hidden="true"></i>
            Nova consulta
          </a>
          <a href="/consultas" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>
            Dashboard
          </a>
        </div>
      </PageHeader>

      {/* Meta info */}
      <div class="bg-white rounded-xl border border-gray-100 p-5 mb-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-body-sm">
          <div>
            <div class="text-gray-400">Documento consultado</div>
            <div class="font-semibold text-gray-800">{r.input_label ?? formatDoc(r.input_value)}</div>
          </div>
          <div>
            <div class="text-gray-400">Tipo</div>
            <div class="font-semibold text-gray-800">{t.label}</div>
          </div>
          <div>
            <div class="text-gray-400">Status</div>
            <Badge color={statusCfg.color} icon={statusCfg.icon}>{statusCfg.label}</Badge>
          </div>
          <div>
            <div class="text-gray-400">Data</div>
            <div class="font-semibold text-gray-800">{formatDateTime(r.created_at)}</div>
          </div>
        </div>
        {r.error_message && (
          <div class="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-body-sm text-red-800">
            <i class="ph ph-warning-circle" aria-hidden="true"></i> {r.error_message}
          </div>
        )}
      </div>

      {/* Link to case */}
      <div class="bg-white rounded-xl border border-gray-100 p-5 mb-4">
        <form action={`/consultas/${r.id}/vincular`} method="post" class="flex items-end gap-3">
          <div class="flex-1">
            <label for="case_id" class="text-body-sm font-semibold text-gray-700 block mb-1">Vincular ao processo</label>
            <select id="case_id" name="case_id" class="input">
              <option value="">Nenhum processo</option>
              {(cases ?? []).map((cs) => (
                <option value={cs.id} selected={cs.id === r.case_id}>{cs.title}{cs.case_number ? ` (${cs.case_number})` : ""}</option>
              ))}
            </select>
          </div>
          <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-link" aria-hidden="true"></i>
            Salvar
          </button>
        </form>
        {r.cases && (
          <div class="mt-2 text-body-sm text-gray-500">
            Vinculado a: <a href={`/cases/${r.cases.id}`} class="text-terracota-600 hover:underline">{r.cases.title}</a>
          </div>
        )}
      </div>

      {/* Result rendering */}
      {r.status === "completed" && r.result && (
        <ConsultaResultRenderer type={t} result={r.result} />
      )}

      {r.status === "no_data" && (
        <div class="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <i class="ph ph-magnifying-glass text-h1 block mb-3 text-gray-300" aria-hidden="true"></i>
          <h3 class="text-h3 font-semibold text-gray-700 mb-1">Nenhum dado encontrado</h3>
          <p class="text-body-sm text-gray-500">O documento consultado nao retornou resultados nas bases consultadas.</p>
        </div>
      )}
    </>,
  );
});

// --- POST /consultas/:id/vincular — Link consultation to a case ---

consultasRoutes.post("/:id/vincular", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const formData = await c.req.formData();
  const caseId = (formData.get("case_id") as string ?? "").trim() || null;

  const { error } = await supabase
    .from("consultas")
    .update({ case_id: caseId })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) {
    setFlash(c, "error", "Erro ao vincular processo");
  } else {
    setFlash(c, "success", caseId ? "Consulta vinculada ao processo" : "Vinculo removido");
  }

  return c.redirect(`/consultas/resultado/${id}`);
});

// --- Result Renderer ---
// Renders the BigDataCorp response in a human-readable format based on the consultation type.

function ConsultaResultRenderer({ type, result }: { type: ConsultaType; result: BigDataResponse }) {
  const entity = result.Result?.[0];
  if (!entity) {
    return (
      <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-500">
        Nenhum dado retornado pela API.
      </div>
    );
  }

  return (
    <div class="space-y-4">
      {/* Basic Data */}
      {entity.BasicData && (
        <Panel title="Dados Basicos" icon="ph-id-card">
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
            <DataRow label="Nome" value={entity.BasicData.Name} />
            <DataRow label="CPF" value={entity.BasicData.TaxId ? formatCPF(entity.BasicData.TaxId) : undefined} />
            <DataRow label="Data de Nascimento" value={entity.BasicData.BirthDate} />
            <DataRow label="Genero" value={entity.BasicData.Gender} />
            <DataRow label="Nome da Mae" value={entity.BasicData.MothersName} />
            <DataRow label="Nome do Pai" value={entity.BasicData.FathersName} />
            <DataRow label="Status" value={entity.BasicData.Status} />
            <DataRow label="Data de Obito" value={entity.BasicData.DeathDate} highlight={!!entity.BasicData.DeathDate} />
          </dl>
        </Panel>
      )}

      {/* Company Data */}
      {entity.CompanyData && (
        <Panel title="Dados da Empresa" icon="ph-building">
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
            <DataRow label="Razao Social" value={entity.CompanyData.CompanyName} />
            <DataRow label="Nome Fantasia" value={entity.CompanyData.TradeName} />
            <DataRow label="CNPJ" value={entity.CompanyData.TaxId ? formatCNPJ(entity.CompanyData.TaxId) : undefined} />
            <DataRow label="Status" value={entity.CompanyData.Status} />
            <DataRow label="CNAE" value={entity.CompanyData.CNAEDescription ? `${entity.CompanyData.CNAE} - ${entity.CompanyData.CNAEDescription}` : entity.CompanyData.CNAE} />
            <DataRow label="Capital Social" value={entity.CompanyData.Capital} />
            <DataRow label="Data de Abertura" value={entity.CompanyData.OpeningDate} />
            <DataRow label="Endereco" value={[entity.CompanyData.Street, entity.CompanyData.Number, entity.CompanyData.District, entity.CompanyData.City, entity.CompanyData.State].filter(Boolean).join(", ")} />
          </dl>
        </Panel>
      )}

      {/* QSA */}
      {entity.QSA && entity.QSA.length > 0 && (
        <Panel title="Quadro Societario (QSA)" icon="ph-users-three">
          <table class="data-table">
            <thead>
              <tr><th>Nome</th><th>CPF/CNPJ</th><th>Cargo</th></tr>
            </thead>
            <tbody>
              {entity.QSA.map((s, i) => (
                <tr key={i}>
                  <td class="font-medium">{s.Name ?? "-"}</td>
                  <td>{s.TaxId ? formatDoc(s.TaxId) : "-"}</td>
                  <td>{s.Role ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Contacts */}
      {entity.Contacts && (
        <Panel title="Contatos" icon="ph-address-book">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-body-sm">
            <div>
              <div class="text-gray-400 mb-1">E-mails</div>
              {(entity.Contacts.Emails ?? []).length > 0 ? (
                <ul class="space-y-1">{entity.Contacts.Emails!.map((e, i) => <li key={i}>{e}</li>)}</ul>
              ) : <span class="text-gray-300">Nenhum</span>}
            </div>
            <div>
              <div class="text-gray-400 mb-1">Telefones</div>
              {(entity.Contacts.Phones ?? []).length > 0 ? (
                <ul class="space-y-1">{entity.Contacts.Phones!.map((p, i) => <li key={i}>{p}</li>)}</ul>
              ) : <span class="text-gray-300">Nenhum</span>}
            </div>
            <div>
              <div class="text-gray-400 mb-1">Enderecos</div>
              {(entity.Contacts.Addresses ?? []).length > 0 ? (
                <ul class="space-y-1">
                  {entity.Contacts.Addresses!.map((a, i) => (
                    <li key={i}>{[a.Street, a.Number, a.Complement, a.District, a.City, a.State, a.ZipCode].filter(Boolean).join(", ")}</li>
                  ))}
                </ul>
              ) : <span class="text-gray-300">Nenhum</span>}
            </div>
          </div>
        </Panel>
      )}

      {/* Vehicles */}
      {entity.Vehicles && entity.Vehicles.length > 0 && (
        <Panel title="Veiculos Encontrados" icon="ph-car">
          <table class="data-table">
            <thead>
              <tr><th>Placa</th><th>Marca/Modelo</th><th>Ano</th><th>Cor</th><th>RENAVAM</th></tr>
            </thead>
            <tbody>
              {entity.Vehicles.map((v, i) => (
                <tr key={i}>
                  <td class="font-medium">{v.Plate ?? "-"}</td>
                  <td>{[v.Brand, v.Model].filter(Boolean).join(" ") || "-"}</td>
                  <td>{v.Year ?? "-"}</td>
                  <td>{v.Color ?? "-"}</td>
                  <td>{v.Renavam ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Plate Data */}
      {entity.PlateData && (
        <Panel title="Dados do Veiculo" icon="ph-car-profile">
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
            <DataRow label="Placa" value={entity.PlateData.Plate} />
            <DataRow label="Marca/Modelo" value={[entity.PlateData.Brand, entity.PlateData.Model].filter(Boolean).join(" ")} />
            <DataRow label="Ano" value={entity.PlateData.Year} />
            <DataRow label="Cor" value={entity.PlateData.Color} />
            <DataRow label="Chassi" value={entity.PlateData.Chassis} />
            <DataRow label="RENAVAM" value={entity.PlateData.Renavam} />
            <DataRow label="Proprietario" value={entity.PlateData.OwnerName} />
            <DataRow label="CPF/CNPJ do Proprietario" value={entity.PlateData.OwnerTaxId ? formatDoc(entity.PlateData.OwnerTaxId) : undefined} />
          </dl>
          {entity.PlateData.Restrictions && entity.PlateData.Restrictions.length > 0 && (
            <div class="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <div class="font-semibold text-red-800 mb-1"><i class="ph ph-warning" aria-hidden="true"></i> Restricoes</div>
              <ul class="text-body-sm text-red-700 list-disc list-inside">
                {entity.PlateData.Restrictions.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {/* Vehicle Debits */}
      {entity.VehicleDebits && (
        <Panel title="Debitos Veiculares" icon="ph-traffic-cone">
          <dl class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-body-sm mb-4">
            <DataRow label="Total em Debitos" value={entity.VehicleDebits.TotalDebits} highlight={!!entity.VehicleDebits.TotalDebits} />
            <DataRow label="IPVA" value={entity.VehicleDebits.IPVA} />
            <DataRow label="Licenciamento" value={entity.VehicleDebits.Licensing} />
          </dl>
          {entity.VehicleDebits.Fines && entity.VehicleDebits.Fines.length > 0 && (
            <table class="data-table">
              <thead><tr><th>Descricao</th><th>Valor</th><th>Data</th><th>Status</th></tr></thead>
              <tbody>
                {entity.VehicleDebits.Fines.map((f, i) => (
                  <tr key={i}>
                    <td>{f.Description ?? "-"}</td>
                    <td>{f.Amount ?? "-"}</td>
                    <td>{f.Date ?? "-"}</td>
                    <td>{f.Status ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {/* Risk / Credit */}
      {entity.RiskData && (
        <Panel title="Analise de Risco" icon="ph-triangle-warning">
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm mb-4">
            <DataRow label="Nivel de Risco" value={entity.RiskData.RiskLevel} highlight={entity.RiskData.RiskLevel === "Alto"} />
            <DataRow label="Score" value={entity.RiskData.RiskScore} />
          </dl>
          {entity.RiskData.NegativeRecords && entity.RiskData.NegativeRecords.length > 0 && (
            <div>
              <div class="font-semibold text-gray-700 mb-2">Registros Negativos</div>
              <table class="data-table">
                <thead><tr><th>Fonte</th><th>Valor</th><th>Data</th></tr></thead>
                <tbody>
                  {entity.RiskData.NegativeRecords.map((n, i) => (
                    <tr key={i}>
                      <td>{n.Source ?? "-"}</td>
                      <td>{n.Amount ?? "-"}</td>
                      <td>{n.Date ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Debt Collection */}
      {entity.DebtCollection && (
        <Panel title="Cobrancas e Dividas" icon="ph-hand-coins">
          <div class="mb-3">
            <Badge color={entity.DebtCollection.HasDebts ? "red" : "green"} icon={entity.DebtCollection.HasDebts ? "ph-warning" : "ph-check"}>
              {entity.DebtCollection.HasDebts ? `Dividas encontradas (${entity.DebtCollection.TotalDebts ?? "0"})` : "Sem dividas"}
            </Badge>
          </div>
          {entity.DebtCollection.Debts && entity.DebtCollection.Debts.length > 0 && (
            <table class="data-table">
              <thead><tr><th>Credor</th><th>Valor</th><th>Data</th></tr></thead>
              <tbody>
                {entity.DebtCollection.Debts.map((d, i) => (
                  <tr key={i}>
                    <td>{d.Creditor ?? "-"}</td>
                    <td>{d.Amount ?? "-"}</td>
                    <td>{d.Date ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {/* Relationships */}
      {entity.Relationships && entity.Relationships.length > 0 && (
        <Panel title="Relacionamentos" icon="ph-users-three">
          <table class="data-table">
            <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Tipo de Relacionamento</th></tr></thead>
            <tbody>
              {entity.Relationships.map((rel, i) => (
                <tr key={i}>
                  <td class="font-medium">{rel.Name ?? "-"}</td>
                  <td>{rel.TaxId ? formatDoc(rel.TaxId) : "-"}</td>
                  <td>{rel.RelationshipType ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Processes */}
      {entity.Processes && entity.Processes.length > 0 && (
        <Panel title="Processos Judiciais" icon="ph-scales">
          <table class="data-table">
            <thead><tr><th>Numero</th><th>Tribunal</th><th>Assunto</th><th>Valor</th><th>Data</th></tr></thead>
            <tbody>
              {entity.Processes.map((p, i) => (
                <tr key={i}>
                  <td class="font-medium">{p.Number ?? "-"}</td>
                  <td>{p.Court ?? "-"}</td>
                  <td>{p.Subject ?? "-"}</td>
                  <td>{p.Value ?? "-"}</td>
                  <td>{p.Date ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Raw JSON (collapsible) */}
      <details class="bg-white rounded-xl border border-gray-100 p-4">
        <summary class="cursor-pointer text-body-sm font-semibold text-gray-600 flex items-center gap-2">
          <i class="ph ph-code" aria-hidden="true"></i>
          Ver resposta completa (JSON)
        </summary>
        <pre class="mt-3 text-body-xs text-gray-600 overflow-x-auto bg-gray-50 p-3 rounded-lg max-h-96 overflow-y-auto">{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  );
}

// Data row helper for definition lists.
function DataRow({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <div>
      <dt class="text-gray-400 text-body-xs">{label}</dt>
      <dd class={`font-medium ${highlight ? "text-status-red" : "text-gray-800"}`}>{value || "-"}</dd>
    </div>
  );
}
