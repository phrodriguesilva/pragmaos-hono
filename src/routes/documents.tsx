import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Modal } from "../components/ui";

export const documentsRoutes = new Hono<AppEnv>();

documentsRoutes.use("*", requireAuth);

const docSchema = z.object({
  case_id: z.string().optional(),
  client_id: z.string().optional(),
  title: z.string().min(1, "Titulo e obrigatorio"),
  description: z.string().optional(),
  file_url: z.string().optional(),
});

// GET / -- list documents with create modal.
documentsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [docsRes, casesRes, clientsRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, doc_type, storage_path, created_at, cases(title), clients(name)")
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const docs = docsRes.data ?? [];
  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];

  const rows = docs.map((d) => [
    <a href={`/documents/${d.id}`} class="text-terracota-600 hover:underline">{d.title}</a> as unknown as string,
    d.doc_type,
    (d.cases as unknown as { title: string } | null)?.title ?? "-",
    (d.clients as unknown as { name: string } | null)?.name ?? "-",
    new Date(d.created_at).toLocaleDateString("pt-BR"),
  ]);

  return renderPage(
    c,
    { title: "Documentos", active: "documents" },
    <>
      <PageHeader
        title="Documentos"
        icon="ph-file-text"
        actions={() => (
          <Modal
            id="newDoc"
            title="Novo Documento"
            icon="ph-file-text"
            triggerText="Novo Documento"
            triggerIcon="ph-plus"
            action="/documents"
            submitLabel="Salvar"
            large
          >
            <TextField label="Titulo" id="title" name="title" required placeholder="Nome do documento" />
            <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
              options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
            />
            <ComboBox label="Cliente (opcional)" id="client_id" name="client_id"
              options={[{ value: "", label: "Nenhum" }, ...clients.map((cl) => ({ value: cl.id, label: cl.name }))]}
            />
            <Textarea label="Descricao" id="description" name="description" rows={4} />
            <TextField label="URL do Arquivo" id="file_url" name="file_url" placeholder="https://..." icon="ph-link" />
          </Modal>
        )}
      />
      <Table
        columns={[{ label: "Titulo" }, { label: "Tipo" }, { label: "Processo" }, { label: "Cliente" }, { label: "Criado em" }]}
        rows={rows}
        emptyMsg="Nenhum documento."
        emptyIcon="ph-file-text"
        ariaLabel="Lista de documentos"
      />
    </>,
  );
});

// GET /:id -- detail with edit modal.
documentsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [docRes, casesRes, clientsRes] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", user.tenantId)
      .single(),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const doc = docRes.data;
  if (!doc) return c.html("Documento nao encontrado.", 404);

  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];

  const caseTitle = (doc.cases as unknown as { title: string } | null)?.title;
  const clientName = (doc.clients as unknown as { name: string } | null)?.name;

  return renderPage(
    c,
    { title: doc.title, active: "documents" },
    <>
      <PageHeader
        title={doc.title}
        icon="ph-file-text"
        actions={() => (
          <div class="flex gap-2">
            <Modal
              id="editDoc"
              title="Editar Documento"
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/documents/${id}`}
              submitLabel="Salvar"
              large
            >
              <TextField label="Titulo" id="title" name="title" required value={doc.title} />
              <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
                options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
                selected={doc.case_id ?? ""}
              />
              <ComboBox label="Cliente (opcional)" id="client_id" name="client_id"
                options={[{ value: "", label: "Nenhum" }, ...clients.map((cl) => ({ value: cl.id, label: cl.name }))]}
                selected={doc.client_id ?? ""}
              />
              <Textarea label="Descricao" id="description" name="description" rows={4}>
                {doc.description ?? ""}
              </Textarea>
              <TextField label="URL do Arquivo" id="file_url" name="file_url" value={doc.file_url ?? doc.storage_path ?? ""} icon="ph-link" />
            </Modal>
            <form method="post" action={`/documents/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este documento?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados do Documento" icon="ph-file-text">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Titulo: </dt><dd class="inline">{doc.title}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{doc.doc_type}</dd></div>
            {caseTitle ? <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline"><a href={`/cases/${doc.case_id}`} class="text-terracota-600 hover:underline">{caseTitle}</a></dd></div> : null}
            {clientName ? <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${doc.client_id}`} class="text-terracota-600 hover:underline">{clientName}</a></dd></div> : null}
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{new Date(doc.created_at).toLocaleDateString("pt-BR")}</dd></div>
          </dl>
        </Panel>
        {doc.description ? (
          <Panel title="Descricao" icon="ph-text-aa">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{doc.description}</p>
          </Panel>
        ) : null}
      </div>
      {(doc.file_url || doc.storage_path) ? (
        <Panel title="Arquivo" icon="ph-link">
          <a href={doc.file_url ?? "#"} class="text-terracota-600 hover:underline" target="_blank" rel="noopener noreferrer">
            {doc.file_url ?? doc.storage_path}
          </a>
        </Panel>
      ) : null}
    </>,
  );
});

// POST / -- create.
documentsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const title = String(body.title ?? "");
  const clientId = String(body.client_id ?? "") || null;
  const caseId = String(body.case_id ?? "") || null;
  const description = String(body.description ?? "") || null;
  const fileUrl = String(body.file_url ?? "") || null;

  const parsed = docSchema.safeParse({ title, client_id: clientId, case_id: caseId, description, file_url: fileUrl });
  if (!parsed.success) return c.redirect("/documents");

  await supabase.from("documents").insert({
    tenant_id: user.tenantId,
    case_id: caseId,
    client_id: clientId,
    title: parsed.data.title,
    doc_type: "outro",
    description: parsed.data.description || null,
    storage_path: parsed.data.file_url || "",
    file_url: parsed.data.file_url || null,
    uploaded_by: user.id,
  });

  return c.redirect("/documents");
});

// POST /:id -- update.
documentsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const title = String(body.title ?? "");
  const clientId = String(body.client_id ?? "") || null;
  const caseId = String(body.case_id ?? "") || null;
  const description = String(body.description ?? "") || null;
  const fileUrl = String(body.file_url ?? "") || null;

  const parsed = docSchema.safeParse({ title, client_id: clientId, case_id: caseId, description, file_url: fileUrl });
  if (!parsed.success) return c.redirect(`/documents/${id}`);

  await supabase
    .from("documents")
    .update({
      title: parsed.data.title,
      case_id: caseId,
      client_id: clientId,
      description: parsed.data.description || null,
      storage_path: parsed.data.file_url || "",
      file_url: parsed.data.file_url || null,
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/documents/${id}`);
});

// POST /:id/delete -- delete.
documentsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/documents");
});
