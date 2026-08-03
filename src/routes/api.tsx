// Public API v1 — REST endpoints for external integrations.
// Authentication: Bearer token (API key).
// PragmaOS 2.

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { z } from "zod";

import { apiKeyAuth, requireScope } from "../lib/api-auth";
import { supabase } from "../lib/supabase";

export const apiRoutes = new Hono<AppEnv>();

// All API routes require API key auth
apiRoutes.use("*", apiKeyAuth);

// ============================================================
// Cases
// ============================================================

// GET /api/v1/cases — list cases
apiRoutes.get("/v1/cases", requireScope("cases:read"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const { data, count } = await supabase
    .from("cases")
    .select("id, title, case_number, status, case_type, created_at, updated_at, clients(name)", { count: "exact" })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return c.json({ data: data ?? [], total: count ?? 0, limit, offset });
});

// GET /api/v1/cases/:id — get case by ID
apiRoutes.get("/v1/cases/:id", requireScope("cases:read"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const id = c.req.param("id");

  const { data } = await supabase
    .from("cases")
    .select("*, clients(name), proceedings(*), deadlines(*)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .single();

  if (!data) return c.json({ error: "Case not found" }, 404);
  return c.json({ data });
});

// ============================================================
// Clients
// ============================================================

// GET /api/v1/clients — list clients
apiRoutes.get("/v1/clients", requireScope("clients:read"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const { data, count } = await supabase
    .from("clients")
    .select("id, name, client_type, email, phone, created_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name")
    .range(offset, offset + limit - 1);

  return c.json({ data: data ?? [], total: count ?? 0, limit, offset });
});

// POST /api/v1/clients — create client
const createClientSchema = z.object({
  name: z.string().min(1, "name is required"),
  client_type: z.enum(["individual", "company"]).optional().default("individual"),
  cpf: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  email: z.string().email("invalid email").optional().nullable(),
  phone: z.string().optional().nullable(),
});

apiRoutes.post("/v1/clients", requireScope("clients:write"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: "Invalid JSON body" }, 400);

  const parsed = createClientSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      client_type: parsed.data.client_type,
      cpf: parsed.data.cpf ?? null,
      cnpj: parsed.data.cnpj ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
    })
    .select("id, name")
    .single();

  if (error) return c.json({ error: "Failed to create client" }, 500);
  return c.json({ data }, 201);
});

// ============================================================
// Deadlines
// ============================================================

// GET /api/v1/deadlines — list deadlines
apiRoutes.get("/v1/deadlines", requireScope("deadlines:read"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);

  const { data } = await supabase
    .from("deadlines")
    .select("id, title, due_date, priority, cases(title)")
    .eq("tenant_id", tenantId)
    .order("due_date", { ascending: true })
    .limit(limit);

  return c.json({ data: data ?? [] });
});

// POST /api/v1/deadlines — create deadline
const createDeadlineSchema = z.object({
  title: z.string().min(1, "title is required"),
  due_date: z.string().min(1, "due_date is required"),
  priority: z.number().min(1).max(5).optional().default(3),
  case_id: z.string().uuid().optional().nullable(),
});

apiRoutes.post("/v1/deadlines", requireScope("deadlines:write"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: "Invalid JSON body" }, 400);

  const parsed = createDeadlineSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const { data, error } = await supabase
    .from("deadlines")
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      due_date: parsed.data.due_date,
      priority: parsed.data.priority,
      case_id: parsed.data.case_id ?? null,
    })
    .select("id, title, due_date")
    .single();

  if (error) return c.json({ error: "Failed to create deadline" }, 500);
  return c.json({ data }, 201);
});

// ============================================================
// Invoices
// ============================================================

// GET /api/v1/invoices — list invoices
apiRoutes.get("/v1/invoices", requireScope("invoices:read"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);

  const { data } = await supabase
    .from("invoices")
    .select("id, number, amount_cents, status, issued_at, due_date, clients(name)")
    .eq("tenant_id", tenantId)
    .order("issued_at", { ascending: false })
    .limit(limit);

  return c.json({ data: data ?? [] });
});

