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
import { profileRoutes } from "./routes/profile";
import { timesheetRoutes } from "./routes/timesheet";
import { workflowsRoutes } from "./routes/workflows";
import { portalRoutes } from "./routes/portal";
import { cashflowRoutes } from "./routes/cashflow";
import { aiChatRoutes } from "./routes/ai-chat";
import { emailRoutes } from "./routes/emails";
import { whatsappRoutes } from "./routes/whatsapp";
import { signatureRoutes } from "./routes/signatures";
import { billingRoutes } from "./routes/billing";
import { integrationsRoutes } from "./routes/integrations";
import { messagesRoutes } from "./routes/messages";
import { companiesRoutes } from "./routes/companies";
import { teamsRoutes } from "./routes/teams";
import { permissionsRoutes } from "./routes/permissions";
import { financeReportsRoutes } from "./routes/finance-reports";
import { aiSummariesRoutes } from "./routes/ai-summaries";

const app = new Hono<AppEnv>();

app.use("*", logger());

// Static assets (CSS, JS).
app.use("/static/*", serveStatic({ root: "./public" }));

// Auth (public).
app.route("/", authRoutes);

// Client portal (public login + protected client/staff views).
// Must be registered before dashboardRoutes since dashboard uses use("*", requireAuth)
// which would otherwise catch /portal/login.
app.route("/portal", portalRoutes);

// Redirect legacy AI stub paths to the unified AI chat module.
// Must be before dashboardRoutes for the same reason as portal.
app.get("/ai-jurisprudence", (c) => c.redirect("/ai-assistant/jurisprudence"));
app.get("/ai-petitions", (c) => c.redirect("/ai-assistant/petitions"));

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
app.route("/profile", profileRoutes);
app.route("/timesheet", timesheetRoutes);
app.route("/workflows", workflowsRoutes);
app.route("/cashflow", cashflowRoutes);
app.route("/ai-assistant", aiChatRoutes);

// Phase 2 -- fully implemented modules.
app.route("/signatures", signatureRoutes);
app.route("/whatsapp", whatsappRoutes);
app.route("/emails", emailRoutes);
app.route("/billing", billingRoutes);
app.route("/integrations", integrationsRoutes);
app.route("/messages", messagesRoutes);

// Phase 4 -- fully implemented modules (replacing all stubs).
app.route("/companies", companiesRoutes);
app.route("/teams", teamsRoutes);
app.route("/permissions", permissionsRoutes);
app.route("/finance-reports", financeReportsRoutes);
app.route("/ai-summaries", aiSummariesRoutes);

// 404 fallback.
app.notFound((c) => c.html("Pagina nao encontrada.", 404));

// Global error handler.
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.html("Erro interno do servidor.", 500);
});

export default app;
