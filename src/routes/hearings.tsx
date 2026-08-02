import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

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
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";
  const period = c.req.query("period") ?? "upcoming";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;
  if (period && period !== "upcoming") queryParams.period = period;

  let query = supabase
    .from("hearings")
    .select("id, date, location, notes, case_id, cases(title)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("date", { ascending: true });

  if (period !== "all") {
    query = query.gte("date", new Date().toISOString());
  }

  if (search) {
    query = query.or(`location.ilike.%${search}%,notes.ilike.%${search}%`);
  }

  query = query.range(offset, offset + limit - 1);

  const [hearingsRes, casesRes] = await Promise.all([
    query,
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const hearings = hearingsRes.data;
  const count = hearingsRes.count;
  const totalPages = count ? Math.ceil(count / limit) : 1;
  const caseOptions = (casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }));

  const rows = (hearings ?? []).map((h) => [
    <a href={`/hearings/${h.id}`} class="text-terracota-600 hover:underline">{(h.cases as unknown as { title: string } | null)?.title ?? "-"}</a> as unknown as string,
    <a href={`/hearings/${h.id}`} class="text-terracota-600 hover:underline">{new Date(h.date).toLocaleString("pt-BR")}</a> as unknown as string,
    h.location ?? "-",
    <div class="flex items-center gap-2">
      <a href={`/hearings/${h.id}`} class="text-terracota-600 hover:underline text-body-sm">Ver</a>
      <a href={`/hearings/${h.id}`} class="text-terracota-600 hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/hearings/${h.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm">Excluir</button></form>
    </div> as unknown as string,
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
          <ComboBox label="Processo" id="case_id" name="case_id" required
            options={caseOptions}
          />
          <TextField label="Data e hora" id="date" name="date" type="datetime-local" required />
          <TextField label="Local" id="location" name="location" placeholder="Sala, vara, endereco..." />
          <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
        </Modal>
      )} />
      <form method="get" action="/hearings" class="mb-4 flex gap-4 items-end">
        <TextField
          label="Buscar"
          id="search"
          name="search"
          type="text"
          value={search}
          placeholder="Local ou observacoes..."
          icon="ph-magnifying-glass"
        />
        <Select
          label="Periodo"
          id="period"
          name="period"
          options={[
            { value: "upcoming", label: "Agendadas" },
            { value: "all", label: "Todas" },
          ]}
          selected={period}
        />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[{ label: "Processo" }, { label: "Data" }, { label: "Local" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhuma audiencia agendada."
        emptyIcon="ph-gavel"
        ariaLabel="Lista de audiencias"
        count={count ?? 0}
        countLabel="audiencia(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/hearings",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
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

function formatGoogleCalendarDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatOutlookCalendarDate(isoDate: string): string {
  return new Date(isoDate).toISOString().replace(/\.\d{3}Z$/, "");
}

function buildGoogleCalendarUrl(params: {
  title: string;
  start: string;
  end: string;
  description: string;
  location: string;
}): string {
  const dates = `${formatGoogleCalendarDate(params.start)}/${formatGoogleCalendarDate(params.end)}`;
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(params.title)}` +
    `&dates=${dates}` +
    `&details=${encodeURIComponent(params.description)}` +
    `&location=${encodeURIComponent(params.location)}`
  );
}

function buildOutlookCalendarUrl(params: {
  title: string;
  start: string;
  end: string;
  description: string;
  location: string;
}): string {
  return (
    "https://outlook.live.com/calendar/0/deeplink/compose" +
    `?subject=${encodeURIComponent(params.title)}` +
    `&startdt=${formatOutlookCalendarDate(params.start)}` +
    `&enddt=${formatOutlookCalendarDate(params.end)}` +
    `&body=${encodeURIComponent(params.description)}` +
    `&location=${encodeURIComponent(params.location)}`
  );
}

// GET /hearings/:id -- detail.
hearingsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: hearing } = await supabase
    .from("hearings")
    .select("*, cases(title, case_number)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!hearing) {
    return c.html("Audiencia nao encontrada.", 404);
  }

  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");

  const caseOptions = (cases ?? []).map((cs) => ({ value: cs.id, label: cs.title }));
  const linkedCase = hearing.cases as unknown as { title: string; case_number: string | null } | null;
  const hearingDate = new Date(hearing.date);
  const isPast = hearingDate.getTime() < Date.now();

  return renderPage(
    c,
    { title: "Audiencia", active: "hearings" },
    <>
      <PageHeader
        title={linkedCase?.title ?? "Audiencia"}
        icon="ph-gavel"
        actions={() => (
          <div class="flex gap-2">
            <Modal
              id="editHearing"
              title="Editar Audiencia"
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/hearings/${hearing.id}`}
              submitLabel="Salvar Alteracoes"
              large
            >
              <ComboBox label="Processo" id="case_id" name="case_id" required
                options={caseOptions}
                selected={hearing.case_id}
              />
              <TextField
                label="Data e hora"
                id="date"
                name="date"
                type="datetime-local"
                required
                value={new Date(hearing.date).toISOString().slice(0, 16)}
              />
              <TextField label="Local" id="location" name="location" value={hearing.location ?? ""} placeholder="Sala, vara, endereco..." />
              <Textarea label="Observacoes" id="notes" name="notes" rows={3}>
                {hearing.notes ?? ""}
              </Textarea>
            </Modal>
            <form method="post" action={`/hearings/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta audiencia?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados da audiencia" icon="ph-gavel">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Data: </dt><dd class="inline">{hearingDate.toLocaleString("pt-BR")}</dd></div>
            <div>
              <dt class="font-semibold text-gray-700 inline">Status: </dt>
              <dd class="inline">
                <Badge color={isPast ? "gray" : "green"}>{isPast ? "Realizada" : "Agendada"}</Badge>
              </dd>
            </div>
            {hearing.location ? <div><dt class="font-semibold text-gray-700 inline">Local: </dt><dd class="inline">{hearing.location}</dd></div> : null}
            {linkedCase ? (
              <div>
                <dt class="font-semibold text-gray-700 inline">Processo: </dt>
                <dd class="inline">
                  <a href={`/cases/${hearing.case_id}`} class="text-terracota-600 hover:underline">{linkedCase.title}</a>
                  {linkedCase.case_number ? <span class="text-gray-500"> ({linkedCase.case_number})</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </Panel>
        {hearing.notes ? (
          <Panel title="Observacoes" icon="ph-note">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{hearing.notes}</p>
          </Panel>
        ) : null}
      </div>
      {(() => {
        const eventTitle = `Audiencia - ${linkedCase?.title ?? "Sem processo"}`;
        const startIso = hearing.date;
        const endIso = new Date(new Date(hearing.date).getTime() + 60 * 60 * 1000).toISOString();
        const description = hearing.notes ?? "";
        const location = hearing.location ?? "";
        const googleUrl = buildGoogleCalendarUrl({ title: eventTitle, start: startIso, end: endIso, description, location });
        const outlookUrl = buildOutlookCalendarUrl({ title: eventTitle, start: startIso, end: endIso, description, location });
        return (
          <Panel title="Adicionar ao calendario" icon="ph-calendar-plus">
            <div class="flex flex-wrap gap-2">
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-google-logo" aria-hidden="true"></i>Adicionar ao Google Agenda
              </a>
              <a href={outlookUrl} target="_blank" rel="noopener noreferrer" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-microsoft-outlook-logo" aria-hidden="true"></i>Adicionar ao Outlook Agenda
              </a>
            </div>
          </Panel>
        );
      })()}
    </>,
  );
});

// POST /hearings/:id -- update.
hearingsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = hearingSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/hearings/${id}`);
  }

  await supabase
    .from("hearings")
    .update({
      case_id: parsed.data.case_id,
      date: new Date(parsed.data.date).toISOString(),
      location: parsed.data.location || null,
      notes: parsed.data.notes || null,
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/hearings/${id}`);
});

hearingsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("hearings").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/hearings");
});
