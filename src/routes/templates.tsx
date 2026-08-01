import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const templatesRoutes = new Hono<AppEnv>();

templatesRoutes.use("*", requireAuth);

const templateSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  doc_type: z.enum(["peticao", "procuracao", "contrato", "sentenca", "acordao", "declaracao", "recibo", "outro"]),
  content: z.string().min(1, "Conteudo e obrigatorio"),
  variables: z.string().optional(),
});

const docTypeOptions = [
  { value: "peticao", label: "Peticao" },
  { value: "procuracao", label: "Procuracao" },
  { value: "contrato", label: "Contrato" },
  { value: "sentenca", label: "Sentenca" },
  { value: "acordao", label: "Acordao" },
  { value: "declaracao", label: "Declaracao" },
  { value: "recibo", label: "Recibo" },
  { value: "outro", label: "Outro" },
];

// GET / -- list all templates.
templatesRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: templates } = await supabase
    .from("document_templates")
    .select("id, name, doc_type, created_at")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = (templates ?? []).map((tpl) => [
    <a href={`/templates/${tpl.id}`} class="text-terracota-600 hover:underline">{tpl.name}</a> as unknown as string,
    tpl.doc_type,
    new Date(tpl.created_at).toLocaleDateString("pt-BR"),
    "",
  ]);

  return renderPage(
    c,
    { title: "Modelos de Documentos", active: "templates" },
    <>
      <PageHeader
        title="Modelos de Documentos"
        icon="ph-files"
        actions={() => (
          <a href="/templates/new" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-plus" aria-hidden="true"></i>Novo Modelo
          </a>
        )}
      />
      <Table
        columns={[
          { label: "Nome" },
          { label: "Tipo" },
          { label: "Criado em" },
          { label: "" },
        ]}
        rows={rows}
        emptyMsg="Nenhum modelo encontrado."
        emptyIcon="ph-files"
        ariaLabel="Lista de modelos de documentos"
      />
    </>,
  );
});

// GET /new -- form to create a template.
templatesRoutes.get("/new", (c) => {
  return renderPage(
    c,
    { title: "Novo Modelo", active: "templates" },
    <>
      <PageHeader title="Novo Modelo" icon="ph-plus-circle" />
      <Panel>
        <form method="post" action="/templates" class="flex flex-col gap-4">
          <TextField label="Nome" id="name" name="name" required icon="ph-text-aa" placeholder="Nome do modelo" />
          <Select label="Tipo" id="doc_type" name="doc_type" options={docTypeOptions} selected="peticao" required />
          <Textarea label="Conteudo" id="content" name="content" rows={10} required>
            {""}
          </Textarea>
          <p class="text-body-sm text-gray-500 -mt-2">Use a sintaxe <code class="bg-gray-100 px-1">{"{{variavel}}"}</code> para inserir variaveis no conteudo.</p>
          <TextField label="Variaveis" id="variables" name="variables" placeholder="cliente, processo, tribunal, data" icon="ph-tag" />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href="/templates" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST / -- create.
templatesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = templateSchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return renderPage(
      c,
      { title: "Novo Modelo", active: "templates" },
      <>
        <PageHeader title="Novo Modelo" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red">
            <i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>
            {Object.values(errors).flat().join(", ")}
          </div>
          <a href="/templates/new" class="btn btn-secondary">Voltar</a>
        </Panel>
      </>,
    );
  }

  const variables = parsed.data.variables
    ? parsed.data.variables.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  const { error } = await supabase.from("document_templates").insert({
    tenant_id: user.tenantId,
    name: parsed.data.name,
    doc_type: parsed.data.doc_type,
    content: parsed.data.content,
    variables,
    created_by: user.id,
  });

  if (error) {
    return renderPage(
      c,
      { title: "Novo Modelo", active: "templates" },
      <>
        <PageHeader title="Novo Modelo" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red"><i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>Erro ao salvar: {error.message}</div>
          <a href="/templates/new" class="btn btn-secondary">Voltar</a>
        </Panel>
      </>,
    );
  }

  return c.redirect("/templates");
});

// GET /:id -- detail view.
templatesRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: template } = await supabase
    .from("document_templates")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!template) {
    return c.html("Modelo nao encontrado.", 404);
  }

  const variables: string[] = Array.isArray(template.variables) ? template.variables : [];

  return renderPage(
    c,
    { title: template.name, active: "templates" },
    <>
      <PageHeader
        title={template.name}
        icon="ph-file-text"
        actions={() => (
          <div class="flex gap-2">
            <a href={`/templates/${id}/edit`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-pencil" aria-hidden="true"></i>Editar</a>
            <form method="post" action={`/templates/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este modelo?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="flex flex-col gap-2 mb-4">
        <div class="flex items-center gap-2">
          <span class="text-body-sm font-semibold text-gray-700">Tipo:</span>
          <Badge color="blue">{template.doc_type}</Badge>
        </div>
        {variables.length > 0 ? (
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-body-sm font-semibold text-gray-700">Variaveis:</span>
            {variables.map((v) => (
              <Badge color="gray" icon="ph-tag">{v}</Badge>
            ))}
          </div>
        ) : null}
      </div>
      <Panel title="Conteudo" icon="ph-text-aa">
        <pre class="whitespace-pre-wrap font-mono text-body-sm text-gray-800">{template.content}</pre>
      </Panel>
    </>,
  );
});

// GET /:id/edit -- edit form.
templatesRoutes.get("/:id/edit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: template } = await supabase
    .from("document_templates")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!template) {
    return c.html("Modelo nao encontrado.", 404);
  }

  const variables: string[] = Array.isArray(template.variables) ? template.variables : [];

  return renderPage(
    c,
    { title: `Editar ${template.name}`, active: "templates" },
    <>
      <PageHeader title={`Editar ${template.name}`} icon="ph-pencil" />
      <Panel>
        <form method="post" action={`/templates/${id}`} class="flex flex-col gap-4">
          <TextField label="Nome" id="name" name="name" required icon="ph-text-aa" value={template.name} />
          <Select label="Tipo" id="doc_type" name="doc_type" options={docTypeOptions} selected={template.doc_type} required />
          <Textarea label="Conteudo" id="content" name="content" rows={10} required>
            {template.content}
          </Textarea>
          <p class="text-body-sm text-gray-500 -mt-2">Use a sintaxe <code class="bg-gray-100 px-1">{"{{variavel}}"}</code> para inserir variaveis no conteudo.</p>
          <TextField label="Variaveis" id="variables" name="variables" placeholder="cliente, processo, tribunal, data" icon="ph-tag" value={variables.join(", ")} />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href={`/templates/${id}`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /:id -- update.
templatesRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = templateSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/templates/${id}/edit`);
  }

  const variables = parsed.data.variables
    ? parsed.data.variables.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  await supabase
    .from("document_templates")
    .update({
      name: parsed.data.name,
      doc_type: parsed.data.doc_type,
      content: parsed.data.content,
      variables,
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/templates/${id}`);
});

// POST /:id/delete -- soft delete.
templatesRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("document_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/templates");
});
