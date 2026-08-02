import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { setFlash } from "../lib/flash";
import { processDocumentOCR, batchProcessDocuments } from "../lib/ocr";
import { listDocumentVersions, createDocumentVersion, getVersionDownloadUrl, restoreDocumentVersion, formatFileSize, type DocumentVersion } from "../lib/document-versions";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Modal, FileUpload, WizardModal } from "../components/ui";

export const documentsRoutes = new Hono<AppEnv>();

documentsRoutes.use("*", requireAuth);

const docSchema = z.object({
  case_id: z.string().optional(),
  client_id: z.string().optional(),
  title: z.string().min(1, "Titulo e obrigatorio"),
  description: z.string().optional(),
  file_url: z.string().optional(),
  doc_type: z.enum(["peticao", "procuracao", "contrato", "sentenca", "acordao", "declaracao", "recibo", "outro"]).optional(),
  template_id: z.string().optional(),
});

const docTypeOptions = [
  { value: "outro", label: "Outro" },
  { value: "contrato", label: "Contrato" },
  { value: "peticao", label: "Peticao" },
  { value: "procuracao", label: "Procuracao" },
  { value: "sentenca", label: "Sentenca" },
  { value: "acordao", label: "Acordao" },
  { value: "declaracao", label: "Declaracao" },
  { value: "recibo", label: "Recibo" },
];

const docTypeLabels: Record<string, string> = {
  peticao: "Peticao", procuracao: "Procuracao", contrato: "Contrato",
  sentenca: "Sentenca", acordao: "Acordao", declaracao: "Declaracao",
  recibo: "Recibo", outro: "Outro",
};

