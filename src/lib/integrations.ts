// Integration services for PragmaOS.
// Real API calls for each integration type.
// Each function receives the integration config (from the database) and
// performs the actual API call.

import { supabase } from "./supabase";
import { fetchWithTimeout, friendlyApiError } from "./fetch-with-timeout";

// --- Type definitions ---

export type IntegrationType =
  | "pje" | "google" | "microsoft"
  | "clicksign" | "docusign" | "whatsapp" | "govbr"
  | "digesto";

export interface IntegrationConfig {
  [key: string]: unknown;
}

export interface SyncResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// --- Field schemas per integration type ---
// Defines which config fields each integration type needs.
// Used by the UI to render type-specific forms.

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "textarea" | "checkbox";
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  default?: string;
}

export const CONFIG_FIELDS: Record<string, ConfigField[]> = {
  clicksign: [
    { key: "access_token", label: "Access Token", type: "password", required: true, placeholder: "Token gerado em Configuracoes > API", help: "Logue em clicksign.com > Configuracoes > API > Gerar Access Token" },
    { key: "environment", label: "Ambiente", type: "select", required: true, default: "sandbox", options: [
      { value: "sandbox", label: "Sandbox (testes)" },
      { value: "production", label: "Producao (validade juridica)" },
    ] },
    { key: "webhook_secret", label: "Webhook HMAC Secret", type: "password", required: false, help: "Secret gerado ao registrar webhook no Clicksign" },
  ],
  docusign: [
    { key: "client_id", label: "Integration Key (Client ID)", type: "text", required: true, placeholder: "UUID da pagina Apps and Keys" },
    { key: "client_secret", label: "Client Secret", type: "password", required: true, help: "UUID gerado na pagina Apps and Keys (so copia 1x)" },
    { key: "account_id", label: "Account ID", type: "text", required: true, placeholder: "GUID da conta DocuSign" },
    { key: "user_id", label: "User ID (para JWT)", type: "text", required: false, help: "GUID do usuario a impersonar (JWT Grant)" },
    { key: "private_key", label: "RSA Private Key (PEM)", type: "textarea", required: false, help: "Chave privada RSA em formato PEM para JWT Grant" },
    { key: "environment", label: "Ambiente", type: "select", required: true, default: "sandbox", options: [
      { value: "sandbox", label: "Sandbox (demo.docusign.net)" },
      { value: "production", label: "Producao" },
    ] },
    { key: "redirect_uri", label: "Redirect URI (OAuth)", type: "text", required: false, placeholder: "https://pragmaos.vercel.app/oauth/docusign/callback" },
  ],
  whatsapp: [
    { key: "access_token", label: "Access Token", type: "password", required: true, help: "Permanent System User Token (Meta Developer Dashboard)" },
    { key: "phone_number_id", label: "Phone Number ID", type: "text", required: true, placeholder: "106540352242922", help: "ID do numero no Meta Developer Dashboard" },
    { key: "waba_id", label: "WhatsApp Business Account ID", type: "text", required: false, placeholder: "102290129340398" },
    { key: "api_version", label: "API Version", type: "text", required: false, default: "v21.0", placeholder: "v21.0" },
    { key: "webhook_verify_token", label: "Webhook Verify Token", type: "text", required: false, help: "Token para verificacao do webhook (hub.verify_token)" },
    { key: "app_secret", label: "App Secret", type: "password", required: false, help: "App Secret do Meta Developer Dashboard — usado para verificar assinatura HMAC do webhook (X-Hub-Signature-256)" },
    { key: "app_secret", label: "App Secret", type: "password", required: false, help: "Para verificacao de assinatura HMAC-SHA256 do webhook" },
  ],
  pje: [
    { key: "username", label: "Usuario CNJ Corporativo", type: "text", required: true, help: "Usuario do CNJ Corporativo para PCP API" },
    { key: "password", label: "Senha", type: "password", required: true },
    { key: "api_base_url", label: "PCP API Base URL", type: "text", required: false, default: "https://comunicaapi.pje.jus.br/api/v1" },
    { key: "certificate_path", label: "Caminho do Certificado (MNI)", type: "text", required: false, help: "Caminho do certificado ICP-Brasil (.pfx) para MNI SOAP" },
    { key: "certificate_password", label: "Senha do Certificado", type: "password", required: false },
    { key: "tribunal", label: "Tribunal (sigla)", type: "text", required: false, placeholder: "TJSP, TJRJ, TRF3..." },
  ],
  google: [
    { key: "client_id", label: "Client ID", type: "text", required: true, help: "OAuth Client ID do Google Cloud Console" },
    { key: "client_secret", label: "Client Secret", type: "password", required: true },
    { key: "redirect_uri", label: "Redirect URI", type: "text", required: true, default: "https://pragmaos.vercel.app/oauth/google/callback" },
    { key: "scopes", label: "Scopes", type: "text", required: false, default: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events" },
    { key: "service_account_email", label: "Service Account Email (opcional)", type: "text", required: false, help: "Para domain-wide delegation" },
  ],
  microsoft: [
    { key: "tenant_id", label: "Tenant ID (Azure AD)", type: "text", required: true },
    { key: "client_id", label: "Client ID (App ID)", type: "text", required: true },
    { key: "client_secret", label: "Client Secret", type: "password", required: true },
    { key: "redirect_uri", label: "Redirect URI", type: "text", required: true, default: "https://pragmaos.vercel.app/oauth/microsoft/callback" },
    { key: "scopes", label: "Scopes", type: "text", required: false, default: "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Calendars.ReadWrite" },
  ],
  govbr: [
    { key: "client_id", label: "Client ID", type: "text", required: true, help: "Fornecido pelo gov.br apos aprovacao" },
    { key: "client_secret", label: "Client Secret", type: "password", required: true },
    { key: "redirect_uri", label: "Redirect URI", type: "text", required: true, default: "https://pragmaos.vercel.app/oauth/govbr/callback" },
    { key: "environment", label: "Ambiente", type: "select", required: true, default: "staging", options: [
      { value: "staging", label: "Homologacao (staging.acesso.gov.br)" },
      { value: "production", label: "Producao (sso.acesso.gov.br)" },
    ] },
    { key: "scopes", label: "Scopes", type: "text", required: false, default: "openid email profile govbr_confiabilidades govbr_confiabilidades_idtoken" },
  ],
  digesto: [
    { key: "api_token", label: "API Token", type: "password", required: true, help: "Bearer token do Digesto Operacoes (op.digesto.com.br)" },
    { key: "base_url", label: "Base URL", type: "text", required: false, default: "https://op.digesto.com.br" },
  ],
};

// --- Sync implementations ---

// Clicksign: list envelopes to verify connectivity.
export async function syncClicksign(config: IntegrationConfig): Promise<SyncResult> {
  const token = config.access_token as string;
  const env = (config.environment as string) ?? "sandbox";
  if (!token) return { success: false, message: "Access Token nao configurado" };

  const baseUrl = env === "production"
    ? "https://app.clicksign.com/api/v3"
    : "https://sandbox.clicksign.com/api/v3";

  try {
    const resp = await fetchWithTimeout(`${baseUrl}/envelopes?per_page=5`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
      },
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { success: false, message: friendlyApiError('Clicksign', resp.status, body) };
    }
    const data = await resp.json() as { data?: unknown[] };
    const count = Array.isArray(data.data) ? data.data.length : 0;
    return { success: true, message: `Conectado com sucesso. ${count} envelope(s) encontrados.`, data };
  } catch (err) {
    return { success: false, message: `Erro de conexao: ${(err as Error).message}` };
  }
}

