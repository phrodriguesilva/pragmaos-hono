import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Modal } from "../components/ui";

export const hearingsRoutes = new Hono<AppEnv>();

hearingsRoutes.use("*", requireAuth);

const hearingSchema = z.object({
  case_id: z.string().uuid("Processo invalido"),
  date: z.string().min(1, "Data e obrigatoria"),
  location: z.string().optional(),
  notes: z.string().optional(),
});

hearingsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [hearingsRes, casesRes] = await Promise.all([
    supabase
      .from("hearings")
      .select("id, date, location, notes, case_id, cases(title)")
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null)
      .gte("date", new Date().toISOString())
      .order("date", { ascending: true }),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const hearings = hearingsRes.data;
  const caseOptions = (casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }));

  const rows = (hearings ?? []).map((h) => [
    <a href={`/cases/${h.case_id}`} class="text-terracota-600 hover:underline">{(h.cases as unknown as { title: string } | null)?.title ?? "-"}</a> as unknown as string,
    new Date(h.date).toLocaleString("pt-BR"),
    h.location ?? "-",
  ]);

  return renderPage(
    c,
    { title: "Audiencias", active: "hearings" },
    <>
      <PageHeader title="Audiencias" icon="ph-gavel" actions={() => (
        <Modal
          id="new-hearing"
          title="Nova Audiencia"
          icon="ph-gavel"
          triggerText="Nova Audiencia"
          triggerIcon="ph-plus"
          action="/hearings"
          large
        >
          <Select label="Processo" id="case_id" name="case_id" required
            options={caseOptions}
          />
          <TextField label="Data e hora" id="date" name="date" type="datetime-local" required />
          <TextField label="Local" id="location" name="location" placeholder="Sala, vara, endereco..." />
          <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
        </Modal>
      )} />
      <Table
        columns={[{ label: "Processo" }, { label: "Data" }, { label: "Local" }]}
        rows={rows}
        emptyMsg="Nenhuma audiencia agendada."
        emptyIcon="ph-gavel"
        ariaLabel="Lista de audiencias"
      />
    </>,
  );
});

hearingsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = hearingSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/hearings");

  await supabase.from("hearings").insert({
    tenant_id: user.tenantId,
    case_id: parsed.data.case_id,
    date: new Date(parsed.data.date).toISOString(),
    location: parsed.data.location || null,
    notes: parsed.data.notes || null,
  });

  return c.redirect("/hearings");
});

hearingsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("hearings").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/hearings");
});
