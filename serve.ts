// Bun dev server entry. In production (Vercel), the Hono app in src/index.tsx
// is handled by the Vercel Bun runtime directly.
import app from "./src/index.tsx";

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};

console.log(`PragmaOS dev server rodando em http://localhost:${port}`);
