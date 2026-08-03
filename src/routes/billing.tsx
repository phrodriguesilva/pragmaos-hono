import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { caseBelongsToTenant, clientBelongsToTenant, honorarioBelongsToTenant } from "../lib/tenant-ownership";
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
  client_id: z.string().uuid("Cliente inválido"),
  case_id: z.string().optional(),
  honorario_id: z.string().optional(),
  number: z.string().min(1, "Número é obrigatório"),
  amount: z.coerce.number().positive("Valor deve ser positivo").max(1e10, "Valor excede o limite maximo"),
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
  card: "Cartão",
  transfer: "Transferência",
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
      <a href={`/billing/${inv.id}`} class="text-[#0568ff] hover:underline">{inv.number}</a> as unknown as string,
      clientName,
      reference,
      formatCurrency(inv.amount_cents),
      formatDate(inv.due_date),
      <Badge color={statusColor(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Badge> as unknown as string,
      METHOD_LABELS[inv.payment_method] ?? inv.payment_method,
      <a href={`/billing/${inv.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Cobranças", active: "billing" },
    <>
      <PageHeader
        title="Cobranças"
        icon="ph-receipt"
        actions={() => (
          <WizardModal id="new-billing" title="Nova Cobrança" icon="ph-receipt" triggerText="Nova Cobrança" triggerIcon="ph-plus" action="/billing" large
            steps={[
              {
                label: "Cliente e Referência",
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
                    <TextField label="Número" id="number" name="number" required value={suggested} icon="ph-hash" />
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
                        { value: "card", label: "Cartão" },
                        { value: "transfer", label: "Transferência" },
                        { value: "cash", label: "Dinheiro" },
                      ]}
                    />
                  </>
                ),
              },
              {
                label: "Observações",
                icon: "ph-note",
                fields: (
                  <Textarea label="Observações" id="notes" name="notes" rows={3} />
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
          { label: "Número" },
          { label: "Cliente" },
          { label: "Descrição/Referência" },
          { label: "Valor" },
          { label: "Vencimento" },
          { label: "Status" },
          { label: "Metodo" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma cobrança encontrada."
        emptyIcon="ph-receipt"
        ariaLabel="Lista de cobranças"
        count={count ?? 0}
        countLabel="cobrança(s)"
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

  // Validate IDOR-relevant foreign keys.
  if (parsed.data.client_id) {
    const owns = await clientBelongsToTenant(parsed.data.client_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }
  if (parsed.data.case_id) {
    const owns = await caseBelongsToTenant(parsed.data.case_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }
  if (parsed.data.honorario_id) {
    const owns = await honorarioBelongsToTenant(parsed.data.honorario_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
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

  if (!inv) return c.html("Cobrança não encontrada.", 404);

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
            <a href={`/billing/${id}/pdf`} target="_blank" rel="noopener noreferrer" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-file-pdf" aria-hidden="true"></i>Baixar PDF
            </a>
            {!isCancelled && !isPaid ? (
              <form method="post" action={`/billing/${id}/cancel`}>
                <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Cancelar esta cobrança?')" aria-label="Cancelar Cobrança">
                  <i class="ph ph-x-circle" aria-hidden="true"></i>Cancelar Cobrança
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
        <Panel title="Dados da cobrança" icon="ph-receipt">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Número: </dt><dd class="inline">{inv.number}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${inv.client_id}`} class="text-[#0568ff] hover:underline">{client?.name ?? "-"}</a></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline">{inv.case_id ? <a href={`/cases/${inv.case_id}`} class="text-[#0568ff] hover:underline">{caseRow?.title ?? "-"}</a> : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Honorario: </dt><dd class="inline">{hon ? hon.description : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor: </dt><dd class="inline">{formatCurrency(inv.amount_cents)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor pago: </dt><dd class="inline">{formatCurrency(inv.paid_amount_cents ?? 0)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={statusColor(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Metodo: </dt><dd class="inline">{METHOD_LABELS[inv.payment_method] ?? inv.payment_method}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Vencimento: </dt><dd class="inline">{formatDate(inv.due_date)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Pago em: </dt><dd class="inline">{formatDate(inv.paid_at)}</dd></div>
            {inv.pix_code ? <div><dt class="font-semibold text-gray-700 inline">Codigo PIX: </dt><dd class="inline text-body-xs font-mono break-all">{inv.pix_code}</dd></div> : null}
            {inv.boleto_url ? <div><dt class="font-semibold text-gray-700 inline">Boleto: </dt><dd class="inline"><a href={inv.boleto_url} class="text-[#0568ff] hover:underline" target="_blank" rel="noopener">Abrir boleto</a></dd></div> : null}
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{formatDate(inv.created_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Atualizado em: </dt><dd class="inline">{formatDate(inv.updated_at)}</dd></div>
          </dl>
        </Panel>
        {inv.notes ? (
          <Panel title="Observações" icon="ph-note">
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

  if (!inv) return c.html("Cobrança não encontrada.", 404);

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

  // Fetch tenant name first (always exists), then try PIX columns (may not exist yet).
  const { data: tenantBasic } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", user.tenantId)
    .single();

  // Try to fetch PIX settings — gracefully handles missing columns.
  const { data: tenantPix } = await supabase
    .from("tenants")
    .select("pix_key, pix_merchant_name, pix_merchant_city")
    .eq("id", user.tenantId)
    .single();

  const pixKey = (tenantPix as Record<string, unknown> | null)?.pix_key as string ?? "";
  if (!pixKey) {
    // No PIX key configured — redirect with error.
    return c.redirect(`/billing/${id}?error=pix_not_configured`);
  }

  const pixCode = generatePixBRCode({
    amountCents: inv.amount_cents,
    pixKey,
    merchantName: ((tenantPix as Record<string, unknown> | null)?.pix_merchant_name as string) ?? tenantBasic?.name ?? "ESCRITÓRIO",
    merchantCity: ((tenantPix as Record<string, unknown> | null)?.pix_merchant_city as string) ?? "SAO PAULO",
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

// ============================================================
// GET /billing/:id/pdf — Generate PDF invoice (pdf-lib, serverless-safe)
// ============================================================
billingRoutes.get("/:id/pdf", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: inv }: any = await supabase
    .from("invoices")
    .select(`
      id, number, amount_cents, paid_amount_cents, status, payment_method,
      due_date, paid_at, notes, created_at, pix_code,
      clients(name, email, phone, cpf, cnpj, address),
      cases(title),
      honorarios(description, amount_cents)
    `)
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!inv) return c.html("Cobrança não encontrada.", 404);

  // Fetch tenant data for the invoice header
  const { data: tenant }: any = await supabase
    .from("tenants")
    .select("name, cnpj, email_public, phone, address, subdomain")
    .eq("id", user.tenantId)
    .single();

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  const client = inv.clients as any;
  const caseRow = inv.cases as any;
  const hon = inv.honorarios as any;

  // Colors
  const terracota = rgb(0.69, 0.39, 0.2);
  const dark = rgb(0.2, 0.2, 0.2);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.9, 0.9, 0.9);

  const left = 50;
  const right = 545;
  const width = right - left;

  // Header — firm name
  let y = 800;
  page.drawText(tenant?.name ?? "Escritório", { x: left, y, size: 20, font: helveticaBold, color: dark });
  y -= 18;
  page.drawText(`CNPJ: ${tenant?.cnpj ?? "—"}`, { x: left, y, size: 9, font: helvetica, color: gray });
  if (tenant?.email_public) {
    y -= 14;
    page.drawText(tenant.email_public, { x: left, y, size: 9, font: helvetica, color: gray });
  }
  if (tenant?.phone) {
    y -= 14;
    page.drawText(tenant.phone, { x: left, y, size: 9, font: helvetica, color: gray });
  }
  if (tenant?.address) {
    y -= 14;
    page.drawText(tenant.address.slice(0, 80), { x: left, y, size: 9, font: helvetica, color: gray });
  }

  // Invoice title (right side)
  page.drawText("COBRANÇA", { x: right - 130, y: 800, size: 24, font: helveticaBold, color: terracota });
  page.drawText(`Nº ${inv.number}`, { x: right - 130, y: 778, size: 12, font: helvetica, color: dark });
  page.drawText(`Emitida em: ${formatDate(inv.created_at)}`, { x: right - 130, y: 762, size: 10, font: helvetica, color: gray });

  // Line separator
  page.drawLine({ start: { x: left, y: 745 }, end: { x: right, y: 745 }, thickness: 1, color: lightGray });

  // Client section
  y = 720;
  page.drawText("CLIENTE", { x: left, y, size: 11, font: helveticaBold, color: dark });
  y -= 18;
  if (client) {
    page.drawText(client.name ?? "—", { x: left, y, size: 10, font: helvetica, color: gray });
    if (client.cpf) {
      y -= 14;
      page.drawText(`CPF: ${client.cpf}`, { x: left, y, size: 9, font: helvetica, color: gray });
    }
    if (client.cnpj) {
      y -= 14;
      page.drawText(`CNPJ: ${client.cnpj}`, { x: left, y, size: 9, font: helvetica, color: gray });
    }
    if (client.email) {
      y -= 14;
      page.drawText(client.email, { x: left, y, size: 9, font: helvetica, color: gray });
    }
    if (client.phone) {
      y -= 14;
      page.drawText(client.phone, { x: left, y, size: 9, font: helvetica, color: gray });
    }
  }

  // Details section
  y -= 30;
  page.drawText("DETALHES", { x: left, y, size: 11, font: helveticaBold, color: dark });
  y -= 18;

  const rows: [string, string][] = [
    ["Status", STATUS_LABELS[inv.status] ?? inv.status],
    ["Método", METHOD_LABELS[inv.payment_method] ?? inv.payment_method ?? "—"],
    ["Vencimento", formatDate(inv.due_date)],
    ["Pago em", formatDate(inv.paid_at)],
  ];
  if (caseRow?.title) rows.push(["Processo", caseRow.title.slice(0, 50)]);
  if (hon?.description) rows.push(["Honorários", hon.description.slice(0, 50)]);

  for (const [label, value] of rows) {
    page.drawText(label, { x: left, y, size: 9, font: helveticaBold, color: dark });
    page.drawText(value, { x: left + 150, y, size: 9, font: helvetica, color: gray });
    y -= 16;
  }

  // Amount section
  y -= 15;
  page.drawLine({ start: { x: left, y: y + 5 }, end: { x: right, y: y + 5 }, thickness: 1, color: lightGray });
  y -= 20;

  page.drawText("VALOR", { x: left, y, size: 14, font: helveticaBold, color: dark });
  const amountStr = formatCurrency(inv.amount_cents);
  const amountWidth = helveticaBold.widthOfTextAtSize(amountStr, 20);
  page.drawText(amountStr, { x: right - amountWidth, y, size: 20, font: helveticaBold, color: terracota });
  y -= 25;

  if (inv.paid_amount_cents && inv.paid_amount_cents > 0 && inv.paid_amount_cents !== inv.amount_cents) {
    const paidStr = formatCurrency(inv.paid_amount_cents);
    const paidWidth = helveticaBold.widthOfTextAtSize(paidStr, 11);
    page.drawText("Valor pago:", { x: right - paidWidth - 80, y, size: 10, font: helvetica, color: gray });
    page.drawText(paidStr, { x: right - paidWidth, y, size: 11, font: helveticaBold, color: dark });
    y -= 16;
  }

  // PIX code
  if (inv.pix_code) {
    y -= 15;
    page.drawText("PIX Copia e Cola:", { x: left, y, size: 10, font: helveticaBold, color: dark });
    y -= 14;
    // PIX codes can be long — wrap them
    const pixLines = (inv.pix_code as string).match(/.{1,60}/g) ?? [];
    for (const line of pixLines) {
      page.drawText(line, { x: left, y, size: 8, font: courier, color: gray });
      y -= 12;
    }
  }

  // Notes
  if (inv.notes) {
    y -= 20;
    page.drawText("Observações:", { x: left, y, size: 10, font: helveticaBold, color: dark });
    y -= 14;
    const noteLines = (inv.notes as string).match(/.{1,70}/g) ?? [];
    for (const line of noteLines) {
      page.drawText(line, { x: left, y, size: 9, font: helvetica, color: gray });
      y -= 12;
    }
  }

  // Footer
  const footerStr = `Documento gerado por PragmaOS em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`;
  const footerWidth = helvetica.widthOfTextAtSize(footerStr, 8);
  page.drawText(footerStr, { x: (595.28 - footerWidth) / 2, y: 40, size: 8, font: helvetica, color: gray });

  const pdfBytes = await pdfDoc.save();

  return new Response(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cobranca-${inv.number}.pdf"`,
      "Cache-Control": "no-cache",
    },
  });
});