// WhatsApp: send a test message or verify connectivity.
export async function syncWhatsApp(config: IntegrationConfig): Promise<SyncResult> {
  const token = config.access_token as string;
  const phoneNumberId = config.phone_number_id as string;
  const version = (config.api_version as string) ?? "v21.0";
  if (!token || !phoneNumberId) {
    return { success: false, message: "Access Token e Phone Number ID sao obrigatorios" };
  }

  // Just verify the phone number status (GET request, no message sent).
  try {
    const resp = await fetchWithTimeout(
      `https://graph.facebook.com/${version}/${phoneNumberId}?fields=status,verified_name,display_phone_number`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) {
      const body = await resp.text();
      return { success: false, message: friendlyApiError('WhatsApp', resp.status, body) };
    }
    const data = await resp.json() as { display_phone_number?: string; status?: string };
    return {
      success: true,
      message: `Conectado. Numero: ${data.display_phone_number ?? "?"}, Status: ${data.status ?? "?"}`,
      data,
    };
  } catch (err) {
    return { success: false, message: `Erro de conexao: ${(err as Error).message}` };
  }
}

// --- Main sync dispatcher ---

export async function syncIntegration(type: string, config: IntegrationConfig): Promise<SyncResult> {
  switch (type) {
    case "clicksign": return syncClicksign(config);
    case "whatsapp": return syncWhatsApp(config);
    // Integrations that require OAuth or special access — no real sync yet.
    case "docusign": {
      const token = config.access_token as string;
      if (!token) {
        return { success: false, message: "DocuSign nao conectado. Clique em 'Conectar DocuSign' para autorizar via OAuth." };
      }
      try {
        const env = config.environment as string ?? "sandbox";
        const base = docusignBaseUrl(env);
        const resp = await fetchWithTimeout(`${base}/restapi/v2.1/accounts/${config.account_id}/envelopes?from_date=2024-01-01`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          return { success: false, message: "Token DocuSign expirado. Reconecte a integracao." };
        }
        const data = await resp.json() as { envelopes?: unknown[] };
        return { success: true, message: `Conectado. ${data.envelopes?.length ?? 0} envelopes encontrados.`, data };
      } catch (err) {
        return { success: false, message: `Erro: ${(err as Error).message}` };
      }
    }
    case "google": {
      const token = config.access_token as string;
      if (!token) {
        return { success: false, message: "Google Workspace nao conectado. Clique em 'Conectar Google' para autorizar via OAuth." };
      }
      // Verify token by getting user info
      try {
        const resp = await fetchWithTimeout("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          return { success: false, message: "Token Google expirado. Reconecte a integracao." };
        }
        const data = await resp.json() as { email?: string };
        return { success: true, message: `Conectado como ${data.email}. Scopes: ${(config.scopes as string) ?? "padrao"}.`, data };
      } catch (err) {
        return { success: false, message: `Erro: ${(err as Error).message}` };
      }
    }
    case "microsoft": {
      const token = config.access_token as string;
      if (!token) {
        return { success: false, message: "Microsoft 365 nao conectado. Clique em 'Conectar Microsoft' para autorizar via OAuth." };
      }
      try {
        const resp = await fetchWithTimeout("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          return { success: false, message: "Token Microsoft expirado. Reconecte a integracao." };
        }
        const data = await resp.json() as { userPrincipalName?: string; displayName?: string };
        return { success: true, message: `Conectado como ${data.userPrincipalName ?? data.displayName}.`, data };
      } catch (err) {
        return { success: false, message: `Erro: ${(err as Error).message}` };
      }
    }
    case "govbr":
      return { success: false, message: "Gov.br requer OAuth 2.0 / OIDC. Solicite credenciais em gov.br/governodigital." };
    case "pje":
      return { success: false, message: "PJe requer convenio com tribunal e certificado digital ICP-Brasil." };
    case "digesto": {
      const token = config.api_token as string;
      const baseUrl = (config.base_url as string) ?? "https://op.digesto.com.br";
      if (!token) return { success: false, message: "API Token nao configurado." };
      try {
        const resp = await fetchWithTimeout(`${baseUrl}/api/diario/fontes_recortes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          const body = await resp.text();
          return { success: false, message: friendlyApiError("Digesto", resp.status, "") };
        }
        return { success: true, message: "Conectado ao Digesto com sucesso.", data: await resp.json() };
      } catch (err) {
        return { success: false, message: `Erro de conexao: ${(err as Error).message}` };
      }
    }
    default:
      return { success: false, message: "Tipo de integracao nao suportado para sync." };
  }
}

// --- WhatsApp: send a real message ---

export async function sendWhatsAppMessage(
  config: IntegrationConfig,
  to: string,
  body: string,
): Promise<SyncResult> {
  const token = config.access_token as string;
  const phoneNumberId = config.phone_number_id as string;
  const version = (config.api_version as string) ?? "v21.0";
  if (!token || !phoneNumberId) {
    return { success: false, message: "WhatsApp nao configurado (access_token e phone_number_id obrigatorios)" };
  }

  try {
    const resp = await fetchWithTimeout(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body },
        }),
      },
    );
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("WhatsApp", resp.status, "") };
    }
    const data = await resp.json() as { messages?: { id?: string }[] };
    const msgId = data.messages?.[0]?.id ?? "";
    return { success: true, message: `Mensagem enviada. ID: ${msgId}`, data };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// --- CNJ DataJud: query a process by number ---

export async function queryCNJProcess(
  config: IntegrationConfig,
  processNumber: string,
  tribunal: string,
): Promise<SyncResult> {
  const apiKey = config.api_key as string;
  const baseUrl = (config.base_url as string) ?? "https://api-publica.datajud.cnj.jus.br";
  if (!apiKey) return { success: false, message: "API Key nao configurada" };

  const index = `api_publica_${tribunal.toLowerCase()}`;
  try {
    const resp = await fetchWithTimeout(`${baseUrl}/${index}/_search`, {
      method: "POST",
      headers: {
        Authorization: `APIKey ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          match: {
            "numeroProcesso.keyword": processNumber,
          },
        },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { success: false, message: friendlyApiError("DataJud", resp.status, "") };
    }
    const data = await resp.json() as { hits?: { hits?: { _source?: unknown }[] } };
    const hits = data.hits?.hits ?? [];
    if (hits.length === 0) {
      return { success: true, message: "Processo nao encontrado.", data: [] };
    }
    return { success: true, message: `${hits.length} resultado(s) encontrado(s).`, data: hits.map((h) => h._source) };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// --- Email sending via Gmail API ---

export async function sendGmailEmail(
  config: IntegrationConfig,
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  cc?: string,
): Promise<SyncResult> {
  // Gmail API send endpoint: POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
  // The body must be base64url-encoded raw email (RFC 2822 format)
  const rawEmail = buildRawEmail(to, subject, body, cc);
  const encoded = base64UrlEncode(rawEmail);

  try {
    const resp = await fetchWithTimeout("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("Gmail", resp.status, "") };
    }
    const data = await resp.json() as { id?: string };
    return { success: true, message: `Email enviado via Gmail. ID: ${data.id}`, data };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// --- Email sending via Microsoft Graph ---

export async function sendOutlookEmail(
  config: IntegrationConfig,
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  cc?: string,
): Promise<SyncResult> {
  try {
    const resp = await fetchWithTimeout("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: body },
          toRecipients: [{ emailAddress: { address: to } }],
          ccRecipients: cc ? cc.split(",").map((email) => ({ emailAddress: { address: email.trim() } })) : [],
        },
        saveToSentItems: true,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("Outlook", resp.status, "") };
    }
    return { success: true, message: "Email enviado via Outlook." };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// --- Helper: build raw RFC 2822 email ---

function buildRawEmail(to: string, subject: string, body: string, cc?: string): string {
  const sanitize = (s: string) => s.replace(/[\r\n]/g, " ");
  const lines = [
    `To: ${sanitize(to)}`,
    cc ? `Cc: ${sanitize(cc)}` : "",
    `Subject: ${sanitize(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    body,
  ];
  return lines.filter((l) => l !== undefined && l !== "").join("\r\n");
}

function base64UrlEncode(str: string): string {
  // Convert string to base64, then make it URL-safe
  const b64 = btoa(str);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- DocuSign API ---

export type DocusignConfig = {
  client_id: string;
  client_secret: string;
  account_id: string;
  user_id: string;
  private_key: string;
  environment: string; // "sandbox" or "production"
  redirect_uri: string;
  access_token?: string;
  refresh_token?: string;
};

function docusignBaseUrl(env: string): string {
  return env === "production" ? "https://www.docusign.net" : "https://demo.docusign.net";
}

// Create and send an envelope with a document and signer.
export async function createDocusignEnvelope(
  config: DocusignConfig,
  documentBase64: string,
  documentName: string,
  signerName: string,
  signerEmail: string,
  subject: string,
  message?: string,
): Promise<SyncResult> {
  const base = docusignBaseUrl(config.environment);
  const token = config.access_token;
  if (!token) {
    return { success: false, message: "DocuSign nao conectado. Faca o fluxo OAuth primeiro." };
  }
  try {
    const resp = await fetchWithTimeout(`${base}/restapi/v2.1/accounts/${config.account_id}/envelopes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documents: [{
          documentBase64,
          name: documentName,
          fileExtension: "pdf",
          documentId: "1",
        }],
        recipients: {
          signers: [{
            name: signerName,
            email: signerEmail,
            recipientId: "1",
            routingOrder: "1",
            tabs: {
              signHereTabs: [{
                anchorString: "/s1/",
                anchorUnits: "pixels",
                anchorXOffset: "0",
                anchorYOffset: "0",
              }],
            },
          }],
        },
        emailSubject: subject,
        emailBlurb: message ?? "",
        status: "sent",
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("DocuSign", resp.status, "") };
    }
    const data = await resp.json() as { envelopeId?: string };
    const envelopeId = data.envelopeId;
    if (!envelopeId) {
      return { success: false, message: "DocuSign: envelope ID nao retornado" };
    }
    return { success: true, message: `Envelope enviado: ${envelopeId}`, data: { envelopeId } };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Get envelope status.
export async function getDocusignEnvelopeStatus(
  config: DocusignConfig,
  envelopeId: string,
): Promise<SyncResult> {
  const base = docusignBaseUrl(config.environment);
  const token = config.access_token;
  if (!token) {
    return { success: false, message: "DocuSign nao conectado." };
  }
  try {
    const resp = await fetchWithTimeout(
      `${base}/restapi/v2.1/accounts/${config.account_id}/envelopes/${envelopeId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) {
      return { success: false, message: friendlyApiError("DocuSign status", resp.status, "") };
    }
    const data = await resp.json() as { status?: string };
    return { success: true, message: `Status: ${data.status}`, data };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Get embedded signing URL (recipient view).
export async function getDocusignSigningUrl(
  config: DocusignConfig,
  envelopeId: string,
  signerName: string,
  signerEmail: string,
  returnUrl: string,
): Promise<SyncResult> {
  const base = docusignBaseUrl(config.environment);
  const token = config.access_token;
  if (!token) {
    return { success: false, message: "DocuSign nao conectado." };
  }
  try {
    const resp = await fetchWithTimeout(
      `${base}/restapi/v2.1/accounts/${config.account_id}/envelopes/${envelopeId}/views/recipient`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userName: signerName,
          email: signerEmail,
          returnUrl,
          authenticationMethod: "none",
        }),
      },
    );
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("DocuSign view", resp.status, "") };
    }
    const data = await resp.json() as { url?: string };
    if (!data.url) {
      return { success: false, message: "DocuSign: URL nao retornada" };
    }
    return { success: true, message: "URL de assinatura obtida", data: { url: data.url } };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// --- ClickSign API ---

export type ClicksignConfig = {
  access_token: string;
  environment: string; // "sandbox" or "production"
  webhook_secret?: string;
};

function clicksignBaseUrl(env: string): string {
  return env === "production" ? "https://app.clicksign.com" : "https://sandbox.clicksign.com";
}

// Create a new envelope (folder for documents and signers).
export async function createClicksignEnvelope(
  config: ClicksignConfig,
  title: string,
): Promise<SyncResult> {
  const base = clicksignBaseUrl(config.environment);
  try {
    const resp = await fetchWithTimeout(`${base}/api/v3/envelopes?access_token=${config.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        envelope: { name: title, locale: "pt-br" },
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("ClickSign", resp.status, "") };
    }
    const data = await resp.json() as { envelope?: { id?: string } };
    const envelopeId = data.envelope?.id;
    if (!envelopeId) {
      return { success: false, message: "ClickSign: envelope ID nao retornado" };
    }
    return { success: true, message: `Envelope criado: ${envelopeId}`, data: { envelopeId } };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Upload a document (base64-encoded) to an envelope.
export async function uploadClicksignDocument(
  config: ClicksignConfig,
  envelopeId: string,
  documentBase64: string,
  filename: string,
  mimeType: string = "application/pdf",
): Promise<SyncResult> {
  const base = clicksignBaseUrl(config.environment);
  try {
    const resp = await fetchWithTimeout(`${base}/api/v3/documents?access_token=${config.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document: {
          envelope_id: envelopeId,
          filename,
          content_base64: documentBase64,
          mime_type: mimeType,
        },
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("ClickSign doc", resp.status, "") };
    }
    const data = await resp.json() as { document?: { id?: string } };
    const docId = data.document?.id;
    return { success: true, message: `Documento enviado: ${docId}`, data: { documentId: docId } };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Add a signer to an envelope.
export async function addClicksignSigner(
  config: ClicksignConfig,
  envelopeId: string,
  name: string,
  email: string,
  phone?: string,
): Promise<SyncResult> {
  const base = clicksignBaseUrl(config.environment);
  try {
    const resp = await fetchWithTimeout(`${base}/api/v3/signers?access_token=${config.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signer: {
          envelope_id: envelopeId,
          name,
          email,
          phone_number: phone ?? null,
          auths: [{ type: "email" }],
          delivery: "email",
        },
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("ClickSign signer", resp.status, "") };
    }
    const data = await resp.json() as { signer?: { id?: string; url?: string } };
    return { success: true, message: `Signatario adicionado: ${data.signer?.id}`, data };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Create a signature requirement (links signer to document).
export async function createClicksignRequirement(
  config: ClicksignConfig,
  envelopeId: string,
  documentId: string,
  signerId: string,
): Promise<SyncResult> {
  const base = clicksignBaseUrl(config.environment);
  try {
    const resp = await fetchWithTimeout(`${base}/api/v3/requirements?access_token=${config.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirement: {
          envelope_id: envelopeId,
          document_id: documentId,
          signer_id: signerId,
          action: "sign",
        },
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("ClickSign req", resp.status, "") };
    }
    return { success: true, message: "Requisito de assinatura criado" };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Activate the envelope (sends email to signers).
export async function activateClicksignEnvelope(
  config: ClicksignConfig,
  envelopeId: string,
): Promise<SyncResult> {
  const base = clicksignBaseUrl(config.environment);
  try {
    const resp = await fetchWithTimeout(`${base}/api/v3/envelopes/${envelopeId}?access_token=${config.access_token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelope: { status: "running" } }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("ClickSign activate", resp.status, "") };
    }
    return { success: true, message: "Envelope ativado e enviado aos signatarios" };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Get envelope status.
export async function getClicksignEnvelopeStatus(
  config: ClicksignConfig,
  envelopeId: string,
): Promise<SyncResult> {
  const base = clicksignBaseUrl(config.environment);
  try {
    const resp = await fetchWithTimeout(`${base}/api/v3/envelopes/${envelopeId}?access_token=${config.access_token}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) {
      return { success: false, message: friendlyApiError("ClickSign status", resp.status, "") };
    }
    const data = await resp.json() as { envelope?: { status?: string; signers?: { email?: string; url?: string }[] } };
    return { success: true, message: `Status: ${data.envelope?.status}`, data };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Verify ClickSign webhook signature (HMAC-SHA256).
export async function verifyClicksignWebhook(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!secret || !signature) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Timing-safe comparison
    if (computed.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

// --- WhatsApp Business API compliance functions ---

// Validate phone number in E.164 format (+ followed by 1-15 digits).
export function validateE164(phone: string): boolean {
  return /^\+\d{1,15}$/.test(phone.trim());
}

// Normalize phone to E.164 (add + and country code if missing).
export function normalizePhone(phone: string, defaultCountryCode: string = "55"): string {
  let p = phone.trim().replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.length <= 11) p = defaultCountryCode + p;
  return "+" + p;
}

// Check if within 24-hour customer service window.
// Queries the database for the last inbound message from this phone number.
export async function isWithin24HourWindow(
  tenantId: string,
  phone: string,
): Promise<{ within: boolean; lastMessageAt: Date | null }> {
  const { supabase } = await import("./supabase");
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { within: false, lastMessageAt: null };
  const lastMsg = new Date(data.created_at);
  const hoursSince = (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60);
  return { within: hoursSince < 24, lastMessageAt: lastMsg };
}

// Check if a phone number has opted out.
export async function isOptedOut(
  tenantId: string,
  phone: string,
): Promise<boolean> {
  const { supabase } = await import("./supabase");
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("opt_out_status")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .eq("opt_out_status", "opted_out")
    .limit(1)
    .maybeSingle();
  return !!data;
}

// Detect opt-out keywords in incoming message.
export function detectOptOut(message: string): boolean {
  const optOutKeywords = ["STOP", "PARAR", "ARRET", "DETENER", "CANCEL", "SAIR", "DESCADASTRAR", "UNSUBSCRIBE"];
  const upper = message.trim().toUpperCase();
  return optOutKeywords.some((kw) => upper === kw || upper.startsWith(kw + " "));
}

// Send a template message (required for business-initiated messages outside 24h window).
export async function sendWhatsAppTemplate(
  config: IntegrationConfig,
  to: string,
  templateName: string,
  languageCode: string = "pt_BR",
  components?: { type: string; parameters: { type: string; text?: string }[] }[],
): Promise<SyncResult> {
  const phoneId = config.phone_number_id as string;
  const token = config.access_token as string;
  const version = (config.api_version as string) ?? "v21.0";

  if (!phoneId || !token) {
    return { success: false, message: "WhatsApp: phone_number_id e access_token sao obrigatorios." };
  }

  try {
    const resp = await fetchWithTimeout(
      `https://graph.facebook.com/${version}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: components ?? [],
          },
        }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("WhatsApp", resp.status, "") };
    }

    const data = await resp.json() as { messages?: { id?: string }[] };
    const msgId = data.messages?.[0]?.id;
    return { success: true, message: `Template enviado. ID: ${msgId}`, data: { messageId: msgId } };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Fetch approved templates from Meta.
export async function fetchWhatsAppTemplates(
  config: IntegrationConfig,
): Promise<SyncResult> {
  const wabaId = config.waba_id as string;
  const token = config.access_token as string;
  const version = (config.api_version as string) ?? "v21.0";

  if (!wabaId || !token) {
    return { success: false, message: "WhatsApp: waba_id e access_token sao obrigatorios." };
  }

  try {
    const resp = await fetchWithTimeout(
      `https://graph.facebook.com/${version}/${wabaId}/message_templates`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("WhatsApp templates", resp.status, "") };
    }

    const data = await resp.json() as { data?: { id: string; name: string; status: string; category: string; language: string; components: unknown[] }[] };
    return { success: true, message: `${data.data?.length ?? 0} templates encontrados`, data: data.data };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Submit a new template to Meta for approval.
export async function createWhatsAppTemplate(
  config: IntegrationConfig,
  name: string,
  category: string,
  language: string,
  components: unknown[],
): Promise<SyncResult> {
  const wabaId = config.waba_id as string;
  const token = config.access_token as string;
  const version = (config.api_version as string) ?? "v21.0";

  if (!wabaId || !token) {
    return { success: false, message: "WhatsApp: waba_id e access_token sao obrigatorios." };
  }

  try {
    const resp = await fetchWithTimeout(
      `https://graph.facebook.com/${version}/${wabaId}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, category, language, components }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, message: friendlyApiError("WhatsApp template create", resp.status, "") };
    }

    const data = await resp.json() as { id: string; status: string };
    return { success: true, message: `Template submetido. ID: ${data.id}, Status: ${data.status}`, data };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// --- Diario Oficial ---

export interface DiarioResult {
  external_id: string;
  title: string;
  subtitle?: string;
  section?: string;
  edition?: string;
  publishing_date: string;
  url?: string;
  txt_url?: string;
  excerpt?: string;
}

// Query Querido Diario API (free, no auth required).
export async function queryQueridoDiario(
  queryTerm: string,
  territoryId?: string,
  dateFrom?: string,
  dateTo?: string,
  size: number = 20,
): Promise<SyncResult> {
  const baseUrl = "https://api.queridodiario.ok.org.br/api/gazettes";
  const params = new URLSearchParams();
  params.set("size", String(size));
  if (queryTerm) params.set("keywords", queryTerm);
  if (territoryId) params.set("territory_id", territoryId);
  if (dateFrom) params.set("since", dateFrom);
  if (dateTo) params.set("until", dateTo);

  try {
    const resp = await fetchWithTimeout(`${baseUrl}?${params.toString()}`);
    if (!resp.ok) {
      const body = await resp.text();
      return { success: false, message: friendlyApiError("Querido Diario", resp.status, "") };
    }

    const data = await resp.json() as { gazettes?: { id: string; territorio_nome?: string; municipio?: string; estado?: string; publicacao?: string; titulo?: string; subtitulo?: string; section?: string; edition?: string; url?: string; txt_url?: string; excerpt?: string; content?: string }[]; total?: number };

    const results: DiarioResult[] = (data.gazettes ?? []).map((g) => ({
      external_id: g.id,
      title: g.titulo || g.municipio || g.territorio_nome || "Publicacao",
      subtitle: g.subtitulo,
      section: g.section,
      edition: g.edition,
      publishing_date: g.publicacao ?? "",
      url: g.url,
      txt_url: g.txt_url,
      excerpt: (g.excerpt ?? g.content ?? "").slice(0, 500),
    }));

    return { success: true, message: `${results.length} publicacoes encontradas.`, data: results };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}

// Query Digesto API (paid, requires API token).
export async function queryDigesto(
  apiToken: string,
  queryTerm: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<SyncResult> {
  if (!apiToken) return { success: false, message: "Digesto API Token nao configurado." };
  const baseUrl = "https://op.digesto.com.br/api/diario/busca";
  const params = new URLSearchParams();
  params.set("q", queryTerm);
  if (dateFrom) params.set("data_inicial", dateFrom);
  if (dateTo) params.set("data_final", dateTo);

  try {
    const resp = await fetchWithTimeout(`${baseUrl}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { success: false, message: friendlyApiError("Digesto", resp.status, "") };
    }

    const data = await resp.json() as { results?: { id: string; titulo?: string; subtitulo?: string; secao?: string; edicao?: string; data?: string; url?: string; txt_url?: string; trecho?: string }[]; total?: number };

    const results: DiarioResult[] = (data.results ?? []).map((r) => ({
      external_id: String(r.id),
      title: r.titulo || "Publicacao",
      subtitle: r.subtitulo,
      section: r.secao,
      edition: r.edicao,
      publishing_date: r.data ?? "",
      url: r.url,
      txt_url: r.txt_url,
      excerpt: (r.trecho ?? "").slice(0, 500),
    }));

    return { success: true, message: `${results.length} publicacoes encontradas.`, data: results };
  } catch (err) {
    return { success: false, message: `Erro: ${(err as Error).message}` };
  }
}