// GET / -- list documents with create modal.
documentsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let docsQuery = supabase
    .from("documents")
    .select("id, title, doc_type, storage_path, created_at, cases(title), clients(name)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  if (search) docsQuery = docsQuery.ilike("title", `%${search}%`);

  docsQuery = docsQuery.range(offset, offset + limit - 1);

  const [docsRes, casesRes, clientsRes, templatesRes] = await Promise.all([
    docsQuery,
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("document_templates").select("id, name, doc_type, content").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const docs = docsRes.data ?? [];
  const count = docsRes.count;
  const totalPages = count ? Math.ceil(count / limit) : 1;
  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const templates = templatesRes.data ?? [];

  const rows = docs.map((d) => [
    <a href={`/documents/${d.id}`} class="text-[#0568ff] hover:underline">{d.title}</a> as unknown as string,
    docTypeLabels[d.doc_type] ?? d.doc_type,
    (d.cases as unknown as { title: string } | null)?.title ?? "-",
    (d.clients as unknown as { name: string } | null)?.name ?? "-",
    new Date(d.created_at).toLocaleDateString("pt-BR"),
    <div class="flex items-center gap-2">
      <a href={`/documents/${d.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <a href={`/documents/${d.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/documents/${d.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Documentos", active: "documents" },
    <>
      <PageHeader
        title="Documentos"
        icon="ph-file-text"
        actions={() => (
          <WizardModal
            id="newDoc"
            title="Novo Documento"
            icon="ph-file-text"
            triggerText="Novo Documento"
            triggerIcon="ph-plus"
            action="/documents"
            submitLabel="Salvar Documento"
            submitIcon="ph-floppy-disk"
            large
            steps={[
              {
                label: "Origem",
                icon: "ph-tree",
                fields: (
                  <>
                    <input type="hidden" id="mode" name="mode" value="upload" />
                    <p class="text-body-sm text-gray-500 mb-2">Como voce quer criar este documento?</p>
                    <div class="grid grid-cols-2 gap-4">
                      <button type="button" id="modeUploadBtn"
                        class="border-2 border-[#0568ff] bg-[#e6efff] rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer"
                        onclick="document.getElementById('mode').value='upload'; document.getElementById('modeUploadBtn').classList.add('border-[#0568ff]','bg-[#e6efff]'); document.getElementById('modeUploadBtn').classList.remove('border-gray-200','bg-white'); document.getElementById('modeTemplateBtn').classList.add('border-gray-200','bg-white'); document.getElementById('modeTemplateBtn').classList.remove('border-[#0568ff]','bg-[#e6efff]');">
                        <div class="w-12 h-12 rounded-xl bg-[#0568ff] flex items-center justify-center">
                          <i class="ph ph-upload-simple text-h2 text-white" aria-hidden="true"></i>
                        </div>
                        <span class="text-h3 font-semibold text-gray-800">Enviar arquivo</span>
                        <span class="text-body-sm text-gray-500 text-center">PDF, Word, imagens e outros</span>
                      </button>
                      <button type="button" id="modeTemplateBtn"
                        class="border-2 border-gray-200 bg-white rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer"
                        onclick="document.getElementById('mode').value='template'; document.getElementById('modeTemplateBtn').classList.add('border-[#0568ff]','bg-[#e6efff]'); document.getElementById('modeTemplateBtn').classList.remove('border-gray-200','bg-white'); document.getElementById('modeUploadBtn').classList.add('border-gray-200','bg-white'); document.getElementById('modeUploadBtn').classList.remove('border-[#0568ff]','bg-[#e6efff]');">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #4d8bff 0%, #0568ff 100%);">
                          <i class="ph ph-files text-h2 text-white" aria-hidden="true"></i>
                        </div>
                        <span class="text-h3 font-semibold text-gray-800">Criar de modelo</span>
                        <span class="text-body-sm text-gray-500 text-center">Contratos, peticoes e documentos padrao</span>
                      </button>
                    </div>
                  </>
                ),
              },
              {
                label: "Conteudo",
                icon: "ph-file",
                fields: (
                  <>
                    {/* Modo upload */}
                    <div id="uploadSection">
                      <FileUpload label="Arquivo" id="file_url" name="file_url" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" maxSize={10} required help="Arraste o arquivo ou clique para selecionar. PDF, imagens, Office ate 10MB." />
                    </div>
                    {/* Modo template */}
                    <div id="templateSection" style="display:none;">
                      <ComboBox label="Modelo" id="template_id" name="template_id"
                        options={[{ value: "", label: "Selecione um modelo..." }, ...templates.map((t) => ({ value: t.id, label: `${t.name} (${t.doc_type})` }))]}
                      />
                      <div id="templatePreview" class="mt-3 border border-gray-100 rounded-lg p-4 bg-gray-50 hidden">
                        <p class="text-body-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preview do conteudo</p>
                        <div id="templatePreviewContent" class="text-body text-gray-700 font-serif whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed"></div>
                      </div>
                      <input type="hidden" id="template_content" name="template_content" value="" />
                      <script dangerouslySetInnerHTML={{ __html: `
                        (function() {
                          var templates = ${JSON.stringify(templates.map((t) => ({ id: t.id, name: t.name, doc_type: t.doc_type, content: t.content }))).replace(/</g, "\\u003c")};
                          var sel = document.getElementById('template_id');
                          var preview = document.getElementById('templatePreview');
                          var previewContent = document.getElementById('templatePreviewContent');
                          var contentField = document.getElementById('template_content');
                          sel.addEventListener('change', function() {
                            var tpl = templates.find(function(t) { return t.id === sel.value; });
                            if (tpl) {
                              contentField.value = tpl.content || '';
                              previewContent.textContent = tpl.content || '(modelo vazio)';
                              preview.classList.remove('hidden');
                            } else {
                              contentField.value = '';
                              preview.classList.add('hidden');
                            }
                          });
                        })();
                      `}} />
                    </div>
                    <script dangerouslySetInnerHTML={{ __html: `
                      (function() {
                        var modeInput = document.getElementById('mode');
                        var uploadSection = document.getElementById('uploadSection');
                        var templateSection = document.getElementById('templateSection');
                        function updateSections() {
                          if (modeInput.value === 'template') {
                            uploadSection.style.display = 'none';
                            templateSection.style.display = '';
                          } else {
                            uploadSection.style.display = '';
                            templateSection.style.display = 'none';
                          }
                        }
                        // Watch for changes
                        var observer = new MutationObserver(updateSections);
                        observer.observe(modeInput, { attributes: true, attributeFilter: ['value'] });
                        // Also check on click anywhere (wizard step changes)
                        document.addEventListener('click', function() { setTimeout(updateSections, 50); });
                        updateSections();
                      })();
                    `}} />
                  </>
                ),
              },
              {
                label: "Detalhes",
                icon: "ph-text-aa",
                fields: (
                  <>
                    <TextField label="Titulo" id="title" name="title" required placeholder="Nome do documento" />
                    <Select label="Tipo" id="doc_type" name="doc_type" options={docTypeOptions} selected="outro" />
                    <Textarea label="Descricao (opcional)" id="description" name="description" rows={4} />
                  </>
                ),
              },
              {
                label: "Vinculacao",
                icon: "ph-link",
                fields: (
                  <>
                    <p class="text-body-sm text-gray-500">Vincule este documento a um processo e/ou cliente (opcional).</p>
                    <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
                      options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
                    />
                    <ComboBox label="Cliente (opcional)" id="client_id" name="client_id"
                      options={[{ value: "", label: "Nenhum" }, ...clients.map((cl) => ({ value: cl.id, label: cl.name }))]}
                    />
                  </>
                ),
              },
            ]}
          />
        )}
      />
      <form method="get" action="/documents" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Titulo do documento..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[{ label: "Titulo" }, { label: "Tipo" }, { label: "Processo" }, { label: "Cliente" }, { label: "Criado em" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhum documento."
        emptyIcon="ph-file-text"
        ariaLabel="Lista de documentos"
        count={count ?? 0}
        countLabel="documento(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/documents",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// GET /:id -- detail with edit modal.
documentsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [docRes, casesRes, clientsRes, clicksignInt, docusignInt] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", user.tenantId)
      .single(),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("integrations").select("id").eq("tenant_id", user.tenantId).eq("type", "clicksign").eq("active", true).limit(1).maybeSingle(),
    supabase.from("integrations").select("id").eq("tenant_id", user.tenantId).eq("type", "docusign").eq("active", true).limit(1).maybeSingle(),
  ]);

  const doc = docRes.data;
  if (!doc) return c.html("Documento nao encontrado.", 404);

  // If the file is in Supabase Storage (storage_path is not a URL), generate a signed URL.
  let fileViewUrl = doc.file_url ?? null;
  if (!fileViewUrl && doc.storage_path && !doc.storage_path.startsWith("http")) {
    const { data: signedData } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600);
    fileViewUrl = signedData?.signedUrl ?? null;
  }

  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const hasClicksign = !!clicksignInt.data;
  const hasDocusign = !!docusignInt.data;

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
              <Select label="Tipo" id="edit_doc_type" name="doc_type" options={docTypeOptions} selected={doc.doc_type ?? "outro"} />
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
              <FileUpload label="Arquivo" id="edit_file_url" name="file_url" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" maxSize={10} value={doc.file_url ?? doc.storage_path ?? ""} help="PDF, imagens, Office ate 10MB." />
            </Modal>
            <Modal
              id="sendSignature"
              title="Enviar para Assinatura"
              icon="ph-pen-nib"
              triggerText="Enviar para Assinatura"
              triggerIcon="ph-pen-nib"
              triggerVariant="secondary"
              action="/signatures"
              submitLabel="Enviar"
              submitIcon="ph-paper-plane-tilt"
              large
            >
              <TextField label="Titulo" id="sig_title" name="title" required value={doc.title} />
              <div class="grid grid-cols-2 gap-4">
                <TextField label="Nome do Signatario" id="sig_signer_name" name="signer_name" placeholder="Nome completo" icon="ph-user" />
                <TextField label="E-mail do Signatario" id="sig_signer_email" name="signer_email" type="email" required placeholder="signatario@email.com" icon="ph-envelope" />
              </div>
              <Select label="Provedor" id="sig_provider" name="provider" required
                options={[
                  { value: "internal", label: "Interno - Manual" },
                  ...(hasClicksign ? [{ value: "clicksign", label: "ClickSign" }] : []),
                  ...(hasDocusign ? [{ value: "docusign", label: "DocuSign" }] : []),
                ]}
              />
              <Textarea label="Mensagem (opcional)" id="sig_message" name="message" rows={3}></Textarea>
              <input type="hidden" name="document_id" value={doc.id} />
              <input type="hidden" name="document_name" value={doc.title} />
            </Modal>
            <form method="post" action={`/documents/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este documento?')" aria-label="Excluir">
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
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{docTypeLabels[doc.doc_type] ?? doc.doc_type}</dd></div>
            {caseTitle ? <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline"><a href={`/cases/${doc.case_id}`} class="text-[#0568ff] hover:underline">{caseTitle}</a></dd></div> : null}
            {clientName ? <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${doc.client_id}`} class="text-[#0568ff] hover:underline">{clientName}</a></dd></div> : null}
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{new Date(doc.created_at).toLocaleDateString("pt-BR")}</dd></div>
          </dl>
        </Panel>
        {doc.description ? (
          <Panel title="Descricao" icon="ph-text-aa">
            <p class="text-body text-gray-700 whitespace-pre-wrap font-serif leading-relaxed">{doc.description}</p>
          </Panel>
        ) : null}
      </div>
      {(fileViewUrl || doc.storage_path) ? (
        <Panel title="Arquivo" icon="ph-file">
          {fileViewUrl ? (
            <a href={fileViewUrl} class="text-[#0568ff] hover:underline inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer">
              <i class="ph ph-download-simple" aria-hidden="true"></i> Baixar / Visualizar arquivo
            </a>
          ) : (
            <span class="text-body-sm text-gray-500">{doc.storage_path}</span>
          )}
        </Panel>
      ) : null}
    </>,
  );
});

// POST / -- create.
documentsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const mode = String(body.mode ?? "upload"); // "upload" or "template"
  const title = String(body.title ?? "");
  const clientId = String(body.client_id ?? "") || null;
  const caseId = String(body.case_id ?? "") || null;
  const description = String(body.description ?? "") || null;
  const fileUrl = String(body.file_url ?? "") || null;
  const docType = String(body.doc_type ?? "outro") || "outro";
  const templateId = String(body.template_id ?? "") || null;
  const templateContent = String(body.template_content ?? "") || null;

  // In template mode, the content comes from the template, not a file upload.
  const effectiveFileUrl = mode === "template" ? null : fileUrl;
  const effectiveDescription = mode === "template" && !description ? templateContent : description;

  // If template mode, fetch the template to get its doc_type.
  let effectiveDocType = docType;
  if (mode === "template" && templateId) {
    const { data: tpl } = await supabase
      .from("document_templates")
      .select("doc_type")
      .eq("id", templateId)
      .eq("tenant_id", user.tenantId)
      .single();
    if (tpl?.doc_type) effectiveDocType = tpl.doc_type;
  }

  // If the value is a storage path (not a URL), mark provider as supabase.
  const isStoragePath = effectiveFileUrl !== null && !effectiveFileUrl.startsWith("http");

  const parsed = docSchema.safeParse({ title, client_id: clientId, case_id: caseId, description: effectiveDescription, file_url: effectiveFileUrl, doc_type: effectiveDocType, template_id: templateId });
  if (!parsed.success) return c.redirect("/documents");

  await supabase.from("documents").insert({
    tenant_id: user.tenantId,
    case_id: caseId,
    client_id: clientId,
    title: parsed.data.title,
    doc_type: parsed.data.doc_type ?? "outro",
    description: parsed.data.description || null,
    storage_path: parsed.data.file_url || "",
    file_url: parsed.data.file_url || null,
    storage_provider: isStoragePath ? "supabase" : "none",
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
  const docType = String(body.doc_type ?? "outro") || "outro";
  const isStoragePath = fileUrl !== null && !fileUrl.startsWith("http");

  const parsed = docSchema.safeParse({ title, client_id: clientId, case_id: caseId, description, file_url: fileUrl, doc_type: docType });
  if (!parsed.success) return c.redirect(`/documents/${id}`);

  await supabase
    .from("documents")
    .update({
      title: parsed.data.title,
      doc_type: parsed.data.doc_type ?? "outro",
      case_id: caseId,
      client_id: clientId,
      description: parsed.data.description || null,
      storage_path: parsed.data.file_url || "",
      file_url: parsed.data.file_url || null,
      storage_provider: isStoragePath ? "supabase" : "none",
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

// POST /:id/ocr -- run OCR on a single document.
documentsRoutes.post("/:id/ocr", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Fetch document to get storage path.
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, title")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .maybeSingle();

  if (!doc) {
    setFlash(c, "error", "Documento nao encontrado.");
    return c.redirect("/documents");
  }

  const result = await processDocumentOCR(user.tenantId, id, "documents", doc.storage_path);

  if (result.success) {
    setFlash(c, "success", `OCR concluido: ${result.text?.length ?? 0} caracteres extraidos.`);
  } else {
    setFlash(c, "error", `Erro no OCR: ${result.error}`);
  }

  return c.redirect(`/documents/${id}`);
});

// POST /ocr/batch -- run OCR on all documents without extracted text.
documentsRoutes.post("/ocr/batch", async (c) => {
  const user = c.get("user");

  const result = await batchProcessDocuments(user.tenantId, 10);

  if (result.processed === 0) {
    setFlash(c, "info", "Nenhum documento pendente de OCR.");
  } else {
    setFlash(c, "success", `OCR em lote: ${result.success} processados, ${result.failed} falharam.`);
  }

  return c.redirect("/documents");
});

// GET /:id/versions -- list all versions of a document.
documentsRoutes.get("/:id/versions", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [versions, docRes] = await Promise.all([
    listDocumentVersions(user.tenantId, id),
    supabase.from("documents").select("id, title").eq("id", id).eq("tenant_id", user.tenantId).maybeSingle(),
  ]);

  if (!docRes.data) {
    return c.redirect("/documents");
  }

  return renderPage(
    c,
    { title: "Versoes do Documento", active: "documents" },
    <>
      <PageHeader title={`Versoes: ${docRes.data.title}`} icon="ph-files" />

      <Panel>
        {versions.length > 0 ? (
          <div class="space-y-3">
            {versions.map((v: DocumentVersion) => (
              <div key={v.id} class="flex items-center justify-between border-b border-gray-100 py-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium">v{v.versionNumber}</span>
                    {v.versionNumber === versions[0]!.versionNumber && (
                      <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Atual</span>
                    )}
                  </div>
                  <div class="text-sm text-gray-500 mt-1">
                    {v.uploadedByName ?? "Usuario"} — {new Date(v.createdAt).toLocaleString("pt-BR")}
                  </div>
                  <div class="text-xs text-gray-400 mt-0.5">
                    {formatFileSize(v.fileSizeBytes)} — {v.mimeType}
                  </div>
                  {v.changeSummary && (
                    <div class="text-sm text-gray-600 mt-1 italic">"{v.changeSummary}"</div>
                  )}
                </div>
                <div class="flex items-center gap-2 ml-4">
                  <a href={`/documents/${id}/versions/${v.versionNumber}/download`}
                    class="text-sm text-[#0568ff] hover:underline">Baixar</a>
                  {v.versionNumber !== versions[0]!.versionNumber && (
                    <form method="post" action={`/documents/${id}/versions/${v.versionNumber}/restore`} class="inline">
                      <button type="submit" class="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">
                        Restaurar
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p class="text-gray-500 text-sm">Nenhuma versao registrada ainda.</p>
        )}
      </Panel>

      {/* Upload new version */}
      <Panel>
        <h2 class="text-lg font-semibold mb-4">Nova Versao</h2>
        <form method="post" action={`/documents/${id}/versions`} enctype="multipart/form-data" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
            <input type="file" name="file" required
              class="w-full px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Resumo da alteracao (opcional)</label>
            <input type="text" name="change_summary" placeholder="Ex: Revisao apos correcao"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <button type="submit" class="bg-[#0568ff] hover:bg-[#4d8bff] text-white px-4 py-2 rounded-lg text-sm font-medium">
            Upload Nova Versao
          </button>
        </form>
      </Panel>
    </>,
  );
});

// POST /:id/versions -- upload a new version.
documentsRoutes.post("/:id/versions", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const body = await c.req.formData();
  const file = body.get("file") as File | null;
  const changeSummary = body.get("change_summary") as string | null;

  if (!file) {
    setFlash(c, "error", "Nenhum arquivo enviado.");
    return c.redirect(`/documents/${id}/versions`);
  }

  const version = await createDocumentVersion(
    user.tenantId,
    id,
    file,
    file.type || "application/octet-stream",
    user.id,
    changeSummary ?? undefined,
  );

  if (version) {
    setFlash(c, "success", `Versao ${version.versionNumber} criada com sucesso!`);
  } else {
    setFlash(c, "error", "Erro ao criar versao.");
  }

  return c.redirect(`/documents/${id}/versions`);
});

// GET /:id/versions/:num/download -- download a specific version.
documentsRoutes.get("/:id/versions/:num/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const versionNum = parseInt(c.req.param("num"), 10);

  const versions = await listDocumentVersions(user.tenantId, id);
  const version = versions.find((v) => v.versionNumber === versionNum);

  if (!version) {
    return c.text("Versao nao encontrada", 404);
  }

  const url = await getVersionDownloadUrl(user.tenantId, version.storagePath);
  if (!url) {
    return c.text("Erro ao gerar URL de download", 500);
  }

  return c.redirect(url);
});

// POST /:id/versions/:num/restore -- restore a previous version.
documentsRoutes.post("/:id/versions/:num/restore", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const versionNum = parseInt(c.req.param("num"), 10);

  const version = await restoreDocumentVersion(user.tenantId, id, versionNum, user.id);

  if (version) {
    setFlash(c, "success", `Versao ${versionNum} restaurada (nova versao ${version.versionNumber} criada).`);
  } else {
    setFlash(c, "error", "Erro ao restaurar versao.");
  }

  return c.redirect(`/documents/${id}/versions`);
});
