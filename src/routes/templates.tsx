import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge, Modal } from "../components/ui";
import { WysiwygEditor } from "../components/editor";

export const templatesRoutes = new Hono<AppEnv>();

templatesRoutes.use("*", requireAuth);

const templateSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio").max(255),
  doc_type: z.enum(["peticao", "procuracao", "contrato", "sentenca", "acordao", "declaracao", "recibo", "outro"]),
  content: z.string().min(1, "Conteudo e obrigatorio").max(100000),
  variables: z.string().max(1000).optional(),
});

const docTypeOptions = [
  { value: "contrato", label: "Contrato" },
  { value: "peticao", label: "Peticao" },
  { value: "procuracao", label: "Procuracao" },
  { value: "declaracao", label: "Declaracao" },
  { value: "outro", label: "Outro" },
];

// GET / -- list all templates with create modal.
templatesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let query = supabase
    .from("document_templates")
    .select("id, name, doc_type, created_at", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) query = query.ilike("name", `%${search}%`);

  query = query.range(offset, offset + limit - 1);

  const { data: templates, count } = await query;
  const totalPages = count ? Math.ceil(count / limit) : 1;

  const rows = (templates ?? []).map((tpl) => [
    <a href={`/templates/${tpl.id}`} class="text-[#0568ff] hover:underline">{tpl.name}</a> as unknown as string,
    tpl.doc_type,
    new Date(tpl.created_at).toLocaleDateString("pt-BR"),
    <div class="flex items-center gap-2">
      <a href={`/templates/${tpl.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <a href={`/templates/${tpl.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/templates/${tpl.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Modelos de Documentos", active: "templates" },
    <>
      <PageHeader
        title="Modelos de Documentos"
        icon="ph-files"
        actions={() => (
          <Modal
            id="newTemplate"
            title="Novo Modelo"
            icon="ph-files"
            triggerText="Novo Modelo"
            triggerIcon="ph-plus"
            action="/templates"
            submitLabel="Salvar"
          >
            <TextField label="Nome" id="name" name="name" required icon="ph-text-aa" placeholder="Nome do modelo" />
            <Select label="Categoria" id="doc_type" name="doc_type" options={docTypeOptions} selected="contrato" required />
            <WysiwygEditor id="content-new" name="content" label="Conteudo" rows={10} value="" />
            <p class="text-body-sm text-gray-500 -mt-2">Use a sintaxe <code class="bg-gray-100 px-1">{"{{variavel}}"}</code> para inserir variaveis no conteudo.</p>
          </Modal>
        )}
      />
      <form method="get" action="/templates" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Nome do modelo..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Nome" },
          { label: "Tipo" },
          { label: "Criado em" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhum modelo encontrado."
        emptyIcon="ph-files"
        ariaLabel="Lista de modelos de documentos"
        count={count ?? 0}
        countLabel="modelo(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/templates",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
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
      { title: "Modelos de Documentos", active: "templates" },
      <>
        <PageHeader title="Modelos de Documentos" icon="ph-files" />
        <Panel>
          <div class="mb-4 text-status-red">
            <i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>
            {Object.values(errors).flat().join(", ")}
          </div>
          <a href="/templates" class="btn btn-secondary">Voltar</a>
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
    console.error("[templates] create failed", { error: error.message });
    return renderPage(
      c,
      { title: "Modelos de Documentos", active: "templates" },
      <>
        <PageHeader title="Modelos de Documentos" icon="ph-files" />
        <Panel>
          <div class="mb-4 text-status-red"><i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>Ocorreu um erro ao salvar o modelo. Tente novamente.</div>
          <a href="/templates" class="btn btn-secondary">Voltar</a>
        </Panel>
      </>,
    );
  }

  return c.redirect("/templates");
});

// GET /:id -- detail view with edit modal.
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
            <Modal
              id="editTemplate"
              title="Editar Modelo"
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/templates/${id}`}
              submitLabel="Salvar"
            >
              <TextField label="Nome" id="name" name="name" required icon="ph-text-aa" value={template.name} />
              <Select label="Categoria" id="doc_type" name="doc_type" options={docTypeOptions} selected={template.doc_type} required />
              <WysiwygEditor id="content-edit" name="content" label="Conteudo" rows={10} value={template.content ?? ""} />
              <p class="text-body-sm text-gray-500 -mt-2">Use a sintaxe <code class="bg-gray-100 px-1">{"{{variavel}}"}</code> para inserir variaveis no conteudo.</p>
            </Modal>
            <form method="post" action={`/templates/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este modelo?')" aria-label="Excluir">
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
        <pre class="whitespace-pre-wrap font-serif text-body text-gray-800 leading-relaxed">{template.content}</pre>
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
    return c.redirect(`/templates/${id}`);
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
