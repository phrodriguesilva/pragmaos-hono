import { Hono } from "hono";
import type { AppEnv } from "./lib/types";

import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { supabase } from "./lib/supabase";
import { csrfProtection } from "./lib/csrf";
import { log, requestLogger } from "./lib/logger";
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
import { oauthRoutes } from "./routes/oauth";
import { whatsappWebhookRoutes } from "./routes/whatsapp-webhook";
import { uploadRoutes } from "./routes/upload";
import { diarioRoutes } from "./routes/diario-oficial";
import { prazosRoutes } from "./routes/prazos";
import { notificationsRoutes } from "./routes/notifications";
import { calendarRoutes } from "./routes/calendar";
import { trustRoutes } from "./routes/trust-accounts";
import { intimacoesRoutes } from "./routes/intimacoes";
import { apiRoutes } from "./routes/api";
import { apiKeysRoutes } from "./routes/api-keys";
import { searchRoutes } from "./routes/search";
import { timerRoutes } from "./routes/timer";
import { importRoutes } from "./routes/import";
import { proactiveRoutes } from "./routes/proactive";
// Help and docs routes — moved to _wip/ until type errors are fixed.
// import { helpRoutes } from "./routes/help";

const app = new Hono<AppEnv>();

// Structured request logging (replaces basic hono/logger with JSON logs in prod).
app.use("*", requestLogger());
app.use("*", logger());

// CSRF protection — reject state-changing requests with invalid Origin.
// Applied after logger, before routes. Skips /api/ and /webhooks/ (Bearer auth).
app.use("*", csrfProtection);

// Security headers — applied to all responses.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // HSTS — only meaningful over HTTPS, tells browser to always use HTTPS.
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  // CSP — allow self and inline scripts/styles (needed for Hono JSX + Alpine).
  // Alpine.js is self-hosted at /static/js/alpine.min.js (no external CDN).
  c.header("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "));
});

// Static assets (CSS, JS).
app.use("/static/*", serveStatic({ root: "./public" }));

// Health checks (public, no auth).
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/health/ready", async (c) => {
  try {
    const { error } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (error) {
      log.warn("Health check failed — database error", { error: error.message });
      return c.json({ status: "not_ready", error: error.message }, 503);
    }
    return c.json({ status: "ready", timestamp: new Date().toISOString() });
  } catch (err) {
    log.error("Health check failed — exception", { error: String(err) });
    return c.json({ status: "not_ready", error: String(err) }, 503);
  }
});

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

// OAuth callbacks for Google Workspace and Microsoft 365.
// Start routes are protected (requireAuth); callback routes are public.
app.route("/oauth", oauthRoutes);

// WhatsApp webhook (public -- Meta calls these without auth cookies).
// Registered at /webhooks/whatsapp to avoid conflict with auth-protected /whatsapp routes.
app.route("/webhooks/whatsapp", whatsappWebhookRoutes);

// File upload (protected -- multipart POST to Supabase Storage).
app.route("/upload", uploadRoutes);

// Diario Oficial (protected -- Querido Diario + Digesto).
app.route("/diario-oficial", diarioRoutes);
app.route("/prazos", prazosRoutes);
app.route("/notifications", notificationsRoutes);
app.route("/calendar", calendarRoutes);
app.route("/trust-accounts", trustRoutes);
app.route("/intimacoes", intimacoesRoutes);
app.route("/api", apiRoutes);
app.route("/api-keys", apiKeysRoutes);
app.route("/search", searchRoutes);
app.route("/timer", timerRoutes);
app.route("/import", importRoutes);
app.route("/proactive", proactiveRoutes);
// app.route("/help", helpRoutes);

// 404 fallback.
app.notFound((c) => c.html("Pagina nao encontrada.", 404));

// Global error handler — log structured error and return 500.
app.onError((err, c) => {
  log.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });
  return c.html("Erro interno do servidor.", 500);
});

// Log startup.
log.info("PragmaOS 2 server initialized", {
  node_env: process.env.NODE_ENV ?? "development",
  vercel_env: process.env.VERCEL_ENV ?? "local",
});

export default app;