// ============================================================
// Webhooks
// ============================================================

// POST /api/v1/webhooks/test — trigger a test webhook
apiRoutes.post("/v1/webhooks/test", requireScope("webhooks:write"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const { data: webhooks } = await supabase
    .from("webhooks")
    .select("id, url, secret")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  const results: { url: string; status: number; success: boolean }[] = [];

  for (const w of webhooks ?? []) {
    try {
      const payload = {
        event: "test",
        timestamp: new Date().toISOString(),
        data: { message: "Test webhook from PragmaOS API" },
      };
      const response = await fetch(w.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PragmaOS-Signature": w.secret ?? "",
        },
        body: JSON.stringify(payload),
      });
      results.push({ url: w.url, status: response.status, success: response.ok });
    } catch (err) {
      results.push({ url: w.url, status: 0, success: false });
    }
  }

  return c.json({ results });
});

// ============================================================
// Browser Extension (PJe capture)
// ============================================================

// POST /api/v1/extension/capture — receive captured data from the PJe browser extension.
// The extension scrapes case movements, documents, and metadata from PJe pages
// and sends them here for ingestion.
apiRoutes.post("/v1/extension/capture", requireScope("cases:write"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const body = await c.req.json().catch(() => null);

  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { case_number, source, movements, documents } = body as {
    case_number?: string;
    source?: string;
    movements?: { date: string; description: string; content?: string }[];
    documents?: { title: string; url: string; type?: string }[];
  };

  if (!case_number) {
    return c.json({ error: "case_number is required" }, 400);
  }

  // Find the case by CNJ number.
  const { data: caseRecord } = await supabase
    .from("cases")
    .select("id")
    .eq("tenant_id", tenantId)
    .or(`case_number.eq.${case_number},cnj_number.eq.${case_number}`)
    .maybeSingle();

  if (!caseRecord) {
    return c.json({ error: "Case not found. Import the case first or create it with the matching CNJ number." }, 404);
  }

  const results: { movements: number; documents: number; errors: string[] } = {
    movements: 0,
    documents: 0,
    errors: [],
  };

  // Insert movements.
  if (movements && Array.isArray(movements)) {
    for (const m of movements) {
      const { error } = await supabase
        .from("case_movements")
        .insert({
          tenant_id: tenantId,
          case_id: caseRecord.id,
          date: m.date,
          title: m.description.slice(0, 200),
          content: m.content ?? null,
          source: source ?? "pje_extension",
        });

      if (error) {
        console.error("[api] movement insert failed", { date: m.date, error: error.message });
        results.errors.push(`Movement ${m.date}: failed to insert`);
      } else {
        results.movements++;
      }
    }
  }

  // Insert documents (as records — the actual file would need to be uploaded separately).
  if (documents && Array.isArray(documents)) {
    for (const doc of documents) {
      const { error } = await supabase
        .from("documents")
        .insert({
          tenant_id: tenantId,
          case_id: caseRecord.id,
          title: doc.title,
          doc_type: doc.type ?? "outro",
          storage_path: doc.url, // URL from PJe
          source: "pje_extension",
        });

      if (error) {
        console.error("[api] document insert failed", { title: doc.title, error: error.message });
        results.errors.push(`Document ${doc.title}: failed to insert`);
      } else {
        results.documents++;
      }
    }
  }

  return c.json({
    success: true,
    case_id: caseRecord.id,
    captured: results,
  });
});

// GET /api/v1/extension/cases — search cases by CNJ (for the extension popup).
apiRoutes.get("/v1/extension/cases", requireScope("cases:read"), async (c) => {
  const tenantId = c.get("apiTenantId") as string;
  const q = c.req.query("q") ?? "";

  if (q.length < 2) {
    return c.json({ cases: [] });
  }

  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, case_number, status")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .or(`title.ilike.%${q}%,case_number.ilike.%${q}%`)
    .limit(10);

  return c.json({ cases: cases ?? [] });
});
