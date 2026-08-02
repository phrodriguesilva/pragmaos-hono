// Vercel serverless entry point.
// Re-exports the Hono app from src/index.ts.
// Having this in /api/ makes Vercel detect it as a serverless function
// and handle the bundling correctly, avoiding the Bun runtime ESM/CJS
// interop bug that occurs when Vercel uses src/index.ts directly.
export { default } from "../src/index";
