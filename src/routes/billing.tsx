import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, WizardModal } from "../components/ui";

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.use("*", requireAuth);
billingRoutes.use("*", requireRole("socio", "financeiro"));

// ============================================================
// PIX BR Code generator (EMV QR Code standard, CRC16-CCITT)
// ============================================================

function emvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function generatePixBRCode(opts: {
  amountCents: number;
  merchantName: string;
  merchantCity: string;
  pixKey: string;
  txid: string;
}): string {
  const amount = (opts.amountCents / 100).toFixed(2);
  // Normalize: remove accents (NFD), remove special chars, uppercase, max 25 for name, max 15 for city.
  const name = opts.merchantName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").slice(0, 25).toUpperCase();
  const city = opts.merchantCity.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").slice(0, 15).toUpperCase();
  const txid = opts.txid.slice(0, 25);

  // Build payload without CRC
  const gui = emvField("00", "br.gov.bcb.pix");
  const key = emvField("01", opts.pixKey);
  const merchantAccount = emvField("26", gui + key);
  const additionalData = emvField("62", emvField("05", txid));

  let payload =
    emvField("00", "01") +                          // Payload format indicator
    merchantAccount +                                // Merchant account info
    emvField("52", "0000") +                         // Merchant category code
    emvField("53", "986") +                          // Transaction currency (BRL)
    emvField("54", amount) +                         // Transaction amount
    emvField("58", "BR") +                           // Country code
    emvField("59", name) +                           // Merchant name
    emvField("60", city) +                           // Merchant city
    additionalData +                                 // Additional data field (TXID)
    "6304";                                          // CRC placeholder

  const crc = crc16(payload);
  return payload + crc;
}

const invoiceSchema = z.object({
  client_id: z.string().uuid("Cliente invalido"),
  case_id: z.string().optional(),
  honorario_id: z.string().optional(),
  number: z.string().min(1, "Numero e obrigatorio"),
  amount: z.coerce.number().positive("Valor deve ser positivo"),
  due_date: z.string().optional(),
  payment_method: z.enum(["pix", "boleto", "card", "transfer", "cash"]),
  notes: z.string().optional(),
});

const STATUS_LABELS: Record<string, string> = {
  open: "Em aberto",
  sent: "Enviada",
  paid: "Paga",
  partial: "Parcial",
  overdue: "Vencida",
  cancelled: "Cancelada",
};

const METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  card: "Cartao",
  transfer: "Transferencia",
  cash: "Dinheiro",
};

