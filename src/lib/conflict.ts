// Conflict of interest checker.
// Verifies if a new/existing client conflicts with parties in other cases.

import { supabase } from "./supabase";

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: {
    type: "client_name" | "client_document" | "party_name" | "party_document";
    matchedName: string;
    matchedDocument?: string;
    caseTitle: string;
    caseId: string;
    partyRole?: string;
  }[];
}

// Check for conflicts when creating/editing a client or case party.
// Checks: client name, CPF/CNPJ against existing clients and case_parties.
export async function checkConflict(
  tenantId: string,
  opts: { name: string; document?: string; excludeClientId?: string }
): Promise<ConflictResult> {
  const conflicts: ConflictResult["conflicts"] = [];
  const nameLower = opts.name.toLowerCase().trim();

  // 1. Check against existing clients (by name)
  const { data: clientsByName } = await supabase
    .from("clients")
    .select("id, name, cpf, cnpj")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .ilike("name", `%${nameLower}%`);

  for (const cl of clientsByName ?? []) {
    if (opts.excludeClientId && cl.id === opts.excludeClientId) continue;
    if (cl.name.toLowerCase().trim() === nameLower) {
      conflicts.push({
        type: "client_name",
        matchedName: cl.name,
        matchedDocument: cl.cpf || cl.cnpj || undefined,
        caseTitle: "Cliente cadastrado",
        caseId: cl.id,
      });
    }
  }

  // 2. Check against existing clients (by document)
  if (opts.document) {
    const doc = opts.document.replace(/\D/g, "");
    if (doc) {
      const { data: clientsByDoc } = await supabase
        .from("clients")
        .select("id, name, cpf, cnpj")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);

      for (const cl of clientsByDoc ?? []) {
        if (opts.excludeClientId && cl.id === opts.excludeClientId) continue;
        const clDoc = (cl.cpf || cl.cnpj || "").replace(/\D/g, "");
        if (clDoc && clDoc === doc) {
          const exists = conflicts.some((c) => c.caseId === cl.id);
          if (!exists) {
            conflicts.push({
              type: "client_document",
              matchedName: cl.name,
              matchedDocument: cl.cpf || cl.cnpj || undefined,
              caseTitle: "Cliente com mesmo documento",
              caseId: cl.id,
            });
          }
        }
      }
    }
  }

  // 3. Check against case_parties (by name)
  const { data: partiesByName } = await supabase
    .from("case_parties")
    .select("id, name, document, role, case_id, cases(title)")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .ilike("name", `%${nameLower}%`);

  for (const p of partiesByName ?? []) {
    if (p.name.toLowerCase().trim() === nameLower) {
      const caseTitle = (p.cases as unknown as { title: string } | null)?.title ?? "Processo";
      conflicts.push({
        type: "party_name",
        matchedName: p.name,
        matchedDocument: p.document || undefined,
        caseTitle,
        caseId: p.case_id,
        partyRole: p.role ?? undefined,
      });
    }
  }

  // 4. Check against case_parties (by document)
  if (opts.document) {
    const doc = opts.document.replace(/\D/g, "");
    if (doc) {
      const { data: partiesByDoc } = await supabase
        .from("case_parties")
        .select("id, name, document, role, case_id, cases(title)")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);

      for (const p of partiesByDoc ?? []) {
        const pDoc = (p.document || "").replace(/\D/g, "");
        if (pDoc && pDoc === doc) {
          const exists = conflicts.some((c) => c.caseId === p.case_id && c.matchedName === p.name);
          if (!exists) {
            const caseTitle = (p.cases as unknown as { title: string } | null)?.title ?? "Processo";
            conflicts.push({
              type: "party_document",
              matchedName: p.name,
              matchedDocument: p.document || undefined,
              caseTitle,
              caseId: p.case_id,
              partyRole: p.role ?? undefined,
            });
          }
        }
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}
