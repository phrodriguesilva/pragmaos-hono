import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Badge, BtnLink } from "../components/ui";
import { fetchIntimacoes, marcarIntimacaoLida } from "../lib/intimacoes";

export const intimacoesRoutes = new Hono<AppEnv>();

intimacoesRoutes.use("*", requireAuth);

// GET /intimacoes — list intimações
intimacoesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const dataInicio = c.req.query("data_inicio") ?? "";
  const dataFim = c.req.query("data_fim") ?? "";

  // Check if integration is configured
  const { data: integration } = await supabase
    .from("integrations")
    .select("id, active")
    .eq("tenant_id", user.tenantId)
    .eq("type", "intima_ai")
    .maybeSingle();

  const isConfigured = !!integration;

  let intimacoes: Awaited<ReturnType<typeof fetchIntimacoes>> = { success: false, error: "Não configurado" };

  if (isConfigured) {
    intimacoes = await fetchIntimacoes(user.tenantId, {
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
    });
  }

  return renderPage(
    c,
    { title: "Intimacoes Eletronicas", active: "intimacoes" },
    <>
      <PageHeader
        title="Intimacoes Eletronicas"
        icon="ph-envelope-open"
        actions={() => (
          <div class="flex gap-2">
            <form method="get" action="/intimacoes" class="flex gap-2 items-end">
              <input type="date" name="data_inicio" value={dataInicio} class="input" placeholder="De" />
              <input type="date" name="data_fim" value={dataFim} class="input" placeholder="Ate" />
              <button type="submit" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-funnel" aria-hidden="true"></i>Filtrar
              </button>
            </form>
            <form method="post" action="/intimacoes/sync">
              <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
                <i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Sincronizar
              </button>
            </form>
          </div>
        )}
      />

      {!isConfigured ? (
        <Panel title="Configuracao necessaria" icon="ph-warning">
          <div class="flex flex-col gap-3">
            <p class="text-body-sm text-gray-600">
              Para capturar intimações eletronicas do PJe/DJE/Domicilio Eletronico, voce precisa configurar a integracao com intima.ai.
            </p>
            <p class="text-body-sm text-gray-500">
              O intima.ai e um servico que monitora automaticamente os tribunais e captura intimações em seu nome, eliminando a necessidade de acessar o PJe/DJE manualmente todos os dias.
            </p>
            <BtnLink href="/integrations" icon="ph-gear">Configurar Integracao</BtnLink>
          </div>
        </Panel>
      ) : !intimacoes.success ? (
        <Panel title="Erro" icon="ph-warning-circle">
          <p class="text-body-sm text-status-red">{intimacoes.error}</p>
        </Panel>
      ) : (intimacoes.intimacoes ?? []).length === 0 ? (
        <Panel title="Nenhuma intimacao" icon="ph-envelope-simple">
          <div class="text-center py-8 text-gray-400">
            <i class="ph ph-check-circle text-h1 block mb-2" aria-hidden="true"></i>
            <p class="text-body-sm">Nenhuma intimacao encontrada no periodo selecionado.</p>
          </div>
        </Panel>
      ) : (
        <div class="flex flex-col gap-3">
          {(intimacoes.intimacoes ?? []).map((int) => (
            <div
              key={int.id}
              class={`bg-white border rounded-xl p-4 ${int.lida ? "border-gray-100" : "border-[#b0ccff] bg-[#e6efff]/30"}`}
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <Badge color={int.lida ? "gray" : "red"}>{int.lida ? "Lida" : "Nova"}</Badge>
                    <Badge color="blue">{int.tribunal}</Badge>
                    <span class="text-body-xs text-gray-500">{int.processo}</span>
                  </div>
                  <div class="text-body-sm font-medium text-gray-800 mb-1">{int.tipo}</div>
                  <div class="text-body-xs text-gray-500 mb-2">
                    Disponibilizada em {new Date(int.dataDisponibilizacao).toLocaleString("pt-BR")}
                  </div>
                  <p class="text-body-sm text-gray-600 line-clamp-3">{int.conteudo}</p>
                </div>
                <div class="flex flex-col gap-2 shrink-0">
                  {!int.lida ? (
                    <form method="post" action={`/intimacoes/${int.id}/ciencia`}>
                      <button type="submit" class="btn btn-secondary inline-flex items-center gap-1 text-body-sm">
                        <i class="ph ph-check" aria-hidden="true"></i>Dar ciencia
                      </button>
                    </form>
                  ) : null}
                  <a href={int.link} target="_blank" rel="noopener" class="btn btn-secondary inline-flex items-center gap-1 text-body-sm">
                    <i class="ph ph-arrow-square-out" aria-hidden="true"></i>Abrir
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>,
  );
});

// POST /intimacoes/sync — sync intimações
intimacoesRoutes.post("/sync", async (c) => {
  const user = c.get("user");
  const result = await fetchIntimacoes(user.tenantId);
  if (result.success) {
    return c.redirect(`/intimacoes?success=${encodeURIComponent(`${result.intimacoes?.length ?? 0} intimacao(oes) encontrada(s)`)}`);
  }
  return c.redirect(`/intimacoes?error=${encodeURIComponent(result.error ?? "Erro ao sincronizar")}`);
});

// POST /intimacoes/:id/ciencia — mark as read
intimacoesRoutes.post("/:id/ciencia", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const result = await marcarIntimacaoLida(user.tenantId, id);
  if (result.success) {
    return c.redirect("/intimacoes?success=Ciencia registrada com sucesso");
  }
  return c.redirect(`/intimacoes?error=${encodeURIComponent(result.error ?? "Erro ao dar ciencia")}`);
});
