// Proactive WhatsApp notifications.
// When a case movement occurs (from MNI/Diario), the AI analyzes it and
// generates a client-friendly message, which is sent via WhatsApp.
//
// Flow: movement detected -> AI generates summary -> send WhatsApp message
//
// PragmaOS 2.

import { supabase } from "./supabase";
import { log } from "./logger";
import { callLLM, getTenantLLMConfig, maskPII, unmaskPII, type ClientPII } from "./ai";
import { sendWhatsAppMessage, isOptedOut, normalizePhone, validateE164, type IntegrationConfig } from "./integrations";

export interface MovementInfo {
  caseId: string;
  caseTitle: string;
  caseNumber: string;
  movementText: string;
  movementDate: string;
  clientName: string;
  clientPhone?: string;
  clientCpf?: string;
}

export interface ProactiveNotificationResult {
  sent: boolean;
  message?: string;
  error?: string;
  aiSummary?: string;
  skipped?: boolean;
  skipReason?: string;
}

// Generate a client-friendly summary of a movement using AI.
// The message is written in plain Portuguese, avoiding legal jargon.
export async function generateMovementSummary(
  tenantId: string,
  movement: MovementInfo,
): Promise<string | null> {
  const llmConfig = await getTenantLLMConfig(tenantId);
  if (!llmConfig || !llmConfig.apiKey) {
    log.warn("Cannot generate movement summary — no AI key configured", { tenantId });
    return null;
  }

  // Mask PII before sending to LLM.
  const pii: ClientPII = {
    name: movement.clientName,
    cpf: movement.clientCpf,
    phone: movement.clientPhone,
  };
  const { maskedText, maskMap } = maskPII(movement.movementText, pii);

  const systemPrompt = "Você é um assistente jurídico. Explique movimentos processuais para clientes de forma clara e tranquila, em português, sem jargão jurídico. Seja breve (máximo 2 frases). Não use formatação. Comece com uma saudação amigável.";
  const userPrompt = `Processo: ${movement.caseNumber}\nMovimento: ${maskedText}\n\nEscreva a mensagem para o cliente [NOME_CLIENTE]:`;

  try {
    const { reply } = await callLLM(systemPrompt, userPrompt, llmConfig);

    if (!reply || reply.startsWith("Erro") || reply.startsWith("IA nao")) {
      log.warn("AI returned error for movement summary", { tenantId, reply: reply.slice(0, 100) });
      return null;
    }

    // Unmask PII to restore client name in the final message.
    return unmaskPII(reply, maskMap);
  } catch (err) {
    log.error("Failed to generate movement summary", {
      tenantId,
      caseId: movement.caseId,
      error: (err as Error).message,
    });
    return null;
  }
}

// Check if a movement has already been notified (avoid duplicates).
async function isAlreadyNotified(tenantId: string, caseId: string, movementText: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("metadata->>case_id", caseId)
    .eq("metadata->>movement_text", movementText)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

// Send a proactive WhatsApp notification for a case movement.
// This is the main entry point — called when a new movement is detected.
export async function sendProactiveNotification(
  tenantId: string,
  movement: MovementInfo,
): Promise<ProactiveNotificationResult> {
  // 1. Check if client has a valid phone.
  if (!movement.clientPhone) {
    return { sent: false, skipped: true, skipReason: "Cliente sem telefone cadastrado" };
  }

  const normalizedPhone = normalizePhone(movement.clientPhone);
  if (!validateE164(normalizedPhone)) {
    return { sent: false, skipped: true, skipReason: "Telefone invalido" };
  }

  // 2. Check opt-out.
  if (await isOptedOut(tenantId, normalizedPhone)) {
    return { sent: false, skipped: true, skipReason: "Cliente optou por nao receber mensagens" };
  }

  // 3. Check if already notified (dedup).
  if (await isAlreadyNotified(tenantId, movement.caseId, movement.movementText)) {
    return { sent: false, skipped: true, skipReason: "Movimento ja notificado" };
  }

  // 4. Get WhatsApp integration config.
  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("type", "whatsapp")
    .eq("active", true)
    .maybeSingle();

  if (!integration?.config) {
    return { sent: false, skipped: true, skipReason: "WhatsApp nao configurado" };
  }

  const whatsappConfig = integration.config as IntegrationConfig;

  // 5. Generate AI summary.
  const aiSummary = await generateMovementSummary(tenantId, movement);
  if (!aiSummary) {
    // Fallback: send a generic message without AI.
    const fallbackMsg = `Olá! Há uma nova atualização no seu processo ${movement.caseNumber}. Entre em contato para mais detalhes.`;
    const result = await sendWhatsAppMessage(whatsappConfig, normalizedPhone, fallbackMsg);
    if (!result.success) {
      return { sent: false, error: result.message };
    }

    // Log the message in the database.
    await logMessage(tenantId, normalizedPhone, fallbackMsg, movement, "fallback");

    return { sent: true, message: fallbackMsg, aiSummary: undefined };
  }

  // 6. Send via WhatsApp.
  const result = await sendWhatsAppMessage(whatsappConfig, normalizedPhone, aiSummary);
  if (!result.success) {
    return { sent: false, error: result.message };
  }

  // 7. Log the message in the database.
  await logMessage(tenantId, normalizedPhone, aiSummary, movement, "ai_generated");

  log.info("Proactive WhatsApp notification sent", {
    tenantId,
    caseId: movement.caseId,
    phone: normalizedPhone,
  });

  return { sent: true, message: aiSummary, aiSummary };
}

// Log a sent message in the whatsapp_messages table.
async function logMessage(
  tenantId: string,
  phone: string,
  message: string,
  movement: MovementInfo,
  source: "ai_generated" | "fallback",
): Promise<void> {
  try {
    await supabase.from("whatsapp_messages").insert({
      tenant_id: tenantId,
      direction: "outbound",
      phone,
      message,
      status: "sent",
      source: "proactive_notification",
      metadata: {
        case_id: movement.caseId,
        case_number: movement.caseNumber,
        movement_text: movement.movementText,
        movement_date: movement.movementDate,
        source,
      },
    });
  } catch (err) {
    log.error("Failed to log proactive notification", {
      tenantId,
      error: (err as Error).message,
    });
  }
}

// Batch process: check for new movements and send notifications.
// This can be called by a cron job or after MNI sync.
export async function processNewMovementsForNotification(
  tenantId: string,
  movements: MovementInfo[],
): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const movement of movements) {
    const result = await sendProactiveNotification(tenantId, movement);
    if (result.sent) {
      sent++;
    } else if (result.skipped) {
      skipped++;
    } else {
      failed++;
    }
  }

  log.info("Proactive notification batch processed", {
    tenantId,
    total: movements.length,
    sent,
    skipped,
    failed,
  });

  return { sent, skipped, failed };
}
