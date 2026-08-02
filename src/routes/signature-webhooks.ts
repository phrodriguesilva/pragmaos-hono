// Webhook endpoints for signature providers (ClickSign, DocuSign).
// These are public endpoints (no auth cookie) — verified by signature/HMAC.
// Providers call these to notify PragmaOS of signature status changes.

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { supabase } from "../lib/supabase";
import { verifyClicksignWebhook } from "../lib/integrations";
import { log } from "../lib/logger";
import { timingSafeEqual } from "node:crypto";
import { createHmac } from "node:crypto";

export const signatureWebhookRoutes = new Hono<AppEnv>();

// ============================================================
// POST /webhooks/clicksign — ClickSign webhook
// ClickSign sends HMAC-SHA256 signature in header
// ============================================================
signatureWebhookRoutes.post("/clicksign", async (c) => {
  try {
    const rawBody = await c.req.text();
    const signature = c.req.header("X-Clicksign-Signature") ?? "";

    // Find the integration config that has the webhook secret
    const { data: integrations } = await supabase
      .from("integrations")
      .select("tenant_id, config")
      .eq("type", "clicksign")
      .eq("active", true);

    if (!integrations || integrations.length === 0) {
      log.warn("Clicksign webhook: no active integrations found");
      return c.json({ ok: false, error: "no integration" }, 404);
    }

    // Try each integration's secret to find the matching one
    let matchedTenantId: string | null = null;
    for (const integ of integrations) {
      const config = integ.config as any;
      const secret = config?.webhook_secret ?? config?.access_token ?? "";
      if (await verifyClicksignWebhook(rawBody, signature, secret)) {
        matchedTenantId = integ.tenant_id;
        break;
      }
    }

    if (!matchedTenantId) {
      log.warn("Clicksign webhook: signature verification failed");
      return c.json({ ok: false, error: "invalid signature" }, 401);
    }

    const event = JSON.parse(rawBody) as {
      event?: { name?: string };
      envelope?: { id?: string; status?: string };
    };

    const envelopeId = event.envelope?.id ?? "";
    const eventType = event.event?.name ?? "unknown";
    const status = event.envelope?.status ?? "";

    log.info("Clicksign webhook received", { envelopeId, eventType, status, tenantId: matchedTenantId });

    // Store webhook event for idempotency
    await supabase.from("signature_webhooks").insert({
      tenant_id: matchedTenantId,
      provider: "clicksign",
      event_type: eventType,
      envelope_id: envelopeId,
      payload: event,
      processed: true,
      processed_at: new Date().toISOString(),
    });

    // Update signature request status if we have a matching envelope
    if (envelopeId) {
      const statusMap: Record<string, string> = {
        "open": "viewed",
        "sent": "sent",
        "closed": "signed",
        "canceled": "cancelled",
        "expired": "expired",
      };
      const mappedStatus = statusMap[status] ?? status;

      await supabase
        .from("signature_requests")
        .update({
          status: mappedStatus,
          webhook_data: event,
          last_synced_at: new Date().toISOString(),
          sync_status: "synced",
          viewed_at: status === "open" ? new Date().toISOString() : undefined,
          signed_at: status === "closed" ? new Date().toISOString() : undefined,
        })
        .eq("external_envelope_id", envelopeId)
        .eq("tenant_id", matchedTenantId);
    }

    return c.json({ ok: true });
  } catch (err) {
    log.error("Clicksign webhook error", { error: (err as Error).message });
    return c.json({ ok: false, error: "internal error" }, 500);
  }
});

// ============================================================
// POST /webhooks/docusign — DocuSign webhook
// DocuSign sends HMAC-SHA256 signature in "X-DocuSign-Signature-1" header
// ============================================================
signatureWebhookRoutes.post("/docusign", async (c) => {
  try {
    const rawBody = await c.req.text();
    const signatureHeader = c.req.header("X-DocuSign-Signature-1") ?? "";

    // Find the integration config
    const { data: integrations } = await supabase
      .from("integrations")
      .select("tenant_id, config")
      .eq("type", "docusign")
      .eq("active", true);

    if (!integrations || integrations.length === 0) {
      log.warn("Docusign webhook: no active integrations found");
      return c.json({ ok: false, error: "no integration" }, 404);
    }

    // DocuSign uses HMAC-SHA256 with the webhook secret
    let matchedTenantId: string | null = null;
    for (const integ of integrations) {
      const config = integ.config as any;
      const secret = config?.webhook_secret ?? "";
      if (!secret) continue;

      const hmac = createHmac("sha256", secret).update(rawBody).digest("base64");
      if (hmac.length === signatureHeader.length) {
        try {
          if (timingSafeEqual(Buffer.from(hmac), Buffer.from(signatureHeader))) {
            matchedTenantId = integ.tenant_id;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!matchedTenantId) {
      log.warn("Docusign webhook: signature verification failed");
      return c.json({ ok: false, error: "invalid signature" }, 401);
    }

    const event = JSON.parse(rawBody) as {
      event?: string;
      data?: {
        envelopeId?: string;
        status?: string;
        envelopeSummary?: { status?: string };
      };
    };

    const envelopeId = event.data?.envelopeId ?? "";
    const eventType = event.event ?? "unknown";
    const status = event.data?.envelopeSummary?.status ?? event.data?.status ?? "";

    log.info("Docusign webhook received", { envelopeId, eventType, status, tenantId: matchedTenantId });

    // Store webhook event
    await supabase.from("signature_webhooks").insert({
      tenant_id: matchedTenantId,
      provider: "docusign",
      event_type: eventType,
      envelope_id: envelopeId,
      payload: event,
      processed: true,
      processed_at: new Date().toISOString(),
    });

    // Update signature request status
    if (envelopeId) {
      const statusMap: Record<string, string> = {
        "sent": "sent",
        "delivered": "viewed",
        "completed": "signed",
        "declined": "rejected",
        "voided": "cancelled",
        "expired": "expired",
      };
      const mappedStatus = statusMap[status] ?? status;

      await supabase
        .from("signature_requests")
        .update({
          status: mappedStatus,
          webhook_data: event,
          last_synced_at: new Date().toISOString(),
          sync_status: "synced",
          viewed_at: status === "delivered" ? new Date().toISOString() : undefined,
          signed_at: status === "completed" ? new Date().toISOString() : undefined,
        })
        .eq("external_envelope_id", envelopeId)
        .eq("tenant_id", matchedTenantId);
    }

    return c.json({ ok: true });
  } catch (err) {
    log.error("Docusign webhook error", { error: (err as Error).message });
    return c.json({ ok: false, error: "internal error" }, 500);
  }
});
