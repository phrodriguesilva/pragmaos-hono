// Vercel serverless entry point.
// Uses Node.js runtime (not Bun) to avoid the "Requested module is not
// instantiated yet" Bun runtime bug on Vercel.
// The Hono app is imported from src/index.ts and exported as default.
export { default } from "../src/index";
