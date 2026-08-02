// Vercel entrypoint — this file is detected by Vercel's Hono framework preset.
// The `hono` import is required for detection; the app itself lives in
// src/server/app.ts to keep the entrypoint thin.
import { Hono } from "hono";
export { default } from "./server/app";
