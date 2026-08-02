// Vercel entrypoint — detected by Vercel's Hono framework preset.
// The `hono` import is required for framework detection.
// The app itself is pre-bundled into src/generated/bundle.js (by
// scripts/build.ts) to avoid Node.js ESM extension issues — the
// codebase uses Bun-style extensionless imports that Node.js ESM
// cannot resolve.
import { Hono } from "hono";
// @ts-ignore — generated file, no type declarations
import app from "./generated/bundle.js";

export default app as unknown as Hono;
