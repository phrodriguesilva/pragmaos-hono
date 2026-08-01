import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Panel } from "../components/ui";

export const documentsRoutes = new Hono<AppEnv>();

documentsRoutes.use("*", requireAuth);

const docSchema = z.object({
  case_id: z.string().optional(),
  client_id: z.string().optional(),
  title: z.string().min(1, "Titulo e obrigatorio"),
  doc_type: z.string().min(1),
});

documentsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, doc_type, storage_path, created_at, cases(title), clients(name)")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (docs ?? []).map((d) => [
    d.title,
    d.doc_type,
    (d.cases as unknown as { title: string } | null)?.title ?? "-",
    (d.clients as unknown as { name: string } | null)?.name ?? "-",
    new Date(d.created_at).toLocaleDateString("pt-BR"),
  ]);

  return renderPage(
    c,
    { title: "Documentos", active: "documents" },
    <>
      <PageHeader title="Documentos" actions={() => <a href="/documents/new" class="btn btn-primary">Novo Documento</a>} />
      <Table
        columns={[{ label: "Titulo" }, { label: "Tipo" }, { label: "Processo" }, { label: "Cliente" }, { label: "Criado em" }]}
        rows={rows}
        emptyMsg="Nenhum documento."
        ariaLabel="Lista de documentos"
      />
    </>,
  );
});

documentsRoutes.get("/new", async (c) => {
  const user = c.get("user");
  const [casesRes, clientsRes] = await Promise.all([
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  return renderPage(
    c,
    { title: "Novo Documento", active: "documents" },
    <>
      <PageHeader title="Novo Documento" />
      <Panel>
        <form method="post" action="/documents" class="flex flex-col gap-4" enctype="multipart/form-data">
          <TextField label="Titulo" id="title" name="title" required placeholder="Nome do documento" />
          <Select label="Tipo" id="doc_type" name="doc_type" required
            options={[
              { value: "peticao", label: "Peticao" },
              { value: "procuracao", label: "Procuracao" },
              { value: "contrato", label: "Contrato" },
              { value: "sentenca", label: "Sentenca" },
              { value: "acordao", label: "Acordao" },
              { value: "outro", label: "Outro" },
            ]}
          />
          <Select label="Cliente (opcional)" id="client_id" name="client_id"
            options={[{ value: "", label: "Nenhum" }, ...(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))]}
          />
          <Select label="Processo (opcional)" id="case_id" name="case_id"
            options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
          />
          <div class="flex flex-col gap-1">
            <label for="file" class="text-body-sm font-semibold text-gray-700">Arquivo *</label>
            <input id="file" name="file" type="file" required class="text-body-sm" />
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary">Salvar</button>
            <a href="/documents" class="btn btn-secondary">Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

documentsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const title = String(formData.get("title") ?? "");
  const docType = String(formData.get("doc_type") ?? "outro");
  const clientId = String(formData.get("client_id") ?? "") || null;
  const caseId = String(formData.get("case_id") ?? "") || null;

  if (!file) return c.redirect("/documents/new");

  const parsed = docSchema.safeParse({ title, doc_type: docType, client_id: clientId, case_id: caseId });
  if (!parsed.success) return c.redirect("/documents/new");

  // Upload to Supabase Storage.
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${user.tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabase.storage.from("documents").upload(path, file);
  if (uploadErr) {
    console.error("upload error:", uploadErr);
    return c.redirect("/documents/new");
  }

  await supabase.from("documents").insert({
    tenant_id: user.tenantId,
    case_id: caseId,
    client_id: clientId,
    title: parsed.data.title,
    doc_type: parsed.data.doc_type,
    storage_path: path,
    uploaded_by: user.id,
  });

  return c.redirect("/documents");
});
