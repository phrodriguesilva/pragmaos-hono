import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { setFlash } from "../lib/flash";
import { PageHeader, Panel, Badge, Table, Select } from "../components/ui";

export const importRoutes = new Hono<AppEnv>();

// Only socios and admins can import data.
importRoutes.use("*", requireAuth);
importRoutes.use("*", requireRole("socio", "admin"));

// --- CSV Parser ---
// Simple CSV parser that handles quoted fields, commas inside quotes, and newlines.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote.
          currentField += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      currentField += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentField);
      currentField = "";
      i++;
      continue;
    }

    if (char === "\r") {
      i++;
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  // Last field/row.
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Remove empty trailing rows.
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last && last.length === 1 && last[0] === "") {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

// --- Column mapping definitions ---
// Each entity has a set of fields that can be mapped from CSV columns.
type FieldDef = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[]; // Common column names in Portuguese that map to this field.
};

const CLIENT_FIELDS: FieldDef[] = [
  { key: "name", label: "Nome *", required: true, aliases: ["nome", "nome completo", "razao social", "razao_social"] },
  { key: "client_type", label: "Tipo", required: false, aliases: ["tipo", "tipo de cliente", "pessoa"] },
  { key: "cpf", label: "CPF", required: false, aliases: ["cpf", "cpf/cnpj"] },
  { key: "cnpj", label: "CNPJ", required: false, aliases: ["cnpj", "cpf/cnpj"] },
  { key: "email", label: "E-mail", required: false, aliases: ["email", "e-mail", "e mail"] },
  { key: "phone", label: "Telefone", required: false, aliases: ["telefone", "tel", "celular", "whatsapp"] },
  { key: "address", label: "Endereco", required: false, aliases: ["endereco", "end", "rua", "logradouro"] },
  { key: "notes", label: "Observacoes", required: false, aliases: ["observacoes", "obs", "notas"] },
];

const CASE_FIELDS: FieldDef[] = [
  { key: "title", label: "Titulo *", required: true, aliases: ["titulo", "processo", "nome do processo"] },
  { key: "case_number", label: "Numero CNJ", required: false, aliases: ["numero", "cnj", "numero do processo", "n processo", "n_processo"] },
  { key: "case_type", label: "Tipo *", required: true, aliases: ["tipo", "area", "area juridica", "tipo do processo"] },
  { key: "tribunal", label: "Tribunal", required: false, aliases: ["tribunal", "orgao"] },
  { key: "district", label: "Comarca", required: false, aliases: ["comarca", "cidade"] },
  { key: "court_branch", label: "Vara", required: false, aliases: ["vara", "orgao julgador"] },
  { key: "status", label: "Status", required: false, aliases: ["status", "situacao"] },
  { key: "opposing_party", label: "Parte contraria", required: false, aliases: ["parte contraria", "adverso", "reclamado", "reu"] },
  { key: "opposing_lawyer", label: "Advogado adverso", required: false, aliases: ["advogado adverso", "advogado contrario", "advogado da parte contraria"] },
  { key: "client_name", label: "Cliente (nome)", required: true, aliases: ["cliente", "nome do cliente", "cliente nome"] },
  { key: "description", label: "Descricao", required: false, aliases: ["descricao", "detalhes", "observacoes"] },
];

// Auto-detect column mapping based on aliases.
function autoDetectMapping(headers: string[], fields: FieldDef[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalizedHeaders = headers.map((h) => (h ?? "").toLowerCase().trim());

  for (const field of fields) {
    // First: exact match on key.
    const exactIdx = normalizedHeaders.indexOf(field.key);
    if (exactIdx !== -1) {
      mapping[field.key] = headers[exactIdx] ?? "";
      continue;
    }
    // Then: check aliases.
    for (const alias of field.aliases) {
      const aliasIdx = normalizedHeaders.indexOf(alias);
      if (aliasIdx !== -1) {
        mapping[field.key] = headers[aliasIdx] ?? "";
        break;
      }
    }
  }

  return mapping;
}

// Validate a parsed row against field definitions.
function validateRow(row: string[], mapping: Record<string, string>, fields: FieldDef[]): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (!field.required) continue;
    const colName = mapping[field.key];
    if (!colName) {
      errors.push(`Coluna "${field.label}" nao mapeada`);
      continue;
    }
    const value = (row[Object.keys(mapping).indexOf(field.key)] ?? "").trim();
    if (!value) {
      errors.push(`${field.label} e obrigatorio`);
    }
  }
  return errors;
}

