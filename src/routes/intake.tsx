import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { setFlash, getFlash } from "../lib/flash";
import { log } from "../lib/logger";
import {
  createIntakeForm,
  listIntakeForms,
  getIntakeFormBySlug,
  submitIntakeForm,
  listSubmissions,
  convertSubmission,
  type IntakeField,
  type FieldType,
} from "../lib/intake";
import { PageHeader, Panel, Badge, Table, type TableColumn } from "../components/ui";

// Admin routes (protected).
export const intakeAdminRoutes = new Hono<AppEnv>();

intakeAdminRoutes.use("*", requireAuth);

// GET / — list forms and submissions.
intakeAdminRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [forms, submissions] = await Promise.all([
    listIntakeForms(user.tenantId),
    listSubmissions(user.tenantId, 20),
  ]);

  const flash = getFlash(c);

  const formColumns: TableColumn[] = [
    { label: "Titulo" },
    { label: "Slug" },
    { label: "Status" },
    { label: "Submissoes" },
    { label: "Link" },
  ];

  const submissionColumns: TableColumn[] = [
    { label: "Data" },
    { label: "Status" },
    { label: "Cliente" },
    { label: "Caso" },
    { label: "Acao", align: "right" },
  ];

  // Count submissions per form.
  const submissionCounts = new Map<string, number>();
  for (const s of submissions) {
    submissionCounts.set(s.formId, (submissionCounts.get(s.formId) ?? 0) + 1);
  }

  const formRows = forms.map((f) => [
    f.title,
    f.slug,
    f.isActive ? "Ativo" : "Inativo",
    String(submissionCounts.get(f.id) ?? 0),
    `/intake/f/${f.slug}`,
  ]);

  const submissionRows = submissions.map((s) => {
    const form = forms.find((f) => f.id === s.formId);
    const data = s.data;
    // Try to extract a name from the submission data.
    const nameField = form?.fields.find((f) => f.mapsTo?.entity === "client" && f.mapsTo?.field === "name");
    const clientName = nameField ? data[nameField.id] ?? "—" : "—";
    return [
      new Date(s.createdAt).toLocaleString("pt-BR"),
      s.status,
      clientName,
      s.caseId ? "Criado" : "—",
      s.status === "new" ? "Converter" : "Ver",
    ];
  });

  return renderPage(
    c,
    { title: "Formularios de Intake", active: "intake" },
    <>
      {flash && (
        <div class={`fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg ${flash.type === "success" ? "bg-green-600" : flash.type === "error" ? "bg-red-600" : flash.type === "warning" ? "bg-yellow-600" : "bg-blue-600"} text-white`}>
          {flash.message}
        </div>
      )}

      <PageHeader title="Formularios de Intake" icon="ph-clipboard-text" />

      <div class="space-y-6">
        {/* Create form button */}
        <div class="flex justify-end">
          <a href="/intake/new" class="bg-terracota-600 hover:bg-terracota-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Novo Formulario
          </a>
        </div>

        {/* Forms list */}
        <Panel>
          <h2 class="text-lg font-semibold mb-4">Formularios</h2>
          {formRows.length > 0 ? (
            <div class="space-y-2">
              {forms.map((f) => (
                <div key={f.id} class="flex items-center justify-between border-b border-gray-100 py-3">
                  <div>
                    <div class="font-medium">{f.title}</div>
                    <div class="text-sm text-gray-500">/intake/f/{f.slug}</div>
                  </div>
                  <div class="flex items-center gap-3">
                    <Badge color={f.isActive ? "green" : "gray"}>{f.isActive ? "Ativo" : "Inativo"}</Badge>
                    <a href={`/intake/f/${f.slug}`} target="_blank" class="text-sm text-terracota-600 hover:underline">
                      Abrir
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p class="text-gray-500 text-sm">Nenhum formulario criado ainda.</p>
          )}
        </Panel>

        {/* Submissions */}
        <Panel>
          <h2 class="text-lg font-semibold mb-4">Submissoes Recentes</h2>
          {submissionRows.length > 0 ? (
            <div class="space-y-2">
              {submissions.map((s) => {
                const form = forms.find((f) => f.id === s.formId);
                const nameField = form?.fields.find((f) => f.mapsTo?.entity === "client" && f.mapsTo?.field === "name");
                const clientName = nameField ? s.data[nameField.id] ?? "—" : "—";
                return (
                  <div key={s.id} class="flex items-center justify-between border-b border-gray-100 py-3">
                    <div class="flex-1">
                      <div class="text-sm font-medium">{clientName}</div>
                      <div class="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString("pt-BR")}</div>
                    </div>
                    <div class="flex items-center gap-3">
                      <Badge color={s.status === "new" ? "blue" : s.status === "converted" ? "green" : "gray"}>
                        {s.status}
                      </Badge>
                      {s.status === "new" && (
                        <form method="post" action={`/intake/${s.id}/convert`} class="inline">
                          <button type="submit" class="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded">
                            Converter
                          </button>
                        </form>
                      )}
                      <a href={`/intake/${s.id}`} class="text-sm text-terracota-600 hover:underline">Ver</a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p class="text-gray-500 text-sm">Nenhuma submissao ainda.</p>
          )}
        </Panel>
      </div>
    </>,
  );
});

// GET /new — create a new form.
intakeAdminRoutes.get("/new", async (c) => {
  const flash = getFlash(c);

  const fieldTypes: { value: FieldType; label: string }[] = [
    { value: "text", label: "Texto" },
    { value: "textarea", label: "Texto longo" },
    { value: "email", label: "E-mail" },
    { value: "phone", label: "Telefone" },
    { value: "cpf", label: "CPF" },
    { value: "cnpj", label: "CNPJ" },
    { value: "number", label: "Numero" },
    { value: "date", label: "Data" },
    { value: "select", label: "Lista de opcoes" },
    { value: "checkbox", label: "Checkbox" },
  ];

  const mapTargets = [
    { value: "", label: "Nenhum" },
    { value: "client:name", label: "Cliente > Nome" },
    { value: "client:cpf", label: "Cliente > CPF" },
    { value: "client:cnpj", label: "Cliente > CNPJ" },
    { value: "client:email", label: "Cliente > E-mail" },
    { value: "client:phone", label: "Cliente > Telefone" },
    { value: "client:address", label: "Cliente > Endereco" },
    { value: "case:title", label: "Caso > Titulo" },
    { value: "case:case_number", label: "Caso > Numero" },
  ];

  // Precompute the add-field script as a plain string (avoids JSX parsing issues).
  const fieldTypeOptions = fieldTypes.map((t) => `<option value="${t.value}">${t.label}</option>`).join("");
  const mapTargetOptions = mapTargets.map((m) => `<option value="${m.value}">${m.label}</option>`).join("");
  const addFieldScript = `
    document.getElementById('add-field').addEventListener('click', function() {
      var container = document.getElementById('fields-container');
      var count = container.children.length + 1;
      var row = document.createElement('div');
      row.className = 'field-row border border-gray-200 rounded-lg p-4 space-y-3';
      row.innerHTML =
        '<div class="flex items-center justify-between">' +
          '<span class="text-sm font-medium">Campo ' + count + '</span>' +
          '<button type="button" onclick="this.closest(\\'.field-row\\').remove()" class="text-red-500 text-sm">Remover</button>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="block text-xs text-gray-600 mb-1">Rotulo</label><input type="text" name="field_label[]" required placeholder="Rotulo do campo" class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded" /></div>' +
          '<div><label class="block text-xs text-gray-600 mb-1">Tipo</label><select name="field_type[]" class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded">${fieldTypeOptions}</select></div>' +
          '<div><label class="block text-xs text-gray-600 mb-1">Placeholder (opcional)</label><input type="text" name="field_placeholder[]" class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded" /></div>' +
          '<div><label class="block text-xs text-gray-600 mb-1">Mapear para</label><select name="field_maps_to[]" class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded">${mapTargetOptions}</select></div>' +
          '<div class="flex items-center gap-2"><input type="checkbox" name="field_required[]" value="1" class="w-4 h-4" /><label class="text-sm">Obrigatorio</label></div>' +
        '</div>';
      container.appendChild(row);
    });
  `;

  return renderPage(
    c,
    { title: "Novo Formulario de Intake", active: "intake" },
    <>
      {flash && (
        <div class={`fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg ${flash.type === "success" ? "bg-green-600" : flash.type === "error" ? "bg-red-600" : "bg-blue-600"} text-white`}>
          {flash.message}
        </div>
      )}

      <PageHeader title="Novo Formulario de Intake" icon="ph-clipboard-text" />

      <form method="post" class="space-y-6 max-w-3xl">
        <Panel>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Titulo do formulario</label>
              <input type="text" name="title" required placeholder="Ex: Intake de Novos Clientes"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-terracota-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
              <textarea name="description" {...{ rows: 2 }} placeholder="Breve descricao mostrada no formulario"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-terracota-500"></textarea>
            </div>
          </div>
        </Panel>

        <Panel>
          <h2 class="text-lg font-semibold mb-4">Campos do Formulario</h2>
          <div id="fields-container" class="space-y-4">
            {/* Default fields */}
            <div class="field-row border border-gray-200 rounded-lg p-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Campo 1</span>
                <button type="button" onclick="this.closest('.field-row').remove()" class="text-red-500 text-sm">Remover</button>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Rotulo</label>
                  <input type="text" name="field_label[]" required placeholder="Nome completo"
                    class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded" />
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Tipo</label>
                  <select name="field_type[]" class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded">
                    {fieldTypes.map((t) => <option value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Placeholder (opcional)</label>
                  <input type="text" name="field_placeholder[]" placeholder="Ex: Digite seu nome"
                    class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded" />
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Mapear para</label>
                  <select name="field_maps_to[]" class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded">
                    {mapTargets.map((m) => <option value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div class="flex items-center gap-2">
                  <input type="checkbox" name="field_required[]" value="1" checked class="w-4 h-4" />
                  <label class="text-sm">Obrigatorio</label>
                </div>
              </div>
            </div>
          </div>

          <button type="button" id="add-field" class="mt-4 text-sm text-terracota-600 hover:underline">
            + Adicionar campo
          </button>

          <script {...{ type: "application/javascript" }} dangerouslySetInnerHTML={{ __html: addFieldScript }} />
        </Panel>

        <div class="flex justify-end">
          <button type="submit" class="bg-terracota-600 hover:bg-terracota-700 text-white px-6 py-2 rounded-lg font-medium">
            Criar Formulario
          </button>
        </div>
      </form>
    </>,
  );
});

// POST /new — create form.
intakeAdminRoutes.post("/new", async (c) => {
  const user = c.get("user");
  const body = await c.req.formData();

  const title = body.get("title") as string;
  const description = body.get("description") as string ?? "";

  const labels = body.getAll("field_label[]") as string[];
  const types = body.getAll("field_type[]") as string[];
  const placeholders = body.getAll("field_placeholder[]") as string[];
  const mapsTo = body.getAll("field_maps_to[]") as string[];
  const required = body.getAll("field_required[]") as string[];

  const fields: IntakeField[] = labels.map((label, i) => {
    const mapsToValue = mapsTo[i] ?? "";
    let mapsToObj: IntakeField["mapsTo"] | undefined;
    if (mapsToValue) {
      const [entity, field] = mapsToValue.split(":");
      if (entity && field) {
        mapsToObj = { entity: entity as "client" | "case" | "lead", field };
      }
    }

    return {
      id: `field_${i + 1}`,
      type: types[i] as FieldType,
      label,
      placeholder: placeholders[i] || undefined,
      required: required[i] === "1",
      mapsTo: mapsToObj,
    };
  });

  const form = await createIntakeForm(user.tenantId, title, description, fields);

  if (form) {
    setFlash(c, "success", "Formulario criado com sucesso!");
  } else {
    setFlash(c, "error", "Erro ao criar formulario.");
  }

  return c.redirect("/intake");
});

// GET /:id — view a submission.
intakeAdminRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: submission } = await supabase
    .from("intake_submissions")
    .select("id, form_id, data, status, created_at, client_id, case_id")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .maybeSingle();

  if (!submission) {
    return c.redirect("/intake");
  }

  const { data: form } = await supabase
    .from("intake_forms")
    .select("title, fields")
    .eq("id", submission.form_id)
    .maybeSingle();

  const fields: IntakeField[] = form ? (typeof form.fields === "string" ? JSON.parse(form.fields) : form.fields) : [];
  const data: Record<string, string> = typeof submission.data === "string" ? JSON.parse(submission.data) : submission.data;

  return renderPage(
    c,
    { title: "Submissao de Intake", active: "intake" },
    <>
      <PageHeader title="Detalhes da Submissao" icon="ph-clipboard-text" />

      <Panel>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm text-gray-500">Formulario: {form?.title ?? "—"}</div>
              <div class="text-xs text-gray-400">{new Date(submission.created_at).toLocaleString("pt-BR")}</div>
            </div>
            <Badge color={submission.status === "new" ? "blue" : submission.status === "converted" ? "green" : "gray"}>
              {submission.status}
            </Badge>
          </div>

          <div class="border-t border-gray-100 pt-4">
            <dl class="space-y-3">
              {fields.map((field) => (
                <div key={field.id}>
                  <dt class="text-sm font-medium text-gray-700">{field.label}</dt>
                  <dd class="text-sm text-gray-600 mt-0.5">{data[field.id] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          {submission.status === "new" && (
            <form method="post" action={`/intake/${id}/convert`}>
              <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Converter em Cliente/Caso
              </button>
            </form>
          )}

          {submission.status === "converted" && submission.client_id && (
            <div class="text-sm">
              <a href={`/clients/${submission.client_id}`} class="text-terracota-600 hover:underline">
                Ver cliente criado →
              </a>
              {submission.case_id && (
                <>
                  <br />
                  <a href={`/cases/${submission.case_id}`} class="text-terracota-600 hover:underline">
                    Ver caso criado →
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </Panel>
    </>,
  );
});

// POST /:id/convert — convert a submission into a client/case.
intakeAdminRoutes.post("/:id/convert", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await convertSubmission(id, user.tenantId);

  if (result.error) {
    setFlash(c, "error", `Erro ao converter: ${result.error}`);
  } else if (result.clientId) {
    setFlash(c, "success", `Cliente criado!${result.caseId ? " Caso tambem criado." : ""}`);
  } else {
    setFlash(c, "warning", "Submissao convertida, mas nenhum cliente foi criado (dados insuficientes).");
  }

  return c.redirect(`/intake/${id}`);
});
