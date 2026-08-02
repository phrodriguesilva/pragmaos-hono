// Technical documentation — auto-generated from codebase scan.
// Served at /docs, accessible to authenticated users.
// PragmaOS.

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireAuth } from "../lib/session";
import { appCss } from "../generated/css";
import { routesDocs, tablesDocs, libsDocs, docsGeneratedAt } from "../generated/docs";

export const docsRoutes = new Hono<AppEnv>();

docsRoutes.use("*", requireAuth);

function DocsLayout({ title, userName, children }: { title: string; userName: string; children: any }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - Documentacao Tecnica - PragmaOS</title>
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <script src="/static/js/alpine.min.js" defer />
      </head>
      <body class="bg-gray-50 text-body font-sans antialiased">
        <header class="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div class="flex items-center justify-between px-6 py-3.5">
            <div class="flex items-center gap-3">
              <a href="/" class="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-body-sm">
                <i class="ph ph-arrow-left" aria-hidden="true" />
                Voltar ao sistema
              </a>
              <span class="text-gray-200">|</span>
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg bg-carvao-700 flex items-center justify-center">
                  <i class="ph-bold ph-code text-white text-body" aria-hidden="true" />
                </div>
                <span class="text-h4 font-semibold text-carvao-800">Documentacao Tecnica</span>
              </div>
            </div>
            <div class="flex items-center gap-3 text-body-sm text-gray-500">
              <span class="hidden sm:inline">{userName}</span>
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-terracota-400 to-terracota-600 flex items-center justify-center text-white text-body-xs font-bold">
                {userName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <div class="max-w-6xl mx-auto p-6 lg:p-10" {...{ "x-data": "{ tab: 'routes' }" }}>
          {children}
        </div>
      </body>
    </html>
  );
}

