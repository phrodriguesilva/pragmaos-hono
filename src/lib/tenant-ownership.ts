// Tenant ownership validation helpers.
// Prevents IDOR (Insecure Direct Object Reference) attacks by verifying
// that a referenced entity (case, client, etc.) belongs to the tenant
// before allowing it to be used in a write operation.

import { supabase } from "./supabase";

/**
 * Verifies that a case belongs to the given tenant.
 * Returns true if the case exists and belongs to the tenant.
 */
export async function caseBelongsToTenant(caseId: string, tenantId: string): Promise<boolean> {
  if (!caseId || !tenantId) return false;
  const { data } = await supabase
    .from("cases")
    .select("id")
    .eq("id", caseId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

/**
 * Verifies that a client belongs to the given tenant.
 */
export async function clientBelongsToTenant(clientId: string, tenantId: string): Promise<boolean> {
  if (!clientId || !tenantId) return false;
  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

/**
 * Verifies that a proceeding belongs to the given tenant.
 */
export async function proceedingBelongsToTenant(proceedingId: string, tenantId: string): Promise<boolean> {
  if (!proceedingId || !tenantId) return false;
  const { data } = await supabase
    .from("proceedings")
    .select("id")
    .eq("id", proceedingId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

/**
 * Verifies that a document belongs to the given tenant.
 */
export async function documentBelongsToTenant(documentId: string, tenantId: string): Promise<boolean> {
  if (!documentId || !tenantId) return false;
  const { data } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

/**
 * Verifies that a task belongs to the given tenant.
 */
export async function taskBelongsToTenant(taskId: string, tenantId: string): Promise<boolean> {
  if (!taskId || !tenantId) return false;
  const { data } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

/**
 * Verifies that a profile (user) belongs to the given tenant.
 */
export async function profileBelongsToTenant(userId: string, tenantId: string): Promise<boolean> {
  if (!userId || !tenantId) return false;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

/**
 * Verifies that an honorario belongs to the given tenant.
 */
export async function honorarioBelongsToTenant(honorarioId: string, tenantId: string): Promise<boolean> {
  if (!honorarioId || !tenantId) return false;
  const { data } = await supabase
    .from("honorarios")
    .select("id")
    .eq("id", honorarioId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}