// --- Routes ---

// GET /import -- main import page with upload form.
importRoutes.get("/", async (c) => {
  const user = c.get("user");
  return renderPage(
    c,
    { title: "Importar Dados", active: "import" },
    <>
      <PageHeader title="Importar Dados" icon="ph-upload-simple" />
      <Panel title="Importar clientes ou processos" icon="ph-info">
        <div class="text-body-sm text-gray-600 mb-4">
          <p class="mb-2">Importe dados de outros sistemas (Astrea, Projuris, CPJ, Excel, etc.) via arquivo CSV.</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>Formato: CSV com cabecalho na primeira linha</li>
            <li>Codificacao: UTF-8 (recomendado) ou Latin-1</li>
            <li>Tamanho maximo: 10MB</li>
            <li>Campos com * sao obrigatorios</li>
            <li>A deteccao de colunas e automatica, mas voce pode ajustar o mapeamento</li>
          </ul>
        </div>
        <form method="post" action="/import/preview" enctype="multipart/form-data" class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label class="text-body-sm font-semibold text-gray-700">Tipo de dado</label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 text-body-sm text-gray-700">
                <input type="radio" name="entity" value="clients" checked class="w-4 h-4" />
                Clientes
              </label>
              <label class="flex items-center gap-2 text-body-sm text-gray-700">
                <input type="radio" name="entity" value="cases" class="w-4 h-4" />
                Processos
              </label>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <label for="file" class="text-body-sm font-semibold text-gray-700">Arquivo CSV</label>
            <input type="file" id="file" name="file" accept=".csv,text/csv" required class="text-body-sm" />
          </div>
          <button type="submit" class="btn btn-primary inline-flex items-center gap-2 w-fit">
            <i class="ph ph-upload-simple" aria-hidden="true" />Enviar e previsualizar
          </button>
        </form>
      </Panel>

      <div class="mt-4">
        <Panel title="Modelos de CSV" icon="ph-file-csv">
          <div class="flex gap-4 flex-wrap">
            <div>
              <p class="text-body-sm font-semibold text-gray-700 mb-2">Clientes</p>
              <pre class="text-body-xs bg-gray-50 p-3 rounded-lg overflow-x-auto">nome,tipo,cpf,cnpj,email,telefone,endereco,observacoes
Joao Silva,pf,12345678901,,joao@email.com,11999999999,Rua A 123,Cliente importante
Empresa X,pj,,12345678000199,contato@empresax.com,1188888888,Av B 456,</pre>
            </div>
            <div>
              <p class="text-body-sm font-semibold text-gray-700 mb-2">Processos</p>
              <pre class="text-body-xs bg-gray-50 p-3 rounded-lg overflow-x-auto">titulo,numero,tipo,tribunal,comarca,vara,status,cliente,parte_contraria
Acao Trabalhista,0001234-56.2024.5.01.0001,Trabalhista,TRT1,Sao Paulo,1a Vara,active,Joao Silva,Empresa X</pre>
            </div>
          </div>
        </Panel>
      </div>
    </>,
  );
});

