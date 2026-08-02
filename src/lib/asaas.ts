// Asaas integration — SaaS subscription billing for PragmaOS.
// Asaas is a Brazilian payment gateway supporting PIX, boleto and card.
// API docs: https://docs.asaas.com/
//
// Flow:
// 1. Create customer (tenant) in Asaas -> asaas_customer_id
// 2. Create subscription -> asaas_subscription_id
// 3. Asaas generates invoices monthly -> we store as saas_invoices
// 4. Webhook updates payment status

import { log } from "./logger";

const ASAAS_BASE_URL = "https://api.asaas.com/v3";

function getApiKey(): string {
  const key = (typeof Bun !== "undefined" ? Bun.env : process.env).ASAAS_API_KEY ?? "";
  if (!key) {
    log.warn("ASAAS_API_KEY not configured — subscription billing will not work");
  }
  return key;
}

function isConfigured(): boolean {
  return !!getApiKey();
}

async function asaasRequest<T = any>(path: string, opts: { method: string; body?: unknown } = { method: "GET" }): Promise<T> {
  const key = getApiKey();
  if (!key) throw new Error("Asaas API key not configured");

  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method: opts.method,
    headers: {
      "Content-Type": "application/json",
      "access_token": key,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data: any = await res.json();
  if (!res.ok) {
    log.error("Asaas API error", { path, status: res.status, error: data });
    throw new Error(`Asaas API error: ${data.errors?.[0]?.description ?? res.status}`);
  }
  return data as T;
}

// ============================================================
// Customer
// ============================================================
export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
}

export async function createCustomer(opts: {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>("/customers", {
    method: "POST",
    body: {
      name: opts.name,
      email: opts.email,
      cpfCnpj: opts.cpfCnpj ?? "",
      phone: opts.phone ?? "",
      notificationDisabled: false,
    },
  });
}

// ============================================================
// Subscription
// ============================================================
export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  billingType: string;
  cycle: string;
  nextDueDate: string;
  status: string;
}

export async function createSubscription(opts: {
  customerId: string;
  valueCents: number;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
  cycle: "MONTHLY" | "YEARLY";
  description: string;
}): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: {
      customer: opts.customerId,
      billingType: opts.billingType,
      value: opts.valueCents / 100,
      cycle: opts.cycle,
      description: opts.description,
      notify: true,
    },
  });
}

export async function getSubscription(id: string): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>(`/subscriptions/${id}`);
}

export async function cancelSubscription(id: string): Promise<void> {
  await asaasRequest(`/subscriptions/${id}`, { method: "DELETE" });
}

// ============================================================
// Payment (invoice) — Asaas generates these per subscription cycle
// ============================================================
export interface AsaasPayment {
  id: string;
  subscription: string;
  value: number;
  billingType: string;
  status: string;
  dueDate: string;
  invoiceUrl?: string;
  pixQrCode?: string;
  pixCopyPasteCode?: string;
  bankSlipUrl?: string;
}

export async function getPayment(id: string): Promise<AsaasPayment> {
  return asaasRequest<AsaasPayment>(`/payments/${id}`);
}

export async function listPaymentsBySubscription(subscriptionId: string): Promise<AsaasPayment[]> {
  const data = await asaasRequest<{ data: AsaasPayment[] }>(`/payments?subscription=${subscriptionId}&limit=12`);
  return data.data ?? [];
}

// ============================================================
// Webhook payload parsing
// ============================================================
export interface AsaasWebhookEvent {
  event: string;
  payment: {
    id: string;
    subscription?: string;
    status: string;
    value: number;
    billingType: string;
    dueDate: string;
    invoiceUrl?: string;
    pixQrCode?: string;
    pixCopyPasteCode?: string;
    bankSlipUrl?: string;
  };
}

export { isConfigured, ASAAS_BASE_URL };
