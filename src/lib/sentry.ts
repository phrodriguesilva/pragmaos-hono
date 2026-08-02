// Sentry integration for error tracking in production.
// Uses @sentry/node when SENTRY_DSN is configured.
// Falls back to no-op in development or when not configured.
// PragmaOS 2.

import { SENTRY_DSN, APP_URL } from "./env";

export interface SentryEvent {
  message: string;
  level?: "info" | "warning" | "error";
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id: string; email?: string; tenant_id?: string };
}

// Check if Sentry is enabled.
export function isSentryEnabled(): boolean {
  return SENTRY_DSN !== "";
}

// Initialize Sentry (called once at startup).
// In a real implementation, this would call Sentry.init().
// For now, we store the DSN and use the REST API directly to avoid
// adding @sentry/node as a dependency (keeps bundle small for serverless).
let initialized = false;

export function initSentry(): void {
  if (!isSentryEnabled() || initialized) return;
  initialized = true;
  // Sentry SDK would be initialized here.
  // We use a lightweight approach: capture via REST API in captureEvent.
}

// Capture an event to Sentry.
// Uses the Sentry REST API (envelope endpoint) when configured.
export async function captureException(error: Error | string, context?: {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id: string; email?: string; tenant_id?: string };
}): Promise<void> {
  if (!isSentryEnabled()) return;

  const event: SentryEvent = {
    message: typeof error === "string" ? error : error.message,
    level: "error",
    tags: context?.tags,
    extra: {
      ...(typeof error !== "string" ? { stack: error.stack } : {}),
      ...context?.extra,
    },
    user: context?.user,
  };

  await sendToSentry(event);
}

// Capture a message (non-error) to Sentry.
export async function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  if (!isSentryEnabled()) return;

  const event: SentryEvent = {
    message,
    level,
    tags: context?.tags,
    extra: context?.extra,
  };

  await sendToSentry(event);
}

// Send event to Sentry via the envelope endpoint.
// This is a minimal implementation — for full features (breadcrumbs,
// release tracking, etc.), use @sentry/node.
async function sendToSentry(event: SentryEvent): Promise<void> {
  try {
    // Parse DSN: https://<key>@<host>/<project_id>
    const dsnUrl = new URL(SENTRY_DSN);
    const key = dsnUrl.username;
    const projectId = dsnUrl.pathname.replace(/^\//, "");
    const envelopeUrl = `${dsnUrl.protocol}//${dsnUrl.host}/api/${projectId}/envelope/`;

    const envelope = {
      event_id: crypto.randomUUID(),
      sent_at: new Date().toISOString(),
      dsn: SENTRY_DSN,
    };

    const payload = {
      message: event.message,
      level: event.level ?? "error",
      platform: "node",
      environment: process.env.NODE_ENV ?? "development",
      server_name: APP_URL || "unknown",
      tags: event.tags ?? {},
      extra: event.extra ?? {},
      user: event.user,
      timestamp: new Date().toISOString(),
    };

    // Sentry envelope format: newline-delimited JSON.
    const body = `${JSON.stringify(envelope)}\n${JSON.stringify({ type: "event", payload })}`;

    await fetch(envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Sentry-Auth": `Sentry sentry_key=${key}`,
      },
      body,
    });
  } catch (err) {
    // Don't let Sentry errors crash the app.
    console.error("[Sentry] Failed to send event:", err);
  }
}

// Express/Hono error handler middleware that captures exceptions to Sentry.
export function sentryErrorHandler() {
  return async (err: Error, c: any) => {
    // Capture the error to Sentry.
    await captureException(err, {
      tags: { path: c.req?.path, method: c.req?.method },
      extra: { status: 500 },
    });

    // Return a generic error response.
    const isProd = process.env.NODE_ENV === "production";
    return c.json(
      {
        error: "Erro interno do servidor.",
        ...(isProd ? {} : { detail: err.message, stack: err.stack }),
      },
      500,
    );
  };
}