function statusColor(status: string): "green" | "red" | "yellow" | "blue" | "gray" {
  if (status === "paid") return "green";
  if (status === "partial") return "yellow";
  if (status === "overdue") return "red";
  if (status === "sent") return "blue";
  return "gray";
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

// Generate next invoice number suggestion like FAT-2026-001.
async function suggestInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FAT-${year}-`;
  const { data } = await supabase
    .from("invoices")
    .select("number")
    .eq("tenant_id", tenantId)
    .like("number", `${prefix}%`)
    .order("number", { ascending: false })
    .limit(1);

  const last = data?.[0]?.number ?? "";
  const lastSeq = Number(last.replace(prefix, "")) || 0;
  const next = String(lastSeq + 1).padStart(3, "0");
  return `${prefix}${next}`;
}

// GET /billing -- list invoices with optional status filter.
billingRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const status = c.req.query("status")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (status) queryParams.status = status;

  let query = supabase
    .from("invoices")
    .select("id, number, amount_cents, paid_amount_cents, status, due_date, payment_method, clients(name), cases(title), honorarios(description)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  query = query.range(offset, offset + limit - 1);

  const { data: invoices, count } = await query;
  const totalPages = count ? Math.ceil(count / limit) : 1;

  // Fetch data for the wizard modal selects.
  const [clientsRes, casesRes, honorariosRes, suggested] = await Promise.all([
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("honorarios").select("id, description").eq("tenant_id", user.tenantId).order("created_at", { ascending: false }),
    suggestInvoiceNumber(user.tenantId),
  ]);

  const rows = (invoices ?? []).map((inv) => {
    const clientName = (inv.clients as unknown as { name: string } | null)?.name ?? "-";
    const caseTitle = (inv.cases as unknown as { title: string } | null)?.title;
    const honDesc = (inv.honorarios as unknown as { description: string } | null)?.description;
    const reference = caseTitle ?? honDesc ?? "-";
    return [
      <a href={`/billing/${inv.id}`} class="text-terracota-600 hover:underline">{inv.number}</a> as unknown as string,
      clientName,
      reference,
      formatCurrency(inv.amount_cents),
      formatDate(inv.due_date),
      <Badge color={statusColor(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Badge> as unknown as string,
      METHOD_LABELS[inv.payment_method] ?? inv.payment_method,
      <a href={`/billing/${inv.id}`} class="text-terracota-600 hover:underline text-body-sm">Ver</a> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Cobrancas", active: "billing" },
    <>
      <PageHeader
        title="Cobrancas"
        icon="ph-receipt"
        actions={() => (
          <WizardModal id="new-billing" title="Nova Cobranca" icon="ph-receipt" triggerText="Nova Cobranca" triggerIcon="ph-plus" action="/billing" large
            steps={[
              {
                label: "Cliente e Referencia",
                icon: "ph-user",
                fields: (
                  <>
                    <ComboBox label="Cliente" id="client_id" name="client_id" required
                      options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
                    />
                    <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
                      options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
                    />
                    <ComboBox label="Honorario (opcional)" id="honorario_id" name="honorario_id"
                      options={[{ value: "", label: "Nenhum" }, ...(honorariosRes.data ?? []).map((h) => ({ value: h.id, label: h.description }))]}
                    />
                    <TextField label="Numero" id="number" name="number" required value={suggested} icon="ph-hash" />
                  </>
                ),
              },
              {
                label: "Valores",
                icon: "ph-currency-dollar",
                fields: (
                  <>
                    <TextField label="Valor (R$)" id="amount" name="amount" type="number" step="0.01" required placeholder="0,00" icon="ph-currency-dollar" />
                    <TextField label="Vencimento" id="due_date" name="due_date" type="date" />
                    <Select label="Metodo de pagamento" id="payment_method" name="payment_method" required selected="pix"
                      options={[
                        { value: "pix", label: "PIX" },
                        { value: "boleto", label: "Boleto" },
                        { value: "card", label: "Cartao" },
                        { value: "transfer", label: "Transferencia" },
                        { value: "cash", label: "Dinheiro" },
                      ]}
                    />
                  </>
                ),
              },
              {
                label: "Observacoes",
                icon: "ph-note",
                fields: (
                  <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
                ),
              },
            ]}
          />
        )}
      />
      <form method="get" action="/billing" class="mb-4 flex gap-4 items-end">
        <Select
          label="Filtrar por status"
          id="status"
          name="status"
          selected={status}
          options={[
            { value: "", label: "Todos" },
            { value: "open", label: "Em aberto" },
            { value: "sent", label: "Enviada" },
            { value: "paid", label: "Paga" },
            { value: "partial", label: "Parcial" },
            { value: "overdue", label: "Vencida" },
            { value: "cancelled", label: "Cancelada" },
          ]}
        />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Numero" },
          { label: "Cliente" },
          { label: "Descricao/Referencia" },
          { label: "Valor" },
          { label: "Vencimento" },
          { label: "Status" },
          { label: "Metodo" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma cobranca encontrada."
        emptyIcon="ph-receipt"
        ariaLabel="Lista de cobrancas"
        count={count ?? 0}
        countLabel="cobranca(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/billing",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST /billing -- create.
billingRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = invoiceSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect("/billing");
  }

  const rawAmount = (body.amount as string) ?? "0";
  const amountCents = Math.round(Number(rawAmount) * 100);

  const { error } = await supabase.from("invoices").insert({
    tenant_id: user.tenantId,
    client_id: parsed.data.client_id,
    case_id: parsed.data.case_id || null,
    honorario_id: parsed.data.honorario_id || null,
    number: parsed.data.number,
    amount_cents: amountCents,
    paid_amount_cents: 0,
    status: "open",
    payment_method: parsed.data.payment_method,
    due_date: parsed.data.due_date || null,
    notes: parsed.data.notes || null,
  });

  if (error) {
    return c.redirect("/billing");
  }

  return c.redirect("/billing");
});

// GET /billing/:id -- detail.
billingRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: inv } = await supabase
    .from("invoices")
    .select("*, clients(name), cases(title), honorarios(description, amount_cents)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!inv) return c.html("Cobranca nao encontrada.", 404);

  const client = inv.clients as { name: string } | null;
  const caseRow = inv.cases as { title: string } | null;
  const hon = inv.honorarios as { description: string; amount_cents: number } | null;

  const isCancelled = inv.status === "cancelled";
  const isPaid = inv.status === "paid";

  return renderPage(
    c,
    { title: inv.number, active: "billing" },
    <>
      <PageHeader
        title={inv.number}
        icon="ph-receipt"
        actions={() => (
          <div class="flex gap-2">
            {!isCancelled && !isPaid ? (
              <form method="post" action={`/billing/${id}/cancel`}>
                <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Cancelar esta cobranca?')">
                  <i class="ph ph-x-circle" aria-hidden="true"></i>Cancelar Cobranca
                </button>
              </form>
            ) : null}
          </div>
        )}
      />
      <div class="flex gap-2 mb-6">
        {inv.status === "open" ? (
          <form method="post" action={`/billing/${id}/send`}>
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Marcar como Enviada</button>
          </form>
        ) : null}
        {!isPaid && !isCancelled ? (
          <form method="post" action={`/billing/${id}/pay`}>
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-check-circle" aria-hidden="true"></i>Marcar como Paga</button>
          </form>
        ) : null}
        {!isCancelled ? (
          <form method="post" action={`/billing/${id}/pix`}>
            <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-qr-code" aria-hidden="true"></i>Gerar PIX</button>
          </form>
        ) : null}
      </div>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados da cobranca" icon="ph-receipt">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Numero: </dt><dd class="inline">{inv.number}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${inv.client_id}`} class="text-terracota-600 hover:underline">{client?.name ?? "-"}</a></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline">{inv.case_id ? <a href={`/cases/${inv.case_id}`} class="text-terracota-600 hover:underline">{caseRow?.title ?? "-"}</a> : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Honorario: </dt><dd class="inline">{hon ? hon.description : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor: </dt><dd class="inline">{formatCurrency(inv.amount_cents)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor pago: </dt><dd class="inline">{formatCurrency(inv.paid_amount_cents ?? 0)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={statusColor(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Metodo: </dt><dd class="inline">{METHOD_LABELS[inv.payment_method] ?? inv.payment_method}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Vencimento: </dt><dd class="inline">{formatDate(inv.due_date)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Pago em: </dt><dd class="inline">{formatDate(inv.paid_at)}</dd></div>
            {inv.pix_code ? <div><dt class="font-semibold text-gray-700 inline">Codigo PIX: </dt><dd class="inline text-body-xs font-mono break-all">{inv.pix_code}</dd></div> : null}
            {inv.boleto_url ? <div><dt class="font-semibold text-gray-700 inline">Boleto: </dt><dd class="inline"><a href={inv.boleto_url} class="text-terracota-600 hover:underline" target="_blank" rel="noopener">Abrir boleto</a></dd></div> : null}
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{formatDate(inv.created_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Atualizado em: </dt><dd class="inline">{formatDate(inv.updated_at)}</dd></div>
          </dl>
        </Panel>
        {inv.notes ? (
          <Panel title="Observacoes" icon="ph-note">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{inv.notes}</p>
          </Panel>
        ) : null}
      </div>
    </>,
  );
});

