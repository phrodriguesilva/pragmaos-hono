import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { sanitizeILike } from "../lib/search-sanitize";
import { caseBelongsToTenant, clientBelongsToTenant } from "../lib/tenant-ownership";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const honorariosRoutes = new Hono<AppEnv>();

honorariosRoutes.use("*", requireAuth);
honorariosRoutes.use("*", requireRole("socio", "financeiro"));

const honorarioSchema = z.object({
  client_id: z.string().uuid("Cliente invalido").max(36),
  case_id: z.string().max(36).optional(),
  description: z.string().min(1, "Descricao e obrigatoria").max(500),
  type: z.enum(["contratual", "sucumbencial", "exito", "mensalidade", "parcelamento"]),
  amount_cents: z.coerce.number().int().positive("Valor deve ser positivo").max(1e12, "Valor excede o limite maximo"),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]),
  due_date: z.string().max(20).optional(),
  installments: z.coerce.number().int().min(1).max(120).optional(),
  notes: z.string().max(5000).optional(),
});

const TYPE_LABELS: Record<string, string> = {
  contratual: "Contratual",
  sucumbencial: "Sucumbencial",
  exito: "Exito",
  mensalidade: "Mensalidade",
  parcelamento: "Parcelamento",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};

function statusColor(status: string): "green" | "red" | "yellow" | "gray" {
  if (status === "paid") return "green";
  if (status === "overdue") return "red";
  if (status === "cancelled") return "gray";
  return "yellow";
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0] ?? "";
}

