import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Select, TextField, Badge } from "../components/ui";
import { calcularPrazo, formatDataCompletaBR, formatDataBR, PRAZOS_CPC, type TipoPrazo } from "../lib/prazos";

export const prazosRoutes = new Hono<AppEnv>();

prazosRoutes.use("*", requireAuth);

// GET /prazos — calculadora de prazos
prazosRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tipoPrazo = (c.req.query("tipo_prazo") ?? "contestacao") as string;
  const dias = parseInt(c.req.query("dias") ?? "15", 10);
  const tipoContagem = (c.req.query("tipo_contagem") ?? "dias_uteis") as TipoPrazo;
  const dataInicioStr = c.req.query("data_inicio") ?? "";

  // Calcular prazo se temos os parâmetros
  let resultado: { dataVencimento: Date; diasUteisContados: number } | null = null;
  let dataInicio: Date | null = null;

  if (dataInicioStr) {
    const [y, m, d] = dataInicioStr.split("-").map(Number);
    if (y && m && d) {
      dataInicio = new Date(y, m - 1, d);
    }
  }
  if (!dataInicio) dataInicio = new Date();

  const prazoDef = PRAZOS_CPC[tipoPrazo];
  const diasCalculo = prazoDef && tipoPrazo !== "personalizado" ? prazoDef.dias : dias;
  const tipoCalculo = prazoDef && tipoPrazo !== "personalizado" ? prazoDef.tipo : tipoContagem;

  resultado = calcularPrazo({
    tipo: tipoCalculo,
    dias: diasCalculo,
    dataInicio,
  });

  // Buscar deadlines próximos (próximos 7 dias)
  const now = new Date();
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(now.getDate() + 7);

  const { data: proximosPrazos } = await supabase
    .from("deadlines")
    .select("id, title, due_date, priority, cases(title)")
    .eq("tenant_id", user.tenantId)
    .gte("due_date", now.toISOString())
    .lte("due_date", sevenDaysLater.toISOString())
    .order("due_date", { ascending: true })
    .limit(10);

  return renderPage(
    c,
    { title: "Calculadora de Prazos", active: "prazos" },
    <>
      <PageHeader title="Calculadora de Prazos" icon="ph-calendar-x" />

      <div class="grid grid-cols-2 gap-6">
        {/* Calculadora */}
        <Panel title="Calcular Prazo Processual" icon="ph-calculator">
          <form method="get" action="/prazos" class="flex flex-col gap-4">
            <Select
              label="Tipo de prazo"
              id="tipo_prazo"
              name="tipo_prazo"
              selected={tipoPrazo}
              options={Object.entries(PRAZOS_CPC).map(([key, val]) => ({
                value: key,
                label: val.descricao,
              }))}
            />
            {tipoPrazo === "personalizado" ? (
              <>
                <TextField
                  label="Número de dias"
                  id="dias"
                  name="dias"
                  type="number"
                  value={String(dias)}
                  required
                  icon="ph-calendar-blank"
                />
                <Select
                  label="Tipo de contagem"
                  id="tipo_contagem"
                  name="tipo_contagem"
                  selected={tipoContagem}
                  options={[
                    { value: "dias_uteis", label: "Dias úteis" },
                    { value: "dias_corridos", label: "Dias corridos" },
                  ]}
                />
              </>
            ) : null}
            <TextField
              label="Data de início (intimação)"
              id="data_inicio"
              name="data_inicio"
              type="date"
              value={dataInicio.toISOString().split("T")[0] ?? ""}
              icon="ph-calendar"
            />
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-calculator" aria-hidden="true"></i>Calcular
            </button>
          </form>

          {resultado ? (
            <div class="mt-6 p-4 bg-terracota-50 border border-terracota-200 rounded-xl">
              <div class="text-body-sm text-gray-600 mb-1">Data de vencimento:</div>
              <div class="text-h2 font-bold text-terracota-700">{formatDataCompletaBR(resultado.dataVencimento)}</div>
              <div class="text-body-sm text-gray-500 mt-2">
                {tipoCalculo === "dias_uteis"
                  ? `${resultado.diasUteisContados} dias úteis contados`
                  : `${diasCalculo} dias corridos`}
              </div>
              <div class="mt-3 flex gap-2">
                <a
                  href={`/deadlines/new?due_date=${resultado.dataVencimento.toISOString().split("T")[0]}&title=${encodeURIComponent(prazoDef?.descricao ?? "Prazo calculado")}`}
                  class="btn btn-secondary inline-flex items-center gap-1 text-body-sm"
                >
                  <i class="ph ph-plus" aria-hidden="true"></i>Criar deadline
                </a>
              </div>
            </div>
          ) : null}
        </Panel>

        {/* Próximos prazos */}
        <Panel title="Prazos dos próximos 7 dias" icon="ph-clock-countdown">
          {(proximosPrazos ?? []).length === 0 ? (
            <div class="text-center py-8 text-gray-400">
              <i class="ph ph-check-circle text-h1 block mb-2" aria-hidden="true"></i>
              <p class="text-body-sm">Nenhum prazo nos próximos 7 dias.</p>
            </div>
          ) : (
            <ul class="flex flex-col gap-2">
              {(proximosPrazos ?? []).map((p) => {
                const dueDate = new Date(p.due_date);
                const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
                const color = daysUntil <= 1 ? "red" : daysUntil <= 3 ? "yellow" : "blue";
                const caseTitle = (p.cases as unknown as { title: string } | null)?.title;
                return (
                  <li key={p.id} class="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                    <div>
                      <a href={`/deadlines/${p.id}`} class="text-body-sm font-medium text-gray-800 hover:text-terracota-600">
                        {p.title}
                      </a>
                      {caseTitle ? <div class="text-body-xs text-gray-500">{caseTitle}</div> : null}
                    </div>
                    <div class="flex items-center gap-2">
                      <Badge color={color as "red" | "yellow" | "blue"}>
                        {daysUntil === 0 ? "Hoje" : daysUntil === 1 ? "Amanhã" : `${daysUntil} dias`}
                      </Badge>
                      <span class="text-body-xs text-gray-500">{formatDataBR(dueDate)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Tabela de prazos comuns */}
      <div class="mt-6">
        <Panel title="Prazos comuns do CPC/2015" icon="ph-book-open">
          <div class="grid grid-cols-2 gap-2 text-body-sm">
            {Object.entries(PRAZOS_CPC).filter(([k]) => k !== "personalizado").map(([key, val]) => (
              <div key={key} class="flex items-center justify-between p-2 border-b border-gray-50">
                <span class="text-gray-700">{val.descricao}</span>
                <Badge color="gray">{val.dias} {val.tipo === "dias_uteis" ? "d. úteis" : "d. corridos"}</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>,
  );
});