// POST /billing/:id/send -- mark as sent.
billingRoutes.post("/:id/send", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("invoices")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/billing/${id}`);
});

// POST /billing/:id/pay -- mark as paid.
billingRoutes.post("/:id/pay", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: inv } = await supabase
    .from("invoices")
    .select("amount_cents")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!inv) return c.html("Cobranca nao encontrada.", 404);

  await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_amount_cents: inv.amount_cents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/billing/${id}`);
});

// POST /billing/:id/pix -- generate a valid PIX BR Code (copia e cola).
billingRoutes.post("/:id/pix", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, number, amount_cents, clients(name)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!inv) return c.redirect("/billing");

  // Fetch tenant PIX settings.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, pix_key, pix_merchant_name, pix_merchant_city")
    .eq("id", user.tenantId)
    .single();

  const pixKey = tenant?.pix_key ?? "";
  if (!pixKey) {
    // No PIX key configured — redirect with error.
    return c.redirect(`/billing/${id}?error=pix_not_configured`);
  }

  const pixCode = generatePixBRCode({
    amountCents: inv.amount_cents,
    pixKey,
    merchantName: tenant?.pix_merchant_name ?? tenant?.name ?? "ESCRITORIO",
    merchantCity: tenant?.pix_merchant_city ?? "SAO PAULO",
    txid: `PRAGMA${inv.number}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 25),
  });

  await supabase
    .from("invoices")
    .update({ pix_code: pixCode, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/billing/${id}`);
});

// POST /billing/:id/cancel -- cancel invoice.
billingRoutes.post("/:id/cancel", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("invoices")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/billing/${id}`);
});

// POST /billing/:id -- update.
billingRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = invoiceSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/billing/${id}`);
  }

  const rawAmount = (body.amount as string) ?? "0";
  const amountCents = Math.round(Number(rawAmount) * 100);

  await supabase
    .from("invoices")
    .update({
      client_id: parsed.data.client_id,
      case_id: parsed.data.case_id || null,
      honorario_id: parsed.data.honorario_id || null,
      number: parsed.data.number,
      amount_cents: amountCents,
      due_date: parsed.data.due_date || null,
      payment_method: parsed.data.payment_method,
      notes: parsed.data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/billing/${id}`);
});