// GET /honorarios -- list with summary.
honorariosRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let honorariosQuery = supabase
    .from("honorarios")
    .select("id, description, type, amount_cents, status, due_date, clients(name)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  if (search) honorariosQuery = honorariosQuery.ilike("description", `%${sanitizeILike(search)}%`);

  honorariosQuery = honorariosQuery.range(offset, offset + limit - 1);

  const [honorariosRes, totalsRes, clientsRes, casesRes] = await Promise.all([
    honorariosQuery,
    supabase
      .from("honorarios")
      .select("status, amount_cents")
      .eq("tenant_id", user.tenantId),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const honorarios = honorariosRes.data;
  const count = honorariosRes.count;
  const totalPages = count ? Math.ceil(count / limit) : 1;
  const totals = totalsRes.data;

  const sumByStatus: Record<string, number> = {};
  for (const t of totals ?? []) {
    sumByStatus[t.status] = (sumByStatus[t.status] ?? 0) + t.amount_cents;
  }

  const rows = (honorarios ?? []).map((h) => {
    const clientName = (h.clients as unknown as { name: string } | null)?.name ?? "-";
    return [
      <a href={`/honorarios/${h.id}`} class="text-[#0568ff] hover:underline">{h.description}</a> as unknown as string,
      clientName,
      TYPE_LABELS[h.type] ?? h.type,
      formatCurrency(h.amount_cents),
      formatDate(h.due_date),
      <Badge color={statusColor(h.status)}>{STATUS_LABELS[h.status] ?? h.status}</Badge> as unknown as string,
      <div class="flex items-center gap-2">
        <a href={`/honorarios/${h.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
        <form method="post" action={`/honorarios/${h.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
      </div> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Honorarios", active: "honorarios" },
    <>
      <PageHeader
        title="Honorarios"
        icon="ph-hand-coins"
        actions={() => (
          <Modal id="new-honorario" title="Novo Honorario" icon="ph-hand-coins" triggerText="Novo Honorario" triggerIcon="ph-plus" action="/honorarios" submitLabel="Salvar" large>
            <ComboBox label="Cliente" id="client_id" name="client_id" required
              options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
            />
            <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
              options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
            />
            <TextField label="Descricao" id="description" name="description" required icon="ph-text-aa" placeholder="Descricao do honorario" />
            <div class="grid grid-cols-2 gap-4">
              <Select label="Tipo" id="type" name="type" required
                options={[
                  { value: "contratual", label: "Contratual" },
                  { value: "sucumbencial", label: "Sucumbencial" },
                  { value: "exito", label: "Exito" },
                  { value: "mensalidade", label: "Mensalidade" },
                  { value: "parcelamento", label: "Parcelamento" },
                ]}
              />
              <TextField label="Valor (R$)" id="amount_cents" name="amount_cents" type="number" step="0.01" required placeholder="0,00" />
            </div>
            <div class="grid grid-cols-3 gap-4">
              <Select label="Status" id="status" name="status" required selected="pending"
                options={[
                  { value: "pending", label: "Pendente" },
                  { value: "paid", label: "Pago" },
                  { value: "overdue", label: "Atrasado" },
                  { value: "cancelled", label: "Cancelado" },
                ]}
              />
              <TextField label="Vencimento" id="due_date" name="due_date" type="date" />
              <TextField label="Parcelas" id="installments" name="installments" type="number" value="1" />
            </div>
            <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
          </Modal>
        )}
      />
      <div class="grid grid-cols-4 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-clock text-h3 text-status-yellow" aria-hidden="true"></i>Pendente
          </div>
          <div class="text-h2 font-bold text-status-yellow">{formatCurrency(sumByStatus.pending ?? 0)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-check-circle text-h3 text-status-green" aria-hidden="true"></i>Pago
          </div>
          <div class="text-h2 font-bold text-status-green">{formatCurrency(sumByStatus.paid ?? 0)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-warning text-h3 text-status-red" aria-hidden="true"></i>Atrasado
          </div>
          <div class="text-h2 font-bold text-status-red">{formatCurrency(sumByStatus.overdue ?? 0)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-x-circle text-h3 text-gray-500" aria-hidden="true"></i>Cancelado
          </div>
          <div class="text-h2 font-bold text-gray-500">{formatCurrency(sumByStatus.cancelled ?? 0)}</div>
        </Panel>
      </div>
      <form method="get" action="/honorarios" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Descricao..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Descricao" },
          { label: "Cliente" },
          { label: "Tipo" },
          { label: "Valor" },
          { label: "Vencimento" },
          { label: "Status" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhum honorario encontrado."
        emptyIcon="ph-hand-coins"
        ariaLabel="Lista de honorarios"
        count={count ?? 0}
        countLabel="honorario(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/honorarios",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST /honorarios -- create.
honorariosRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = honorarioSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect("/honorarios");
  }

  if (parsed.data.case_id) {
    const owns = await caseBelongsToTenant(parsed.data.case_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }
  if (parsed.data.client_id) {
    const owns = await clientBelongsToTenant(parsed.data.client_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }

  const rawAmount = (body.amount_cents as string) ?? "0";
  const amountCents = Math.round(Number(rawAmount) * 100);

  const { error } = await supabase.from("honorarios").insert({
    tenant_id: user.tenantId,
    client_id: parsed.data.client_id,
    case_id: parsed.data.case_id || null,
    description: parsed.data.description,
    type: parsed.data.type,
    amount_cents: amountCents,
    status: parsed.data.status,
    due_date: parsed.data.due_date || null,
    paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
    installments: parsed.data.installments ?? 1,
    notes: parsed.data.notes || null,
  });

  if (error) {
    return c.redirect("/honorarios");
  }

  return c.redirect("/honorarios");
});

// GET /honorarios/:id -- detail.
honorariosRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: h } = await supabase
    .from("honorarios")
    .select("*, clients(name), cases(title)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!h) return c.html("Honorario nao encontrado.", 404);

  const [clientsRes, casesRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const client = h.clients as { name: string } | null;
  const caseRow = h.cases as { title: string } | null;

  return renderPage(
    c,
    { title: h.description, active: "honorarios" },
    <>
      <PageHeader
        title={h.description}
        icon="ph-hand-coins"
        actions={() => (
          <div class="flex gap-2">
            <Modal id="edit-honorario" title="Editar" icon="ph-pencil" triggerText="Editar" triggerIcon="ph-pencil" triggerVariant="secondary" action={`/honorarios/${id}`} submitLabel="Salvar" large>
              <ComboBox label="Cliente" id="client_id" name="client_id" required selected={h.client_id}
                options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
              />
              <ComboBox label="Processo (opcional)" id="case_id" name="case_id" selected={h.case_id ?? ""}
                options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
              />
              <TextField label="Descricao" id="description" name="description" required icon="ph-text-aa" value={h.description} />
              <div class="grid grid-cols-2 gap-4">
                <Select label="Tipo" id="type" name="type" required selected={h.type}
                  options={[
                    { value: "contratual", label: "Contratual" },
                    { value: "sucumbencial", label: "Sucumbencial" },
                    { value: "exito", label: "Exito" },
                    { value: "mensalidade", label: "Mensalidade" },
                    { value: "parcelamento", label: "Parcelamento" },
                  ]}
                />
                <TextField label="Valor (R$)" id="amount_cents" name="amount_cents" type="number" step="0.01" required placeholder="0,00" value={String(h.amount_cents / 100)} />
              </div>
              <div class="grid grid-cols-3 gap-4">
                <Select label="Status" id="status" name="status" required selected={h.status}
                  options={[
                    { value: "pending", label: "Pendente" },
                    { value: "paid", label: "Pago" },
                    { value: "overdue", label: "Atrasado" },
                    { value: "cancelled", label: "Cancelado" },
                  ]}
                />
                <TextField label="Vencimento" id="due_date" name="due_date" type="date" value={toDateInput(h.due_date)} />
                <TextField label="Parcelas" id="installments" name="installments" type="number" value={String(h.installments ?? 1)} />
              </div>
              <Textarea label="Observacoes" id="notes" name="notes" rows={3}>
                {h.notes ?? ""}
              </Textarea>
            </Modal>
            <form method="post" action={`/honorarios/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este honorario?')" aria-label="Excluir">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados do honorario" icon="ph-hand-coins">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Descricao: </dt><dd class="inline">{h.description}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${h.client_id}`} class="text-[#0568ff] hover:underline">{client?.name ?? "-"}</a></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline">{h.case_id ? <a href={`/cases/${h.case_id}`} class="text-[#0568ff] hover:underline">{caseRow?.title ?? "-"}</a> : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{TYPE_LABELS[h.type] ?? h.type}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor: </dt><dd class="inline">{formatCurrency(h.amount_cents)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline">
              <Badge color={statusColor(h.status)}>{STATUS_LABELS[h.status] ?? h.status}</Badge>
            </dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Vencimento: </dt><dd class="inline">{formatDate(h.due_date)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Pago em: </dt><dd class="inline">{formatDate(h.paid_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Parcelas: </dt><dd class="inline">{h.installments ?? 1}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{formatDate(h.created_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Atualizado em: </dt><dd class="inline">{formatDate(h.updated_at)}</dd></div>
          </dl>
        </Panel>
        {h.notes ? (
          <Panel title="Observacoes" icon="ph-note">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{h.notes}</p>
          </Panel>
        ) : null}
      </div>
    </>,
  );
});

// POST /honorarios/:id -- update.
honorariosRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = honorarioSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/honorarios/${id}`);
  }

  const rawAmount = (body.amount_cents as string) ?? "0";
  const amountCents = Math.round(Number(rawAmount) * 100);

  await supabase
    .from("honorarios")
    .update({
      client_id: parsed.data.client_id,
      case_id: parsed.data.case_id || null,
      description: parsed.data.description,
      type: parsed.data.type,
      amount_cents: amountCents,
      status: parsed.data.status,
      due_date: parsed.data.due_date || null,
      paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
      installments: parsed.data.installments ?? 1,
      notes: parsed.data.notes || null,
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/honorarios/${id}`);
});

// POST /honorarios/:id/delete -- hard delete.
honorariosRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("honorarios")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/honorarios");
});