// GET /docs — technical documentation dashboard
docsRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Group routes by file
  const routesByFile: Record<string, typeof routesDocs> = {};
  for (const r of routesDocs) {
    if (!routesByFile[r.file]) routesByFile[r.file] = [];
    routesByFile[r.file].push(r);
  }
  const sortedFiles = Object.keys(routesByFile).sort();

  // Count methods
  const methodCounts: Record<string, number> = {};
  for (const r of routesDocs) {
    methodCounts[r.method] = (methodCounts[r.method] ?? 0) + 1;
  }

  return c.html(
    <DocsLayout title="Visao Geral" userName={user.fullName}>
      <div class="mb-8">
        <h1 class="text-h1 font-bold text-carvao-800 mb-2">Documentacao Tecnica</h1>
        <p class="text-body text-gray-600">
          Referencia automatica de rotas, banco de dados e bibliotecas. Gerada em {new Date(docsGeneratedAt).toLocaleString("pt-BR")}.
        </p>
      </div>

      {/* Stats */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="text-h1 font-bold text-terracota-600">{routesDocs.length}</div>
          <div class="text-body-sm text-gray-500">Rotas</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="text-h1 font-bold text-terracota-600">{tablesDocs.length}</div>
          <div class="text-body-sm text-gray-500">Tabelas</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="text-h1 font-bold text-terracota-600">{libsDocs.length}</div>
          <div class="text-body-sm text-gray-500">Bibliotecas</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="text-h1 font-bold text-terracota-600">{sortedFiles.length}</div>
          <div class="text-body-sm text-gray-500">Arquivos de rota</div>
        </div>
      </div>

      {/* Tabs */}
      <div class="flex gap-2 mb-6 border-b border-gray-100">
        <button {...{ "@click": "tab = 'routes'", ":class": "tab === 'routes' ? 'text-terracota-600 border-b-2 border-terracota-600' : 'text-gray-500 hover:text-gray-700'" }} class="px-4 py-2 text-body-sm font-medium transition-colors">
          Rotas ({routesDocs.length})
        </button>
        <button {...{ "@click": "tab = 'db'", ":class": "tab === 'db' ? 'text-terracota-600 border-b-2 border-terracota-600' : 'text-gray-500 hover:text-gray-700'" }} class="px-4 py-2 text-body-sm font-medium transition-colors">
          Banco de Dados ({tablesDocs.length})
        </button>
        <button {...{ "@click": "tab = 'libs'", ":class": "tab === 'libs' ? 'text-terracota-600 border-b-2 border-terracota-600' : 'text-gray-500 hover:text-gray-700'" }} class="px-4 py-2 text-body-sm font-medium transition-colors">
          Bibliotecas ({libsDocs.length})
        </button>
      </div>

      {/* Routes tab */}
      <div {...{ "x-show": "tab === 'routes'" }}>
        {/* Method distribution */}
        <div class="flex flex-wrap gap-2 mb-6">
          {Object.entries(methodCounts).sort(([a], [b]) => a.localeCompare(b)).map(([method, count]) => (
            <span class={`badge badge-${method === "GET" ? "blue" : method === "POST" ? "green" : method === "DELETE" ? "red" : "yellow"} inline-flex items-center gap-1`}>
              {method} <span class="font-bold">{count}</span>
            </span>
          ))}
        </div>

        {/* Routes by file */}
        <div class="flex flex-col gap-4">
          {sortedFiles.map((file) => (
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <i class="ph ph-file-ts text-terracota-600" aria-hidden="true" />
                <span class="text-body-sm font-semibold text-gray-800">{file}</span>
                <span class="text-body-xs text-gray-400 ml-auto">{routesByFile[file].length} rotas</span>
              </div>
              <div class="divide-y divide-gray-50">
                {routesByFile[file].map((r, i) => (
                  <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50">
                    <span class={`badge badge-${r.method === "GET" ? "blue" : r.method === "POST" ? "green" : r.method === "DELETE" ? "red" : "yellow"} text-body-xs font-mono shrink-0`}>
                      {r.method}
                    </span>
                    <code class="text-body-sm text-gray-700 font-mono">{r.path}</code>
                    {r.comment ? <span class="text-body-xs text-gray-400 truncate">— {r.comment}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Database tab */}
      <div {...{ "x-show": "tab === 'db'", "x-cloak": "" }}>
        <div class="flex flex-col gap-4">
          {tablesDocs.map((t) => (
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <i class="ph ph-database text-terracota-600" aria-hidden="true" />
                <span class="text-body-sm font-semibold text-gray-800 font-mono">{t.name}</span>
                <div class="ml-auto flex items-center gap-2">
                  {t.rls ? (
                    <span class="badge badge-green text-body-xs">RLS</span>
                  ) : (
                    <span class="badge badge-red text-body-xs">Sem RLS</span>
                  )}
                  <span class="text-body-xs text-gray-400">{t.columns.length} colunas</span>
                </div>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-body-sm">
                  <thead>
                    <tr class="text-body-xs text-gray-400 border-b border-gray-50">
                      <th class="text-left px-4 py-2 font-medium">Coluna</th>
                      <th class="text-left px-4 py-2 font-medium">Tipo</th>
                      <th class="text-left px-4 py-2 font-medium">Nullable</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    {t.columns.map((col) => (
                      <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-2 font-mono text-gray-700">{col.name}</td>
                        <td class="px-4 py-2 font-mono text-gray-500">{col.type}</td>
                        <td class="px-4 py-2">
                          {col.nullable ? (
                            <span class="text-body-xs text-gray-400">SIM</span>
                          ) : (
                            <span class="text-body-xs text-status-red font-medium">NAO</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {t.policies.length > 0 ? (
                <div class="px-4 py-3 border-t border-gray-50">
                  <div class="text-body-xs font-semibold text-gray-500 mb-1.5">Policies RLS</div>
                  <div class="flex flex-wrap gap-1.5">
                    {t.policies.map((p) => (
                      <span class="text-body-xs text-gray-500 bg-gray-50 px-2 py-1 rounded font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {t.indexes.length > 0 ? (
                <div class="px-4 py-3 border-t border-gray-50">
                  <div class="text-body-xs font-semibold text-gray-500 mb-1.5">Indices</div>
                  <div class="flex flex-wrap gap-1.5">
                    {t.indexes.map((idx) => (
                      <span class="text-body-xs text-gray-500 bg-gray-50 px-2 py-1 rounded font-mono">{idx}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Libs tab */}
      <div {...{ "x-show": "tab === 'libs'", "x-cloak": "" }}>
        <div class="flex flex-col gap-4">
          {libsDocs.map((lib) => (
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <i class="ph ph-package text-terracota-600" aria-hidden="true" />
                <span class="text-body-sm font-semibold text-gray-800 font-mono">{lib.name}</span>
                <span class="text-body-xs text-gray-400 ml-auto">{lib.exports.length} exports</span>
              </div>
              <div class="divide-y divide-gray-50">
                {lib.exports.map((exp) => (
                  <div class="flex items-center gap-3 px-4 py-2">
                    <span class={`badge badge-${exp.type === "function" ? "blue" : exp.type === "interface" ? "green" : exp.type === "type" ? "yellow" : "gray"} text-body-xs shrink-0`}>
                      {exp.type}
                    </span>
                    <code class="text-body-sm text-gray-700 font-mono">{exp.name}</code>
                    {exp.comment ? <span class="text-body-xs text-gray-400 truncate">— {exp.comment}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DocsLayout>,
  );
});
