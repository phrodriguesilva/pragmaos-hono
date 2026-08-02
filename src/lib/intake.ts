// Dynamic intake forms — public forms that clients fill out to provide
// initial information. The form fields are configurable per tenant.
// Submissions create leads or clients automatically.
//
// PragmaOS 2.

import { supabase } from "./supabase";
import { log } from "./logger";

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "email" | "phone" | "cpf" | "cnpj";

export interface IntakeField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // for select fields
  help?: string;
  // Mapping: which entity/field this form field maps to.
  mapsTo?: {
    entity: "client" | "case" | "lead";
    field: string; // e.g., "name", "cpf", "case_title"
  };
}

export interface IntakeForm {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  fields: IntakeField[];
  isActive: boolean;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeSubmission {
  id: string;
  formId: string;
  tenantId: string;
  data: Record<string, string>;
  status: "new" | "reviewed" | "converted";
  createdAt: string;
  // When converted, links to created entities.
  clientId?: string;
  caseId?: string;
  leadId?: string;
}

// Create a new intake form.
export async function createIntakeForm(
  tenantId: string,
  title: string,
  description: string,
  fields: IntakeField[],
): Promise<IntakeForm | null> {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const { data, error } = await supabase
    .from("intake_forms")
    .insert({
      tenant_id: tenantId,
      title,
      description,
      fields: JSON.stringify(fields),
      is_active: true,
      slug,
    })
    .select("id, tenant_id, title, description, fields, is_active, slug, created_at, updated_at")
    .single();

  if (error) {
    log.error("Failed to create intake form", { tenantId, error: error.message });
    return null;
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    title: data.title,
    description: data.description,
    fields: typeof data.fields === "string" ? JSON.parse(data.fields) : data.fields,
    isActive: data.is_active,
    slug: data.slug,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// Get an intake form by slug (for public rendering).
export async function getIntakeFormBySlug(slug: string): Promise<IntakeForm | null> {
  const { data, error } = await supabase
    .from("intake_forms")
    .select("id, tenant_id, title, description, fields, is_active, slug, created_at, updated_at")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    title: data.title,
    description: data.description,
    fields: typeof data.fields === "string" ? JSON.parse(data.fields) : data.fields,
    isActive: data.is_active,
    slug: data.slug,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// List all intake forms for a tenant.
export async function listIntakeForms(tenantId: string): Promise<IntakeForm[]> {
  const { data } = await supabase
    .from("intake_forms")
    .select("id, tenant_id, title, description, fields, is_active, slug, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((d) => ({
    id: d.id,
    tenantId: d.tenant_id,
    title: d.title,
    description: d.description,
    fields: typeof d.fields === "string" ? JSON.parse(d.fields) : d.fields,
    isActive: d.is_active,
    slug: d.slug,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));
}

// Submit an intake form.
export async function submitIntakeForm(
  formId: string,
  tenantId: string,
  data: Record<string, string>,
): Promise<{ submissionId: string | null; error?: string }> {
  const { data: submission, error } = await supabase
    .from("intake_submissions")
    .insert({
      form_id: formId,
      tenant_id: tenantId,
      data: JSON.stringify(data),
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    log.error("Failed to submit intake form", { tenantId, formId, error: error.message });
    return { submissionId: null, error: error.message };
  }

  log.info("Intake form submitted", { tenantId, formId, submissionId: submission.id });
  return { submissionId: submission.id };
}

// List submissions for a tenant.
export async function listSubmissions(tenantId: string, limit: number = 20): Promise<IntakeSubmission[]> {
  const { data } = await supabase
    .from("intake_submissions")
    .select("id, form_id, tenant_id, data, status, created_at, client_id, case_id, lead_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((d) => ({
    id: d.id,
    formId: d.form_id,
    tenantId: d.tenant_id,
    data: typeof d.data === "string" ? JSON.parse(d.data) : d.data,
    status: d.status,
    createdAt: d.created_at,
    clientId: d.client_id ?? undefined,
    caseId: d.case_id ?? undefined,
    leadId: d.lead_id ?? undefined,
  }));
}

// Convert a submission into a client (and optionally a case).
// Uses the field mappings to extract client/case data.
export async function convertSubmission(
  submissionId: string,
  tenantId: string,
): Promise<{ clientId?: string; caseId?: string; error?: string }> {
  // Fetch the submission and form.
  const { data: submission } = await supabase
    .from("intake_submissions")
    .select("id, form_id, data, status")
    .eq("id", submissionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!submission) {
    return { error: "Submissao nao encontrada" };
  }

  const { data: form } = await supabase
    .from("intake_forms")
    .select("fields")
    .eq("id", submission.form_id)
    .maybeSingle();

  if (!form) {
    return { error: "Formulario nao encontrado" };
  }

  const fields: IntakeField[] = typeof form.fields === "string" ? JSON.parse(form.fields) : form.fields;
  const submissionData: Record<string, string> = typeof submission.data === "string" ? JSON.parse(submission.data) : submission.data;

  // Extract client data from mapped fields.
  const clientData: Record<string, string> = {};
  const caseData: Record<string, string> = {};
  let hasCaseData = false;

  for (const field of fields) {
    const value = submissionData[field.id];
    if (!value || !field.mapsTo) continue;

    if (field.mapsTo.entity === "client") {
      clientData[field.mapsTo.field] = value;
    } else if (field.mapsTo.entity === "case") {
      caseData[field.mapsTo.field] = value;
      hasCaseData = true;
    }
  }

  let clientId: string | undefined;
  let caseId: string | undefined;

  // Create client if we have at least a name.
  if (clientData.name) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        tenant_id: tenantId,
        name: clientData.name,
        cpf: clientData.cpf ?? null,
        cnpj: clientData.cnpj ?? null,
        email: clientData.email ?? null,
        phone: clientData.phone ?? null,
        address: clientData.address ?? null,
      })
      .select("id")
      .single();

    if (clientError) {
      log.error("Failed to create client from intake", { tenantId, error: clientError.message });
      return { error: clientError.message };
    }
    clientId = client.id;
  }

  // Create case if we have case data.
  if (hasCaseData && clientId && caseData.title) {
    const { data: caseRecord, error: caseError } = await supabase
      .from("cases")
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        title: caseData.title,
        case_number: caseData.case_number ?? null,
        status: "active",
      })
      .select("id")
      .single();

    if (caseError) {
      log.error("Failed to create case from intake", { tenantId, error: caseError.message });
    } else {
      caseId = caseRecord.id;
    }
  }

  // Update submission status.
  await supabase
    .from("intake_submissions")
    .update({
      status: "converted",
      client_id: clientId,
      case_id: caseId,
    })
    .eq("id", submissionId)
    .eq("tenant_id", tenantId);

  log.info("Intake submission converted", { tenantId, submissionId, clientId, caseId });

  return { clientId, caseId };
}
