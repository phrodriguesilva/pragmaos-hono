import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { docsData } from "../generated/docs";
import { PageHeader, Panel, Badge } from "../components/ui";

export const docsRoutes = new Hono<AppEnv>();

docsRoutes.use("*", requireAuth);
docsRoutes.use("*", requireRole("socio", "admin"));

// GET /docs — technical documentation dashboard.
docsRoutes.get("/", async (c) => {
  const data = docsData;

  return renderPage(
    c,
    { title: "Documentacao Tecnica", active: "docs" },
    <>
      <PageHeader title="Documentacao Tecnica" icon="ph-book-open" />

      <div class="text-sm text-gray-500 mb-6">
        Auto-gerada em {new Date(data.generatedAt).toLocaleString("pt-BR")} •
        {data.modules.length} modulos, {data.totalRoutes} rotas, {data.tables.length} tabelas, {data.integrations.length} bibliotecas
      </div>

      {/* Tabs / sections */}
      <div class="flex gap-2 mb-6 border-b border-gray-200">
        <a href="#routes" class="px-4 py-2 text-sm font-medium text-terracota-600 border-b-2 border-terracota-600">Rotas</a>
        <a href="#tables" class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-terracota-600">Banco de Dados</a>
        <a href="#libs" class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-terracota-600">Bibliotecas</a>
      </div>

      {/* Routes section */}
      <div id="routes" class="space-y-4 mb-12">
        <h2 class="text-lg font-semibold">Rotas da Aplicacao</h2>
        {data.modules.map((mod) => (
          <Panel>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-medium text-gray-800">{mod.name}</h3>
              <Badge color="gray">{mod.routes.length} rotas</Badge>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th class="py-2 pr-4">Metodo</th>
                    <th class="py-2 pr-4">Path</th>
                  </tr>
                </thead>
                <tbody>
                  {mod.routes.map((r) => (
                    <tr class="border-b border-gray-50">
                      <td class="py-1.5 pr-4">
                        <span class={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${
                          r.method === "GET" ? "bg-blue-100 text-blue-700" :
                          r.method === "POST" ? "bg-green-100 text-green-700" :
                          r.method === "PUT" || r.method === "PATCH" ? "bg-yellow-100 text-yellow-700" :
                          r.method === "DELETE" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>{r.method}</span>
                      </td>
                      <td class="py-1.5 pr-4 font-mono text-xs">{r.path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
      </div>

      {/* Tables section */}
      <div id="tables" class="space-y-4 mb-12">
        <h2 class="text-lg font-semibold">Esquema do Banco de Dados</h2>
        {data.tables.map((table) => (
          <Panel>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <h3 class="font-mono font-medium text-gray-800">{table.name}</h3>
                {table.rls && <Badge color="green">RLS</Badge>}
              </div>
              <span class="text-xs text-gray-400">{table.migration}</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th class="py-2 pr-4">Coluna</th>
                    <th class="py-2 pr-4">Tipo</th>
                    <th class="py-2 pr-4">Nullable</th>
                    <th class="py-2 pr-4">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((col) => (
                    <tr class="border-b border-gray-50">
                      <td class="py-1.5 pr-4 font-mono text-xs">{col.name}</td>
                      <td class="py-1.5 pr-4 font-mono text-xs text-gray-600">{col.type}</td>
                      <td class="py-1.5 pr-4 text-xs">
                        {col.nullable ? <span class="text-gray-400">YES</span> : <span class="text-red-500">NO</span>}
                      </td>
                      <td class="py-1.5 pr-4 font-mono text-xs text-gray-500">{col.default ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
      </div>

      {/* Libs section */}
      <div id="libs" class="space-y-4 mb-12">
        <h2 class="text-lg font-semibold">Bibliotecas Internas</h2>
        <Panel>
          <div class="space-y-2">
            {data.integrations.map((lib) => (
              <div class="flex items-start gap-3 border-b border-gray-100 py-3">
                <i class="ph ph-package text-h4 text-terracota-600 mt-0.5" aria-hidden="true"></i>
                <div class="flex-1">
                  <div class="font-mono text-sm font-medium">{lib.name}</div>
                  <div class="text-sm text-gray-600">{lib.description}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>,
  );
});
