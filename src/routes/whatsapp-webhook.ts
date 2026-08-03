import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { supabase } from "../lib/supabase";
import { detectOptOut } from "../lib/integrations";
import { decryptConfigSecrets } from "../lib/crypto";
import { createHmac, timingSafeEqual } from "node:crypto";

export const whatsappWebhookRoutes = new Hono<AppEnv>();

// Verify Meta's X-Hub-Signature-256 header against the raw body.
// Meta signs the body with HMAC-SHA256 using the WhatsApp App Secret.
// The App Secret is stored in the integration config as `app_secret`.
function verifyMetaSignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  // Header format: "sha256=<hex>"
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const expected = signatureHeader.slice(prefix.length);
  const hmac = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  // Timing-safe comparison to prevent timing attacks.
  if (hmac.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
  } catch {
    return false;
  }
}

// GET / -- Meta webhook verification.
// Meta sends hub.mode=subscribe, hub.verify_token, hub.challenge.
// We must return the challenge if the verify_token matches.
whatsappWebhookRoutes.get("/", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  if (mode !== "subscribe" || !token) {
    return c.text("Missing parameters", 400);
  }

  // Find the integration that has this webhook_verify_token.
  // We need to search across all tenants since the webhook is global.
  const { data: integration } = await supabase
    .from("integrations")
    .select("id, tenant_id, config")
    .eq("type", "whatsapp")
    .eq("active", true)
    .limit(100);

  if (!integration || integration.length === 0) {
    return c.text("No WhatsApp integration found", 403);
  }

  // Find the one with matching verify token.
  const match = integration.find((int) => {
    const config = (int.config ?? {}) as { webhook_verify_token?: string };
    return config.webhook_verify_token === token;
  });

  if (!match) {
    return c.text("Invalid verify token", 403);
  }

  // Return the challenge as plain text.
  return c.text(challenge ?? "", 200);
});

// POST / -- Receive incoming messages and status updates.
// Verifies X-Hub-Signature-256 HMAC before processing.
whatsappWebhookRoutes.post("/", async (c) => {
  try {
    // Read raw body for signature verification BEFORE parsing JSON.
    const rawBody = await c.req.raw.text();
    const signatureHeader = c.req.header("X-Hub-Signature-256");

    // Parse body for processing.
    const body = JSON.parse(rawBody);

    if (body?.object !== "whatsapp_business_account") {
      return c.json({ status: "ignored" }, 200);
    }

    // Find the tenant that owns this WABA ID to get the App Secret for verification.
    const entries = body.entry ?? [];
    const firstWabaId = entries[0]?.id;

    // Fetch all WhatsApp integrations to find the matching one.
    const { data: intData } = await supabase
      .from("integrations")
      .select("id, tenant_id, config")
      .eq("type", "whatsapp")
      .eq("active", true)
      .limit(100);

    const integration = intData?.find((int) => {
      const config = (int.config ?? {}) as { waba_id?: string };
      return config.waba_id === firstWabaId;
    });

    if (!integration) {
      return c.json({ status: "ignored" }, 200); // Unknown WABA, silently ignore
    }

    // Verify HMAC signature with the App Secret from the integration config.
    const config = decryptConfigSecrets((integration.config ?? {}) as Record<string, unknown>) as { app_secret?: string };
    if (!config.app_secret) {
      console.error("WhatsApp webhook: app_secret not configured for integration", integration.id);
      return c.json({ status: "error", message: "App secret not configured" }, 500);
    }

    if (!verifyMetaSignature(rawBody, signatureHeader, config.app_secret)) {
      console.error("WhatsApp webhook: invalid signature");
      return c.json({ status: "error", message: "Invalid signature" }, 401);
    }

    // Signature verified — process the webhook.
    for (const entry of entries) {
      const wabaId = entry.id;
      const changes = entry.changes ?? [];

      // Find the tenant that owns this WABA ID.
      const tenantInt = intData?.find((int) => {
        const cfg = (int.config ?? {}) as { waba_id?: string };
        return cfg.waba_id === wabaId;
      });

      if (!tenantInt) {
        continue; // Unknown WABA, skip
      }

      const tenantId = tenantInt.tenant_id;

      for (const change of changes) {
        const value = change.value;

        // Handle incoming messages.
        if (value?.messages && Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            const phone = msg.from;
            const text = msg.text?.body ?? "";
            const msgId = msg.id;
            const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000).toISOString() : new Date().toISOString();

            // Check for opt-out keywords.
            const optedOut = detectOptOut(text);

            // Idempotency: check if this message was already processed.
            const { data: existing } = await supabase
              .from("whatsapp_messages")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("external_message_id", msgId)
              .maybeSingle();

            if (existing) {
              // Already processed — skip insert (webhook retry dedup).
              continue;
            }

            // Insert inbound message.
            await supabase.from("whatsapp_messages").insert({
              tenant_id: tenantId,
              phone,
              direction: "inbound",
              message: text,
              status: "delivered",
              external_message_id: msgId,
              opt_out_status: optedOut ? "opted_out" : "active",
              last_customer_message_at: timestamp,
              created_at: timestamp,
            });

            // If opted out, update all messages from this phone to opted_out.
            if (optedOut) {
              await supabase
                .from("whatsapp_messages")
                .update({ opt_out_status: "opted_out", updated_at: new Date().toISOString() })
                .eq("tenant_id", tenantId)
                .eq("phone", phone);
            }
          }
        }

        // Handle status updates (sent, delivered, read, failed).
        if (value?.statuses && Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            const msgId = status.id;
            const statusValue = status.status; // "sent", "delivered", "read", "failed"
            const errorCode = status.errors?.[0]?.code;
            const errorMsg = status.errors?.[0]?.message;

            // Update the message status.
            await supabase
              .from("whatsapp_messages")
              .update({
                status: statusValue,
                error_code: errorCode ? String(errorCode) : null,
                error_message: errorMsg ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("tenant_id", tenantId)
              .eq("external_message_id", msgId);
          }
        }
      }

      // Log the webhook event.
      await supabase.from("whatsapp_webhooks").insert({
        tenant_id: tenantId,
        event_type: "message_or_status",
        payload: JSON.stringify(body),
        processed: true,
        processed_at: new Date().toISOString(),
      });
    }

    return c.json({ status: "ok" }, 200);
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return c.json({ status: "error", message: "Internal error" }, 500);
  }
});
