// Minimal Vercel serverless entry point.
// This file avoids importing from src/ to test if the Bun runtime bug
// is caused by the module graph in src/index.ts.
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ ok: true, message: "PragmaOS API" }));
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
