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

const app = new Hono<AppEnv>();

app.use("*", logger());

// Static assets (CSS, JS).
app.use("/static/*", serveStatic({ root: "./public" }));

// Auth (public).
app.route("/", authRoutes);

// Protected routes -- requireAuth is applied per-route group.
app.route("/", dashboardRoutes);
app.route("/", clientsRoutes);
app.route("/", casesRoutes);
app.route("/", proceedingsRoutes);
app.route("/", deadlinesRoutes);
app.route("/", hearingsRoutes);
app.route("/", communicationsRoutes);
app.route("/", financeRoutes);
app.route("/", documentsRoutes);
app.route("/", reportsRoutes);
app.route("/", usersRoutes);
app.route("/", auditRoutes);

// 404 fallback.
app.notFound((c) => c.html("Pagina nao encontrada.", 404));

// Global error handler.
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.html("Erro interno do servidor.", 500);
});

export default app;