// POST /import/preview -- parse CSV, show preview with column mapping.
importRoutes.post("/preview", async (c) => {
  const user = c.get("user");
  const formData = await c.req.formData();
  const entity = String(formData.get("entity") ?? "clients");
  const file = formData.get("file") as File | null;

  if (!file) {
    setFlash(c, "error", "Nenhum arquivo enviado.");
    return c.redirect("/import");
  }

  if (file.size > 10 * 1024 * 1024) {
    setFlash(c, "error", "Arquivo muito grande. Maximo: 10MB.");
    return c.redirect("/import");
  }

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length < 2) {
    setFlash(c, "error", "Arquivo CSV vazio ou sem dados (precisa de cabecalho + pelo menos 1 linha).");
    return c.redirect("/import");
  }

  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const fields = entity === "cases" ? CASE_FIELDS : CLIENT_FIELDS;
  const autoMapping = autoDetectMapping(headers, fields);

  // Store CSV data in a temporary cookie for the confirm step.
  // For large files, we store in a temp table instead — but for simplicity,
  // we pass the data via a hidden form field (base64 encoded).
  // Limit preview to first 10 rows.
  const previewRows = dataRows.slice(0, 10);
  const totalRows = dataRows.length;

  // Check which required fields are not mapped.
  const missingRequired = fields.filter((f) => f.required && !autoMapping[f.key]);

  // Build preview table rows.
  const previewTableRows = previewRows.map((row, idx) => {
    const safeRow = row ?? [];
    const cells = fields.map((field) => {
      const colName = autoMapping[field.key];
      if (!colName) return <span class="text-gray-300">—</span> as unknown as string;
      const colIdx = headers.indexOf(colName);
      const value = safeRow[colIdx] ?? "";
      return value || <span class="text-gray-300">—</span> as unknown as string;
    });
    return [String(idx + 1), ...cells];
  });

  // Encode full CSV data for the confirm form (base64).
  const csvBase64 = Buffer.from(text).toString("base64");

  return renderPage(
    c,
    { title: "Previsualizar Importacao", active: "import" },
    <>
      <PageHeader title="Previsualizar Importacao" icon="ph-eye" />

      <Panel title={`Resumo: ${entity === "cases" ? "Processos" : "Clientes"}`} icon="ph-info">
        <div class="grid grid-cols-3 gap-4 text-body-sm">
          <div>
            <span class="text-gray-500">Arquivo:</span>
            <span class="font-semibold ml-2">{file.name}</span>
          </div>
          <div>
            <span class="text-gray-500">Total de linhas:</span>
            <span class="font-semibold ml-2">{totalRows}</span>
          </div>
          <div>
            <span class="text-gray-500">Colunas detectadas:</span>
            <span class="font-semibold ml-2">{headers.length}</span>
          </div>
        </div>
        {missingRequired.length > 0 && (
          <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-body-sm text-red-800">
            <i class="ph ph-warning" aria-hidden="true" /> Campos obrigatorios nao mapeados:{" "}
            {missingRequired.map((f) => f.label).join(", ")}
            <div class="mt-1 text-red-600">Ajuste o mapeamento abaixo antes de importar.</div>
          </div>
        )}
      </Panel>

      <div class="mt-4">
        <Panel title="Mapeamento de colunas" icon="ph-arrows-left-right">
          <form method="post" action="/import/confirm" class="flex flex-col gap-4">
            <input type="hidden" name="entity" value={entity} />
            <input type="hidden" name="csv_data" value={csvBase64} />

            <div class="grid grid-cols-2 gap-3">
              {fields.map((field) => (
                <div class="flex flex-col gap-1">
                  <label class="text-body-sm font-semibold text-gray-700">
                    {field.label}
                    {field.required && <span class="text-status-red"> *</span>}
                  </label>
                  <select name={`map_${field.key}`} class="input text-body-sm">
                    <option value="">— Nao importar —</option>
                    {headers.map((h) => (
                      <option value={h} selected={autoMapping[field.key] === h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div class="flex gap-2 mt-2">
              <button
                type="submit"
                class="btn btn-primary inline-flex items-center gap-2"
                {...(missingRequired.length > 0 ? { disabled: true } : {})}
                style={missingRequired.length > 0 ? "opacity: 50%; cursor: not-allowed;" : undefined}
              >
                <i class="ph ph-check-circle" aria-hidden="true" />
                {missingRequired.length > 0 ? "Mapear campos obrigatorios primeiro" : `Importar ${totalRows} ${entity === "cases" ? "processos" : "clientes"}`}
              </button>
              <a href="/import" class="btn btn-secondary inline-flex items-center gap-2">
                <i class="ph ph-x" aria-hidden="true" />Cancelar
              </a>
            </div>
          </form>
        </Panel>
      </div>

      <div class="mt-4">
        <Panel title={`Previa (primeiras ${previewRows.length} linhas)`} icon="ph-table">
          <Table
            columns={[
              { label: "#", icon: "ph-hash" },
              ...fields.map((f) => ({ label: f.label.replace(" *", "") })),
            ]}
            rows={previewTableRows}
            emptyMsg="Nenhum dado para previsualizar."
            emptyIcon="ph-table"
          />
          {totalRows > previewRows.length && (
            <p class="text-body-sm text-gray-500 mt-2">
              ... e mais {totalRows - previewRows.length} linhas.
            </p>
          )}
        </Panel>
      </div>
    </>,
  );
});

// POST /import/confirm -- execute the import with the confirmed mapping.
importRoutes.post("/confirm", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const entity = String(body.entity ?? "clients");
  const csvBase64 = String(body.csv_data ?? "");

  if (!csvBase64) {
    setFlash(c, "error", "Dados do CSV ausentes. Recomece a importacao.");
    return c.redirect("/import");
  }

  // Decode CSV.
  let text: string;
  try {
    text = Buffer.from(csvBase64, "base64").toString("utf-8");
  } catch {
    setFlash(c, "error", "Erro ao decodificar dados do CSV.");
    return c.redirect("/import");
  }

  const rows = parseCSV(text);
  if (rows.length < 2) {
    setFlash(c, "error", "CSV sem dados.");
    return c.redirect("/import");
  }

  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const fields = entity === "cases" ? CASE_FIELDS : CLIENT_FIELDS;

  // Build mapping from form data.
  const mapping: Record<string, number> = {};
  for (const field of fields) {
    const colName = String(body[`map_${field.key}`] ?? "");
    if (colName) {
      mapping[field.key] = headers.indexOf(colName);
    }
  }

  // Validate required fields are mapped.
  const missingRequired = fields.filter((f) => f.required && !(f.key in mapping));
  if (missingRequired.length > 0) {
    setFlash(c, "error", `Campos obrigatorios nao mapeados: ${missingRequired.map((f) => f.label).join(", ")}`);
    return c.redirect("/import");
  }

  // Build records from CSV rows.
  let imported = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  if (entity === "clients") {
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] ?? [];
      const record: Record<string, unknown> = { tenant_id: user.tenantId };

      for (const [key, colIdx] of Object.entries(mapping)) {
        const value = (row[colIdx] ?? "").trim();
        if (key === "client_type") {
          record[key] = value.toLowerCase().startsWith("pj") || value.toLowerCase().includes("empresa") ? "pj" : "pf";
        } else {
          record[key] = value || null;
        }
      }

      // Skip rows where required fields are empty.
      if (!record.name) {
        errors++;
        errorDetails.push(`Linha ${i + 2}: nome vazio`);
        continue;
      }

      records.push(record);
    }

    // Batch insert (up to 500 at a time).
    const BATCH_SIZE = 500;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("clients").insert(batch);
      if (error) {
        errors += batch.length;
        errorDetails.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        imported += batch.length;
      }
    }
  } else {
    // Cases — need to resolve client_name to client_id.
    // First, fetch all client names for this tenant.
    const { data: existingClients } = await supabase
      .from("clients")
      .select("id, name")
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null);

    const clientMap = new Map<string, string>();
    for (const cl of existingClients ?? []) {
      clientMap.set(cl.name.toLowerCase().trim(), cl.id);
    }

    // Also collect any new client names from the CSV to create them.
    const newClientNames = new Set<string>();
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] ?? [];
      const clientColIdx = mapping["client_name"];
      if (clientColIdx === undefined) continue;
      const clientName = (row[clientColIdx] ?? "").trim();
      if (clientName && !clientMap.has(clientName.toLowerCase().trim())) {
        newClientNames.add(clientName);
      }
    }

    // Create new clients first.
    if (newClientNames.size > 0) {
      const newClientRecords = Array.from(newClientNames).map((name) => ({
        tenant_id: user.tenantId,
        name,
        client_type: "pf",
      }));
      const { data: inserted } = await supabase.from("clients").insert(newClientRecords).select("id, name");
      for (const cl of inserted ?? []) {
        clientMap.set(cl.name.toLowerCase().trim(), cl.id);
      }
    }

    // Build case records.
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] ?? [];
      const record: Record<string, unknown> = { tenant_id: user.tenantId };

      for (const [key, colIdx] of Object.entries(mapping)) {
        if (key === "client_name") continue; // Handled separately.
        const value = (row[colIdx] ?? "").trim();
        if (key === "status") {
          record[key] = value || "active";
        } else {
          record[key] = value || null;
        }
      }

      // Resolve client_id from client_name.
      const clientColIdx = mapping["client_name"];
      const clientName = clientColIdx !== undefined ? (row[clientColIdx] ?? "").trim() : "";
      const clientId = clientMap.get(clientName.toLowerCase().trim());
      if (!clientId) {
        errors++;
        errorDetails.push(`Linha ${i + 2}: cliente "${clientName}" nao encontrado`);
        continue;
      }
      record.client_id = clientId;

      // Ensure required fields.
      if (!record.title || !record.case_type) {
        errors++;
        errorDetails.push(`Linha ${i + 2}: titulo ou tipo vazio`);
        continue;
      }

      records.push(record);
    }

    // Batch insert.
    const BATCH_SIZE = 500;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("cases").insert(batch);
      if (error) {
        errors += batch.length;
        errorDetails.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        imported += batch.length;
      }
    }
  }

  // Build result message.
  if (imported > 0 && errors === 0) {
    setFlash(c, "success", `${imported} ${entity === "cases" ? "processos" : "clientes"} importados com sucesso!`);
  } else if (imported > 0 && errors > 0) {
    setFlash(c, "warning", `${imported} importados, ${errors} com erro. Verifique os detalhes abaixo.`);
  } else {
    setFlash(c, "error", `Nenhum registro importado. ${errors} erros.`);
  }

  return renderPage(
    c,
    { title: "Resultado da Importacao", active: "import" },
    <>
      <PageHeader title="Resultado da Importacao" icon="ph-check-circle" />

      <Panel title="Resumo" icon="ph-info">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <i class="ph ph-check-circle text-h2 text-status-green" aria-hidden="true" />
            <div>
              <div class="text-h2 font-bold text-green-800">{imported}</div>
              <div class="text-body-sm text-green-600">Importados com sucesso</div>
            </div>
          </div>
          <div class="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
            <i class="ph ph-x-circle text-h2 text-status-red" aria-hidden="true" />
            <div>
              <div class="text-h2 font-bold text-red-800">{errors}</div>
              <div class="text-body-sm text-red-600">Com erro</div>
            </div>
          </div>
        </div>
      </Panel>

      {errorDetails.length > 0 && (
        <div class="mt-4">
          <Panel title="Detalhes dos erros" icon="ph-warning">
            <ul class="text-body-sm text-gray-700 space-y-1 max-h-64 overflow-y-auto">
              {errorDetails.slice(0, 50).map((err, i) => (
                <li key={i} class="flex items-start gap-2">
                  <i class="ph ph-x text-status-red mt-0.5" aria-hidden="true" />
                  <span>{err}</span>
                </li>
              ))}
              {errorDetails.length > 50 && (
                <li class="text-gray-500 italic">... e mais {errorDetails.length - 50} erros.</li>
              )}
            </ul>
          </Panel>
        </div>
      )}

      <div class="mt-4 flex gap-2">
        <a href="/import" class="btn btn-primary inline-flex items-center gap-2">
          <i class="ph ph-upload-simple" aria-hidden="true" />Nova importacao
        </a>
        <a href={entity === "cases" ? "/cases" : "/clients"} class="btn btn-secondary inline-flex items-center gap-2">
          <i class="ph ph-list" aria-hidden="true" />Ver {entity === "cases" ? "processos" : "clientes"}
        </a>
      </div>
    </>,
  );
});
