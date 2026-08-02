// Error page renderers — callable from .ts files (index.ts) that can't use JSX directly.
// These use Hono's html template literal to render the same ErrorPage component.

import { html } from "hono/html";
import { appCss } from "../generated/css";

interface ErrorPageOpts {
  code: number;
  title: string;
  message: string;
  detail?: string;
}

export function renderErrorPage({ code, title, message, detail }: ErrorPageOpts): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${code} — ${title} — PragmaOS</title>
    <link rel="icon" href="/static/img/icon.svg" type="image/svg+xml" />
    <link rel="preload" href="/static/fonts/Phosphor.woff2" as="font" type="font/woff2" crossorigin="" />
    <link rel="preload" href="/static/fonts/Phosphor-Bold.woff2" as="font" type="font/woff2" crossorigin="" />
    <style>${appCss}</style>
    <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
    <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
  </head>
  <body class="bg-carvao-800 text-body font-sans min-h-screen flex items-center justify-center p-4 antialiased">
    <div class="w-full max-w-md text-center">
      <div class="flex items-center justify-center gap-2.5 mb-8">
        <div class="w-11 h-11 rounded-xl bg-terracota-500 flex items-center justify-center">
          <i class="ph-bold ph-scales text-white text-h2" aria-hidden="true"></i>
        </div>
        <span class="text-h2 font-bold text-white tracking-tight">PragmaOS</span>
      </div>
      <div class="text-7xl font-bold font-serif text-terracota-500 mb-2">${code}</div>
      <h1 class="text-xl font-semibold text-white mb-3">${title}</h1>
      <p class="text-carvao-300 mb-6 leading-relaxed">${message}</p>
      ${detail ? `<details class="text-left bg-carvao-700 rounded-lg p-4 mb-6"><summary class="text-sm text-carvao-300 cursor-pointer">Detalhes técnicos</summary><pre class="text-xs text-carvao-400 mt-2 whitespace-pre-wrap break-all">${escapeHtml(detail)}</pre></details>` : ""}
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <a href="/dashboard" class="btn btn-primary px-6 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2">
          <i class="ph-bold ph-squares-four" aria-hidden="true"></i>
          Ir para o Dashboard
        </a>
        <a href="/" class="px-6 py-2.5 rounded-lg border border-carvao-600 text-carvao-200 text-sm font-semibold hover:bg-carvao-700 transition inline-flex items-center justify-center gap-2">
          <i class="ph ph-house" aria-hidden="true"></i>
          Página inicial
        </a>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderNotFound(detail?: string): string {
  return renderErrorPage({
    code: 404,
    title: "Página não encontrada",
    message: "A página que você procura não existe ou foi movida. Verifique o endereço ou volte para o início.",
    detail,
  });
}

export function renderServerError(detail?: string): string {
  return renderErrorPage({
    code: 500,
    title: "Erro interno do servidor",
    message: "Algo deu errado do nosso lado. Nossa equipe foi notificada e já está investigando. Tente novamente em alguns instantes.",
    detail,
  });
}
