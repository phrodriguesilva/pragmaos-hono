// Bun dev server entry. In production (Vercel), the Hono app in src/index.ts
// is handled by the Vercel Bun runtime directly.
import app from "./src/index.ts";
import { log } from "./src/lib/logger.ts";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

log.info(`PragmaOS dev server rodando em http://localhost:${port}`, { port });

// Graceful shutdown — handle SIGTERM (container stop) and SIGINT (Ctrl+C).
// Allows in-flight requests to complete before exiting.
let isShuttingDown = false;

function shutdown(signal: string) {
  if (isShuttingDown) {
    log.warn("Shutdown already in progress, forcing exit", { signal });
    process.exit(1);
    return;
  }
  isShuttingDown = true;

  log.info("Graceful shutdown initiated", { signal });

  // Stop accepting new connections.
  server.stop(true); // true = stop gracefully, wait for in-flight requests

  // Give in-flight requests up to 10 seconds to complete.
  const forceExitTimeout = setTimeout(() => {
    log.warn("Graceful shutdown timeout — forcing exit", { signal });
    process.exit(1);
  }, 10_000);

  // If server.stop() completes before timeout, exit cleanly.
  server.stop().then(() => {
    clearTimeout(forceExitTimeout);
    log.info("Graceful shutdown complete", { signal });
    process.exit(0);
  }).catch((err) => {
    clearTimeout(forceExitTimeout);
    log.error("Error during graceful shutdown", { error: String(err) });
    process.exit(1);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors — log and exit gracefully.
process.on("uncaughtException", (err) => {
  log.error("Uncaught exception", { error: err.message, stack: err.stack });
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection", { reason: String(reason) });
  // Don't shutdown on unhandled rejection — just log it.
  // In Node 15+, this exits by default, but we prefer to continue serving.
});
