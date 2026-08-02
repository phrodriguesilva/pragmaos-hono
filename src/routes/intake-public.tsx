import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { getIntakeFormBySlug, submitIntakeForm, type IntakeField } from "../lib/intake";
import { setFlash } from "../lib/flash";

// Public routes (no auth required).
export const intakePublicRoutes = new Hono<AppEnv>();

// GET /f/:slug — public form rendering.
intakePublicRoutes.get("/f/:slug", async (c) => {
  const slug = c.req.param("slug");
  const form = await getIntakeFormBySlug(slug);

  if (!form) {
    return c.html(
      `<html><body style="font-family: sans-serif; text-align: center; padding: 4rem;">
        <h1>Formulario nao encontrado</h1>
        <p>O formulario que voce procura nao existe ou foi desativado.</p>
      </body></html>`,
      404,
    );
  }

  const flashCookie = c.req.header("cookie") ?? "";
  const flashMatch = flashCookie.match(/flash-msg=([^;]+)/);
  let flash: { type: string; message: string } | null = null;
  if (flashMatch) {
    try {
      flash = JSON.parse(decodeURIComponent(flashMatch[1]!));
    } catch {
      flash = null;
    }
  }

  function renderField(field: IntakeField): string {
    const required = field.required ? "required" : "";
    const requiredMark = field.required ? ' <span style="color: red;">*</span>' : "";
    const placeholder = field.placeholder ? `placeholder="${field.placeholder}"` : "";

    let input: string;
    switch (field.type) {
      case "textarea":
        input = `<textarea name="${field.id}" ${required} ${placeholder} rows="3" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"></textarea>`;
        break;
      case "select":
        const options = (field.options ?? []).map((opt) => `<option value="${opt}">${opt}</option>`).join("");
        input = `<select name="${field.id}" ${required} style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"><option value="">Selecione...</option>${options}</select>`;
        break;
      case "checkbox":
        input = `<input type="checkbox" name="${field.id}" value="1" ${required} style="width: 1rem; height: 1rem;" />`;
        break;
      case "date":
        input = `<input type="date" name="${field.id}" ${required} style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;" />`;
        break;
      case "number":
        input = `<input type="number" name="${field.id}" ${required} ${placeholder} style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;" />`;
        break;
      case "email":
        input = `<input type="email" name="${field.id}" ${required} ${placeholder} style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;" />`;
        break;
      case "phone":
        input = `<input type="tel" name="${field.id}" ${required} ${placeholder} style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;" />`;
        break;
      case "cpf":
        input = `<input type="text" name="${field.id}" ${required} ${placeholder} pattern="[0-9]{3}\\.[0-9]{3}\\.[0-9]{3}-[0-9]{2}" placeholder="000.000.000-00" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;" />`;
        break;
      case "cnpj":
        input = `<input type="text" name="${field.id}" ${required} ${placeholder} pattern="[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2}" placeholder="00.000.000/0000-00" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;" />`;
        break;
      default:
        input = `<input type="text" name="${field.id}" ${required} ${placeholder} style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;" />`;
    }

    const helpText = field.help ? `<div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">${field.help}</div>` : "";

    return `
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem;">
          ${field.label}${requiredMark}
        </label>
        ${input}
        ${helpText}
      </div>
    `;
  }

  const fieldsHtml = form.fields.map(renderField).join("");

  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${form.title}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f4f6; margin: 0; padding: 2rem; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 0.75rem; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { font-size: 1.5rem; color: #1f2937; margin: 0 0 0.5rem; }
        .description { color: #6b7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
        .flash { padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
        .flash.success { background: #d1fae5; color: #065f46; }
        .flash.error { background: #fee2e2; color: #991b1b; }
        button { background: #05111e; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; cursor: pointer; width: 100%; }
        button:hover { background: #1a2634; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${form.title}</h1>
        ${form.description ? `<p class="description">${form.description}</p>` : ""}
        ${flash ? `<div class="flash ${flash.type}">${flash.message}</div>` : ""}
        <form method="post">
          ${fieldsHtml}
          <button type="submit">Enviar</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// POST /f/:slug — submit form.
intakePublicRoutes.post("/f/:slug", async (c) => {
  const slug = c.req.param("slug");
  const form = await getIntakeFormBySlug(slug);

  if (!form) {
    return c.html("<h1>Formulario nao encontrado</h1>", 404);
  }

  const body = await c.req.formData();
  const data: Record<string, string> = {};

  for (const field of form.fields) {
    const value = body.get(field.id);
    if (value !== null) {
      data[field.id] = value as string;
    }
  }

  // Validate required fields.
  for (const field of form.fields) {
    if (field.required && !data[field.id]) {
      setFlash(c, "error", `Campo "${field.label}" e obrigatorio.`);
      return c.redirect(`/intake/f/${slug}`);
    }
  }

  const result = await submitIntakeForm(form.id, form.tenantId, data);

  if (result.submissionId) {
    setFlash(c, "success", "Formulario enviado com sucesso! Entraremos em contato em breve.");
  } else {
    setFlash(c, "error", `Erro ao enviar: ${result.error ?? "erro desconhecido"}`);
  }

  return c.redirect(`/intake/f/${slug}`);
});
