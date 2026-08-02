import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const trustRoutes = new Hono<AppEnv>();

trustRoutes.use("*", requireAuth);
trustRoutes.use("*", requireRole("socio", "financeiro"));

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

// GET /trust-accounts — list all trust accounts
trustRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: accounts } = await supabase
    .from("trust_accounts")
    .select("id, balance_cents, created_at, clients(name)")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  const totalBalance = (accounts ?? []).reduce((s, a) => s + a.balance_cents, 0);

  const rows = (accounts ?? []).map((a) => {
    const clientName = (a.clients as unknown as { name: string } | null)?.name ?? "-";
    return [
      <a href={`/trust-accounts/${a.id}`} class="text-terracota-600 hover:underline">{clientName}</a> as unknown as string,
      formatCurrency(a.balance_cents),
      <Badge color={a.balance_cents > 0 ? "green" : "gray"}>{a.balance_cents > 0 ? "Saldo positivo" : "Sem saldo"}</Badge> as unknown as string,
      formatDate(a.created_at),
      <a href={`/trust-accounts/${a.id}`} class="text-terracota-600 hover:underline text-body-sm">Ver</a> as unknown as string,
    ];
  });

  // Fetch clients for the modal
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("name");

  return renderPage(
    c,
    { title: "Contas de Clientes", active: "trust-accounts" },
    <>
      <PageHeader title="Contas de Clientes" icon="ph-bank" actions={() => (
        <Modal id="new-trust" title="Nova Conta de Cliente" icon="ph-bank" triggerText="Nova Conta" triggerIcon="ph-plus" action="/trust-accounts" submitLabel="Criar">
          <ComboBox label="Cliente" id="client_id" name="client_id" required
            options={(clients ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <TextField label="Saldo inicial (R$)" id="initial_amount" name="initial_amount" type="number" step="0.01" placeholder="0,00" icon="ph-currency-dollar" />
        </Modal>
      )} />

      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-wallet text-h3 text-terracota-700" aria-hidden="true"></i>Saldo Total em Custodia
          </div>
          <div class="text-h2 font-bold text-terracota-700">{formatCurrency(totalBalance)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-users text-h3 text-status-blue" aria-hidden="true"></i>Contas Ativas
          </div>
          <div class="text-h2 font-bold text-status-blue">{accounts?.length ?? 0}</div>
        </Panel>
      </div>

      <Table
        columns={[{ label: "Cliente" }, { label: "Saldo" }, { label: "Status" }, { label: "Criada em" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhuma conta de cliente cadastrada."
        emptyIcon="ph-wallet"
        ariaLabel="Lista de contas de clientes"
      />
    </>,
  );
});

// POST /trust-accounts — create
trustRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const clientId = body.client_id as string;
  const initialAmount = Math.round(Number(body.initial_amount ?? 0) * 100);

  if (!clientId) return c.redirect("/trust-accounts?error=Cliente obrigatorio");

  const { data: account } = await supabase
    .from("trust_accounts")
    .insert({
      tenant_id: user.tenantId,
      client_id: clientId,
      balance_cents: initialAmount,
    })
    .select("id")
    .single();

  // If initial amount > 0, create a deposit transaction
  if (account && initialAmount > 0) {
    await supabase.from("trust_transactions").insert({
      tenant_id: user.tenantId,
      trust_account_id: account.id,
      type: "deposit",
      amount_cents: initialAmount,
      description: "Saldo inicial",
      created_by: user.id,
    });
  }

  return c.redirect("/trust-accounts?success=Conta criada com sucesso");
});

// GET /trust-accounts/:id — detail with transactions
trustRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: account } = await supabase
    .from("trust_accounts")
    .select("*, clients(name)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!account) return c.html("Conta nao encontrada.", 404);

  const clientName = (account.clients as unknown as { name: string } | null)?.name ?? "-";

  const { data: transactions } = await supabase
    .from("trust_transactions")
    .select("id, type, amount_cents, description, reference_date, created_at, cases(title)")
    .eq("trust_account_id", id)
    .eq("tenant_id", user.tenantId)
    .order("reference_date", { ascending: false })
    .limit(50);

  const txRows = (transactions ?? []).map((t) => {
    const caseTitle = (t.cases as unknown as { title: string } | null)?.title;
    const typeLabel = t.type === "deposit" ? "Deposito" : t.type === "withdrawal" ? "Saque" : "Transferencia";
    const typeColor: "green" | "red" | "blue" = t.type === "deposit" ? "green" : t.type === "withdrawal" ? "red" : "blue";
    return [
      formatDate(t.reference_date),
      <Badge color={typeColor}>{typeLabel}</Badge> as unknown as string,
      formatCurrency(t.amount_cents),
      t.description ?? "-",
      caseTitle ?? "-",
    ];
  });

  return renderPage(
    c,
    { title: `Conta - ${clientName}`, active: "trust-accounts" },
    <>
      <PageHeader title={`Conta de ${clientName}`} icon="ph-bank" actions={() => (
        <div class="flex gap-2">
          <Modal id="deposit" title="Depositar" icon="ph-arrow-down" triggerText="Depositar" triggerIcon="ph-arrow-down" triggerVariant="secondary" action={`/trust-accounts/${id}/transaction`} submitLabel="Confirmar">
            <input type="hidden" name="type" value="deposit" />
            <TextField label="Valor (R$)" id="amount" name="amount" type="number" step="0.01" required placeholder="0,00" icon="ph-currency-dollar" />
            <Textarea label="Descricao" id="description" name="description" rows={2}>Motivo do deposito...</Textarea>
          </Modal>
          <Modal id="withdraw" title="Sacar / Usar" icon="ph-arrow-up" triggerText="Sacar" triggerIcon="ph-arrow-up" triggerVariant="secondary" action={`/trust-accounts/${id}/transaction`} submitLabel="Confirmar">
            <input type="hidden" name="type" value="withdrawal" />
            <TextField label="Valor (R$)" id="amount" name="amount" type="number" step="0.01" required placeholder="0,00" icon="ph-currency-dollar" />
            <Textarea label="Descricao" id="description" name="description" rows={2}>Motivo do saque (custas, honorarios, etc.)...</Textarea>
          </Modal>
        </div>
      )} />

      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Saldo Atual" icon="ph-wallet">
          <div class={`text-h1 font-bold ${account.balance_cents >= 0 ? "text-terracota-700" : "text-status-red"}`}>
            {formatCurrency(account.balance_cents)}
          </div>
        </Panel>
        <Panel title="Cliente" icon="ph-user">
          <a href={`/clients/${account.client_id}`} class="text-terracota-600 hover:underline text-body">{clientName}</a>
          <div class="text-body-sm text-gray-500 mt-1">Conta criada em {formatDate(account.created_at)}</div>
        </Panel>
      </div>

      <Panel title="Movimentacoes" icon="ph-arrows-left-right">
        <Table
          columns={[{ label: "Data" }, { label: "Tipo" }, { label: "Valor" }, { label: "Descricao" }, { label: "Processo" }]}
          rows={txRows}
          emptyMsg="Nenhuma movimentacao."
          emptyIcon="ph-arrows-left-right"
          ariaLabel="Movimentacoes da conta"
        />
      </Panel>
    </>,
  );
});

// POST /trust-accounts/:id/transaction — deposit or withdrawal
trustRoutes.post("/:id/transaction", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const type = body.type as string;
  const amount = Math.round(Number(body.amount) * 100);
  const description = (body.description as string) || null;

  if (!type || !amount || amount <= 0) return c.redirect(`/trust-accounts/${id}?error=Dados invalidos`);

  const { data: account } = await supabase
    .from("trust_accounts")
    .select("id, balance_cents")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!account) return c.redirect("/trust-accounts?error=Conta nao encontrada");

  // Check sufficient balance for withdrawal
  if (type === "withdrawal" && amount > account.balance_cents) {
    return c.redirect(`/trust-accounts/${id}?error=Saldo insuficiente`);
  }

  // Create transaction
  await supabase.from("trust_transactions").insert({
    tenant_id: user.tenantId,
    trust_account_id: id,
    type,
    amount_cents: amount,
    description,
    created_by: user.id,
  });

  // Update balance
  const newBalance = type === "deposit" ? account.balance_cents + amount : account.balance_cents - amount;
  await supabase
    .from("trust_accounts")
    .update({ balance_cents: newBalance, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/trust-accounts/${id}?success=Movimentacao registrada`);
});
