import { Hono } from "hono";
import type { AppEnv } from "./lib/types";

import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { clientsRoutes } from "./routes/clients";
import { casesRoutes } from "./routes/cases";
import { proceedingsRoutes } from "./routes/proceedings";
import { deadlinesRoutes } from "./routes/deadlines";
import { hearingsRoutes } from "./routes/hearings";
import { communicationsRoutes } from "./routes/communications";
import { financeRoutes } from "./routes/finance";
import { documentsRoutes } from "./routes/documents";
import { reportsRoutes } from "./routes/reports";
import { usersRoutes } from "./routes/users";
import { auditRoutes } from "./routes/audit";
import { leadsRoutes } from "./routes/leads";
import { tasksRoutes } from "./routes/tasks";
import { templatesRoutes } from "./routes/templates";
import { honorariosRoutes } from "./routes/honorarios";
import { stubRoute } from "./routes/stub";

const app = new Hono<AppEnv>();

app.use("*", logger());

// Static assets (CSS, JS).
app.use("/static/*", serveStatic({ root: "./public" }));

// Auth (public).
app.route("/", authRoutes);

// Protected routes -- requireAuth is applied per-route group.
app.route("/", dashboardRoutes);
app.route("/clients", clientsRoutes);
app.route("/cases", casesRoutes);
app.route("/proceedings", proceedingsRoutes);
app.route("/deadlines", deadlinesRoutes);
app.route("/hearings", hearingsRoutes);
app.route("/communications", communicationsRoutes);
app.route("/finance", financeRoutes);
app.route("/documents", documentsRoutes);
app.route("/reports", reportsRoutes);
app.route("/users", usersRoutes);
app.route("/audit", auditRoutes);

// Phase 2 -- new modules.
app.route("/leads", leadsRoutes);
app.route("/tasks", tasksRoutes);
app.route("/templates", templatesRoutes);
app.route("/honorarios", honorariosRoutes);

// Phase 2 -- stubs for modules not yet fully implemented.
app.route("/companies", stubRoute("companies", "Empresas", "ph-building",
  "Gestao de pessoas juridicas com representantes, contratos e dados bancarios.",
  ["Cadastro completo de PJ", "Representantes e socios", "Vinculacao com processos", "Historico financeiro"]));
app.route("/signatures", stubRoute("signatures", "Assinaturas Digitais", "ph-pen-nib",
  "Assinatura digital com certificado ICP-Brasil e integracoes externas.",
  ["Assinatura ICP-Brasil", "Integracao Clicksign", "Integracao DocuSign", "Integracao Gov.br", "Controle de status"]));
app.route("/whatsapp", stubRoute("whatsapp", "WhatsApp", "ph-whatsapp-logo",
  "Comunicacao via WhatsApp Business API integrada a processos e clientes.",
  ["WhatsApp Business API", "Mensagens em massa", "Templates aprovados", "Historico por cliente", "Automacao de respostas"]));
app.route("/emails", stubRoute("emails", "E-mails", "ph-envelope",
  "Integracao com Gmail e Outlook para centralizar comunicacao por email.",
  ["Integracao Gmail / Outlook", "Envio e recebimento", "Vinculacao a processos", "Templates de email", "Assinatura automatica"]));
app.route("/messages", stubRoute("messages", "Mensagens", "ph-chat-circle",
  "Chat interno entre membros da equipe, vinculado a processos e clientes.",
  ["Chat em tempo real", "Conversas por processo", "Mencoes (@usuario)", "Anexos", "Notificacoes push"]));
app.route("/billing", stubRoute("billing", "Cobrancas", "ph-receipt",
  "Cobranca via PIX, boleto e cartao com recursao e conciliacao.",
  ["Geracao de boletos", "PIX dinamico", "Cartao de credito", "Cobranca recorrente", "Conciliacao bancaria", "Open Finance"]));
app.route("/cashflow", stubRoute("cashflow", "Fluxo de Caixa", "ph-chart-line-up",
  "Fluxo de caixa com contas a receber, contas a pagar e centros de custo.",
  ["Contas a receber e pagar", "Centro de custos", "Plano de contas", "Rateios", "Conciliacao OFX/CSV", "Forecast"]));
app.route("/finance-reports", stubRoute("finance-reports", "Relatorios Financeiros", "ph-chart-pie",
  "Relatorios financeiros com lucro, receita, custos, margem e impostos.",
  ["DRE simplificado", "Relatorio de lucro", "Relatorio de custos", "Margem por processo", "Impostos"]));
app.route("/ai-assistant", stubRoute("ai-assistant", "Assistente Juridico", "ph-chats-teardrop",
  "Chat juridico com IA para tirar duvidas, pesquisar e analisar processos.",
  ["Chat com contexto do processo", "Busca semantica", "Analise de documentos", "Sugestao de estrategia"]));
app.route("/ai-summaries", stubRoute("ai-summaries", "Resumos com IA", "ph-sparkle",
  "Resumos automaticos de processos, peticoes e decisoes.",
  ["Resumo de processo", "Resumo de peticao", "Explicacao de decisao", "Resumo de audiencia"]));
app.route("/ai-jurisprudence", stubRoute("ai-jurisprudence", "Jurisprudencia", "ph-books",
  "Pesquisa jurisprudencial com IA e comparacao entre decisoes.",
  ["Busca por termos", "Filtros por tribunal/relator", "Comparacao de decisoes", "Citacoes relevantes"]));
app.route("/ai-petitions", stubRoute("ai-petitions", "Gerar Peticoes", "ph-file-arrow-up",
  "Geracao automatica de peticoes com IA a partir de dados do processo.",
  ["Template inteligente", "Preenchimento automatico", "Revisao com IA", "Exportacao PDF/DOCX"]));
app.route("/portal", stubRoute("portal", "Portal do Cliente", "ph-globe",
  "Portal self-service para clientes consultarem processos e documentos.",
  ["Consulta de processos", "Download de documentos", "Assinatura de contratos", "Envio de arquivos", "Pagamento de boletos"]));
app.route("/teams", stubRoute("teams", "Equipes", "ph-users-four",
  "Gestao de equipes com lideres, membros e distribuicao de processos.",
  ["Criacao de equipes", "Atribuicao de lider", "Distribuicao de processos", "Relatorio de produtividade"]));
app.route("/permissions", stubRoute("permissions", "Permissoes", "ph-key",
  "RBAC completo com perfis, permissoes por modulo, cliente e processo.",
  ["Perfis customizados", "Permissoes por modulo", "Permissoes por cliente", "Permissoes por processo"]));
app.route("/integrations", stubRoute("integrations", "Integracoes", "ph-plugs-connected",
  "Integracoes com sistemas externos: CNJ, PJe, Diarios, Google, Microsoft, etc.",
  ["CNJ / PJe / e-SAJ", "Diarios Oficiais", "Google Workspace", "Microsoft 365", "Clicksign / DocuSign", "WhatsApp Business API"]));

// 404 fallback.
app.notFound((c) => c.html("Pagina nao encontrada.", 404));

// Global error handler.
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.html("Erro interno do servidor.", 500);
});

export default app;
