// Structured logging for observability.
// Outputs JSON in production, pretty-printed in development.
// PragmaOS 2.

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Minimum level to log (configurable via env, defaults to "info").
const minLevel: LogLevel = (() => {
  const env = (typeof Bun !== "undefined" ? Bun.env : process.env).LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_PRIORITY) return env;
  return isProduction ? "info" : "debug";
})();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  if (isProduction) {
    // JSON format for log aggregation (Vercel, Datadog, etc.)
    return JSON.stringify(entry);
  }

  // Pretty-printed for development.
  const ctxStr = context && Object.keys(context).length > 0
    ? " " + JSON.stringify(context)
    : "";
  const levelTag = level.toUpperCase().padEnd(5);
  return `[${entry.timestamp}] ${levelTag} ${message}${ctxStr}`;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

export const log: Logger = {
  debug(message: string, context?: LogContext) {
    if (!shouldLog("debug")) return;
    console.debug(formatLog("debug", message, context));
  },

  info(message: string, context?: LogContext) {
    if (!shouldLog("info")) return;
    console.log(formatLog("info", message, context));
  },

  warn(message: string, context?: LogContext) {
    if (!shouldLog("warn")) return;
    console.warn(formatLog("warn", message, context));
  },

  error(message: string, context?: LogContext) {
    if (!shouldLog("error")) return;
    console.error(formatLog("error", message, context));
  },

  child(context: LogContext): Logger {
    return {
      debug: (msg: string, ctx?: LogContext) => log.debug(msg, { ...context, ...ctx }),
      info: (msg: string, ctx?: LogContext) => log.info(msg, { ...context, ...ctx }),
      warn: (msg: string, ctx?: LogContext) => log.warn(msg, { ...context, ...ctx }),
      error: (msg: string, ctx?: LogContext) => log.error(msg, { ...context, ...ctx }),
      child: (ctx: LogContext) => log.child({ ...context, ...ctx }),
    };
  },
};

// Request logging middleware for Hono.
// Logs method, path, status, and duration.
export function requestLogger() {
  return async (c: any, next: any) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    const context = {
      method,
      path,
      status,
      duration_ms: duration,
    };

    if (status >= 500) {
      log.error("Request completed", context);
    } else if (status >= 400) {
      log.warn("Request completed", context);
    } else {
      log.info("Request completed", context);
    }
  };
}
