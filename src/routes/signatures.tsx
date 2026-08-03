import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { caseBelongsToTenant, clientBelongsToTenant, documentBelongsToTenant } from "../lib/tenant-ownership";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";
import {
  createClicksignEnvelope,
  uploadClicksignDocument,
  addClicksignSigner,
  createClicksignRequirement,
  activateClicksignEnvelope,
  getClicksignEnvelopeStatus,
  createDocusignEnvelope,
  getDocusignEnvelopeStatus,
  type ClicksignConfig,
  type DocusignConfig,
} from "../lib/integrations";

export const signatureRoutes = new Hono<AppEnv>();

signatureRoutes.use("*", requireAuth);

const signatureSchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio"),
  signer_email: z.string().email("E-mail do signatario invalido"),
  signer_name: z.string().optional(),
  provider: z.enum(["internal", "clicksign", "docusign", "govbr", "icp_brasil"]),
  case_id: z.string().optional(),
  client_id: z.string().optional(),
  document_id: z.string().optional(),
  document_name: z.string().optional(),
  message: z.string().optional(),
  expires_at: z.string().optional(),
});

// GET / -- list signature requests with create modal.
signatureRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let reqQuery = supabase
    .from("signature_requests")
    .select("id, title, signer_name, signer_email, provider, status, sent_at, signed_at", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  if (search) reqQuery = reqQuery.or(`title.ilike.%${search}%,signer_name.ilike.%${search}%`);

  reqQuery = reqQuery.range(offset, offset + limit - 1);

  const [reqRes, casesRes, clientsRes, docsRes, clicksignInt, docusignInt] = await Promise.all([
    reqQuery,
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("documents").select("id, title").eq("tenant_id", user.tenantId).order("title"),
    supabase.from("integrations").select("id").eq("tenant_id", user.tenantId).eq("type", "clicksign").eq("active", true).limit(1).maybeSingle(),
    supabase.from("integrations").select("id").eq("tenant_id", user.tenantId).eq("type", "docusign").eq("active", true).limit(1).maybeSingle(),
  ]);

  const requests = reqRes.data ?? [];
  const count = reqRes.count;
  const totalPages = count ? Math.ceil(count / limit) : 1;
  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const docs = docsRes.data ?? [];
  const hasClicksign = !!clicksignInt.data;
  const hasDocusign = !!docusignInt.data;

  const defaultExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const statusBadge = (status: string) => {
    const map: Record<string, { color: "yellow" | "blue" | "green" | "red" | "gray"; label: string }> = {
      pending: { color: "yellow", label: "Pendente" },
      sent: { color: "blue", label: "Enviado" },
      signed: { color: "green", label: "Assinado" },
      rejected: { color: "red", label: "Rejeitado" },
      expired: { color: "gray", label: "Expirado" },
      cancelled: { color: "gray", label: "Cancelado" },
    };
    const cfg = map[status] ?? { color: "gray" as const, label: status };
    return <Badge color={cfg.color}>{cfg.label}</Badge>;
  };

  const providerLabel = (p: string) => {
    const map: Record<string, string> = {
      internal: "Interno",
      clicksign: "Clicksign",
      docusign: "DocuSign",
      govbr: "Gov.br",
      icp_brasil: "ICP-Brasil",
    };
    return map[p] ?? p;
  };

  const rows = requests.map((r) => [
    <a href={`/signatures/${r.id}`} class="text-[#0568ff] hover:underline">{r.title}</a> as unknown as string,
    r.signer_name ?? r.signer_email,
    providerLabel(r.provider),
    statusBadge(r.status) as unknown as string,
    r.sent_at ? new Date(r.sent_at).toLocaleDateString("pt-BR") : "-",
    r.signed_at ? new Date(r.signed_at).toLocaleDateString("pt-BR") : "-",
    <div class="flex items-center gap-2">
      <a href={`/signatures/${r.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <form method="post" action={`/signatures/${r.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Assinaturas Digitais", active: "signatures" },
    <>
      <PageHeader
        title="Assinaturas Digitais"
        icon="ph-pen-nib"
        actions={() => (
          <Modal
            id="newSignature"
            title="Nova Solicitacao"
            icon="ph-pen-nib"
            triggerText="Nova Solicitacao"
            triggerIcon="ph-plus"
            action="/signatures"
            submitLabel="Enviar"
            submitIcon="ph-paper-plane-tilt"
            large
          >
            <TextField label="Titulo" id="title" name="title" required placeholder="Titulo do documento para assinatura" />
            <div class="grid grid-cols-2 gap-4">
              <TextField label="Nome do Signatario" id="signer_name" name="signer_name" placeholder="Nome completo" icon="ph-user" />
              <TextField label="E-mail do Signatario" id="signer_email" name="signer_email" type="email" required placeholder="signatario@email.com" icon="ph-envelope" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <Select label="Provedor" id="provider" name="provider" required
                options={[
                  { value: "internal", label: "Interno - Manual" },
                  ...(hasClicksign ? [{ value: "clicksign", label: "ClickSign" }] : []),
                  ...(hasDocusign ? [{ value: "docusign", label: "DocuSign" }] : []),
                ]}
              />
              <TextField label="Expira em" id="expires_at" name="expires_at" type="date" value={defaultExpires} />
            </div>
            <div class="grid grid-cols-3 gap-4">
              <ComboBox label="Cliente (opcional)" id="client_id" name="client_id"
                options={[{ value: "", label: "Nenhum" }, ...clients.map((cl) => ({ value: cl.id, label: cl.name }))]}
              />
              <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
                options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
              />
              <ComboBox label="Documento (opcional)" id="document_id" name="document_id"
                options={[{ value: "", label: "Nenhum" }, ...docs.map((d) => ({ value: d.id, label: d.title }))]}
              />
            </div>
          </Modal>
        )}
      />
      <form method="get" action="/signatures" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Titulo ou signatario..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Titulo" }, { label: "Signatario" }, { label: "Provedor" },
          { label: "Status" }, { label: "Enviado em" }, { label: "Assinado em" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma solicitacao de assinatura encontrada."
        emptyIcon="ph-pen-nib"
        ariaLabel="Lista de solicitacoes de assinatura"
        count={count ?? 0}
        countLabel="assinatura(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/signatures",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST / -- create + set status=sent, sent_at=now.
signatureRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = signatureSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados invalidos";
    return c.redirect(`/signatures?error=${encodeURIComponent(firstError)}`);
  }

  // Validate IDOR-relevant foreign keys.
  if (parsed.data.case_id) {
    const owns = await caseBelongsToTenant(parsed.data.case_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }
  if (parsed.data.client_id) {
    const owns = await clientBelongsToTenant(parsed.data.client_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }
  if (parsed.data.document_id) {
    const owns = await documentBelongsToTenant(parsed.data.document_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }

  await supabase.from("signature_requests").insert({
    tenant_id: user.tenantId,
    title: parsed.data.title,
    signer_email: parsed.data.signer_email,
    signer_name: parsed.data.signer_name || null,
    provider: parsed.data.provider,
    case_id: parsed.data.case_id || null,
    client_id: parsed.data.client_id || null,
    document_id: parsed.data.document_id || null,
    document_name: parsed.data.document_name || null,
    message: parsed.data.message || null,
    expires_at: parsed.data.expires_at || null,
    status: "sent",
    sent_at: new Date().toISOString(),
  });

  return c.redirect("/signatures");
});

// GET /:id -- detail.
signatureRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: req } = await supabase
    .from("signature_requests")
    .select("id, title, signer_email, signer_name, provider, status, sent_at, signed_at, expires_at, created_at, case_id, client_id, document_id, external_envelope_id, external_document_id, signing_url, sync_status, last_synced_at, message, cases(title), clients(name), documents(title)")
    .eq("id", id).eq("tenant_id", user.tenantId).single();

  if (!req) return c.html("Solicitacao nao encontrada.", 404);

  const caseTitle = (req.cases as unknown as { title: string } | null)?.title;
  const clientName = (req.clients as unknown as { name: string } | null)?.name;
  const docTitle = (req.documents as unknown as { title: string } | null)?.title;

  const providerLabel = (p: string) => {
    const map: Record<string, string> = {
      internal: "Interno", clicksign: "Clicksign", docusign: "DocuSign",
      govbr: "Gov.br", icp_brasil: "ICP-Brasil",
    };
    return map[p] ?? p;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { color: "yellow" | "blue" | "green" | "red" | "gray"; label: string }> = {
      pending: { color: "yellow", label: "Pendente" },
      sent: { color: "blue", label: "Enviado" },
      signed: { color: "green", label: "Assinado" },
      rejected: { color: "red", label: "Rejeitado" },
      expired: { color: "gray", label: "Expirado" },
      cancelled: { color: "gray", label: "Cancelado" },
    };
    const cfg = map[status] ?? { color: "gray" as const, label: status };
    return <Badge color={cfg.color}>{cfg.label}</Badge>;
  };

  const canAct = req.status === "pending" || req.status === "sent";

  const syncBadge = (sync: string) => {
    const map: Record<string, { color: "yellow" | "blue" | "green" | "red" | "gray"; label: string }> = {
      pending: { color: "yellow", label: "Pendente" },
      synced: { color: "green", label: "Sincronizado" },
      error: { color: "red", label: "Erro" },
    };
    const cfg = map[sync] ?? { color: "gray" as const, label: sync };
    return <Badge color={cfg.color}>{cfg.label}</Badge>;
  };

  return renderPage(
    c,
    { title: req.title, active: "signatures" },
    <>
      <PageHeader title={req.title} icon="ph-pen-nib" />
      <div class="grid grid-cols-2 gap-4">
        <Panel title="Dados da Solicitacao" icon="ph-pen-nib">
          <dl class="flex flex-col gap-2">
            <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Titulo:</dt><dd class="text-gray-900">{req.title}</dd></div>
            <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Provedor:</dt><dd class="text-gray-900">{providerLabel(req.provider)}</dd></div>
            <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Status:</dt><dd>{statusBadge(req.status)}</dd></div>
            <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Expira em:</dt><dd class="text-gray-900">{req.expires_at ? new Date(req.expires_at).toLocaleDateString("pt-BR") : "-"}</dd></div>
            {caseTitle ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Processo:</dt><dd><a href={`/cases/${req.case_id}`} class="text-[#0568ff] hover:underline">{caseTitle}</a></dd></div> : null}
            {clientName ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Cliente:</dt><dd><a href={`/clients/${req.client_id}`} class="text-[#0568ff] hover:underline">{clientName}</a></dd></div> : null}
            {docTitle ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Documento:</dt><dd><a href={`/documents/${req.document_id}`} class="text-[#0568ff] hover:underline">{docTitle}</a></dd></div> : null}
            {req.external_envelope_id ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Envelope ID:</dt><dd class="text-gray-900 font-mono text-body-xs">{req.external_envelope_id}</dd></div> : null}
            {req.sync_status ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Sincronizacao:</dt><dd>{syncBadge(req.sync_status)}</dd></div> : null}
            {req.last_synced_at ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Ult. Sync:</dt><dd class="text-gray-900">{new Date(req.last_synced_at).toLocaleString("pt-BR")}</dd></div> : null}
          </dl>
        </Panel>
        <Panel title="Signatario" icon="ph-user">
          <dl class="flex flex-col gap-2">
            <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Nome:</dt><dd class="text-gray-900">{req.signer_name ?? "-"}</dd></div>
            <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">E-mail:</dt><dd class="text-gray-900">{req.signer_email}</dd></div>
          </dl>
        </Panel>
      </div>
      <div class="mt-4">
      <Panel title="Linha do Tempo" icon="ph-list-dashes">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 text-body-sm">
            <i class="ph-bold ph-circle text-[#0568ff] text-body-sm" aria-hidden="true"></i>
            <span class="font-semibold text-gray-700">Criada em:</span>
            <span class="text-gray-900">{new Date(req.created_at).toLocaleString("pt-BR")}</span>
          </div>
          {req.sent_at ? (
            <div class="flex items-center gap-2 text-body-sm">
              <i class="ph-bold ph-circle text-blue-500 text-body-sm" aria-hidden="true"></i>
              <span class="font-semibold text-gray-700">Enviada em:</span>
              <span class="text-gray-900">{new Date(req.sent_at).toLocaleString("pt-BR")}</span>
            </div>
          ) : null}
          {req.signed_at ? (
            <div class="flex items-center gap-2 text-body-sm">
              <i class="ph-bold ph-circle text-green-500 text-body-sm" aria-hidden="true"></i>
              <span class="font-semibold text-gray-700">Assinada em:</span>
              <span class="text-gray-900">{new Date(req.signed_at).toLocaleString("pt-BR")}</span>
            </div>
          ) : null}
        </div>
      </Panel>
      </div>
      <div class="mt-4">
      <Panel title="Integracao" icon="ph-plugs-connected">
        <div class="flex flex-wrap gap-2">
          {req.provider === "clicksign" && !req.external_envelope_id ? (
            <form method="post" action={`/signatures/${id}/send-to-clicksign`}>
              <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Enviar via ClickSign</button>
            </form>
          ) : null}
          {req.provider === "docusign" && !req.external_envelope_id ? (
            <form method="post" action={`/signatures/${id}/send-to-docusign`}>
              <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Enviar via DocuSign</button>
            </form>
          ) : null}
          {req.external_envelope_id ? (
            <form method="post" action={`/signatures/${id}/check-status`}>
              <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Verificar Status</button>
            </form>
          ) : null}
          {req.signing_url ? (
            <a href={req.signing_url} target="_blank" rel="noopener noreferrer" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-sign-in" aria-hidden="true"></i>Abrir para Assinar</a>
          ) : null}
        </div>
      </Panel>
      </div>
      {canAct ? (
        <div class="mt-4">
        <Panel>
          <div class="flex gap-2">
            <form method="post" action={`/signatures/${id}/resend`}>
              <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Reenviar</button>
            </form>
            <form method="post" action={`/signatures/${id}/sign`}>
              <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-check-circle" aria-hidden="true"></i>Marcar como Assinado</button>
            </form>
            <form method="post" action={`/signatures/${id}/cancel`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Cancelar esta solicitacao de assinatura?')" aria-label="Cancelar"><i class="ph ph-x-circle" aria-hidden="true"></i>Cancelar</button>
            </form>
          </div>
        </Panel>
        </div>
      ) : null}
      <div class="mt-4">
      <Panel>
        <form method="post" action={`/signatures/${id}/delete`}>
          <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta solicitacao de assinatura?')" aria-label="Excluir"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button>
        </form>
      </Panel>
      </div>
    </>,
  );
});

// POST /:id/resend -- update sent_at=now.
signatureRoutes.post("/:id/resend", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("signature_requests")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect(`/signatures/${id}`);
});

// POST /:id/sign -- set status=signed, signed_at=now.
signatureRoutes.post("/:id/sign", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("signature_requests")
    .update({ status: "signed", signed_at: new Date().toISOString() })
    .eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect(`/signatures/${id}`);
});

// POST /:id/cancel -- set status=cancelled.
signatureRoutes.post("/:id/cancel", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("signature_requests")
    .update({ status: "cancelled" })
    .eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect(`/signatures/${id}`);
});

// POST /:id/delete -- delete.
signatureRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("signature_requests")
    .delete()
    .eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/signatures");
});

// POST /:id/send-to-clicksign -- send signature request to ClickSign.
signatureRoutes.post("/:id/send-to-clicksign", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: sig } = await supabase
    .from("signature_requests")
    .select("*")
    .eq("id", id).eq("tenant_id", user.tenantId).single();
  if (!sig) return c.redirect("/signatures");

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", user.tenantId)
    .eq("type", "clicksign")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return c.redirect(`/signatures/${id}?error=${encodeURIComponent("Integracao ClickSign nao encontrada ou inativa")}`);
  }

  const config = integration.config as ClicksignConfig;

  try {
    // 1. Create envelope
    const envRes = await createClicksignEnvelope(config, sig.title);
    if (!envRes.success || !envRes.data) {
      return c.redirect(`/signatures/${id}?error=${encodeURIComponent(envRes.message)}`);
    }
    const envelopeId = (envRes.data as { envelopeId: string }).envelopeId;

    // 2. Upload document
    let documentId = "";
    if (sig.document_id) {
      const { data: doc } = await supabase
        .from("documents")
        .select("title, file_url, storage_path")
        .eq("id", sig.document_id).eq("tenant_id", user.tenantId).single();
      if (doc?.file_url) {
        try {
          const docResp = await fetch(doc.file_url);
          if (docResp.ok) {
            const buf = await docResp.arrayBuffer();
            const docBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            const docName = (doc.title ?? sig.title) + ".pdf";
            const upRes = await uploadClicksignDocument(config, envelopeId, docBase64, docName, "application/pdf");
            if (upRes.success && upRes.data) {
              documentId = (upRes.data as { documentId?: string }).documentId ?? "";
            }
          }
        } catch {
          // fall through to placeholder document
        }
      }
    }

    // If no document was uploaded, create a simple text document.
    if (!documentId) {
      const placeholderText = `Documento: ${sig.title}\n\nEste documento foi gerado para assinatura via PragmaOS.\nSignatario: ${sig.signer_name ?? sig.signer_email}`;
      const placeholderBase64 = btoa(unescape(encodeURIComponent(placeholderText)));
      const upRes = await uploadClicksignDocument(config, envelopeId, placeholderBase64, `${sig.title}.txt`, "text/plain");
      if (upRes.success && upRes.data) {
        documentId = (upRes.data as { documentId?: string }).documentId ?? "";
      }
    }

    if (!documentId) {
      return c.redirect(`/signatures/${id}?error=${encodeURIComponent("Falha ao enviar documento para ClickSign")}`);
    }

    // 3. Add signer
    const signerRes = await addClicksignSigner(config, envelopeId, sig.signer_name ?? sig.signer_email, sig.signer_email);
    if (!signerRes.success || !signerRes.data) {
      return c.redirect(`/signatures/${id}?error=${encodeURIComponent(signerRes.message)}`);
    }
    const signerData = signerRes.data as { id?: string; url?: string };
    const signerId = signerData.id ?? "";
    const signerUrl = signerData.url ?? "";

    // 4. Create requirement
    const reqRes = await createClicksignRequirement(config, envelopeId, documentId, signerId);
    if (!reqRes.success) {
      return c.redirect(`/signatures/${id}?error=${encodeURIComponent(reqRes.message)}`);
    }

    // 5. Activate envelope
    const actRes = await activateClicksignEnvelope(config, envelopeId);
    if (!actRes.success) {
      return c.redirect(`/signatures/${id}?error=${encodeURIComponent(actRes.message)}`);
    }

    // 6. Update signature request
    await supabase.from("signature_requests").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      external_envelope_id: envelopeId,
      external_document_id: documentId,
      signing_url: signerUrl,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
    }).eq("id", id);

    return c.redirect(`/signatures/${id}?success=${encodeURIComponent("Enviado para ClickSign com sucesso")}`);
  } catch (err) {
    return c.redirect(`/signatures/${id}?error=${encodeURIComponent(`Erro: ${(err as Error).message}`)}`);
  }
});

// POST /:id/send-to-docusign -- send signature request to DocuSign.
signatureRoutes.post("/:id/send-to-docusign", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: sig } = await supabase
    .from("signature_requests")
    .select("*")
    .eq("id", id).eq("tenant_id", user.tenantId).single();
  if (!sig) return c.redirect("/signatures");

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", user.tenantId)
    .eq("type", "docusign")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return c.redirect(`/signatures/${id}?error=${encodeURIComponent("Integracao DocuSign nao encontrada ou inativa")}`);
  }

  const config = integration.config as DocusignConfig;

  try {
    // Fetch document content if available
    let docBase64 = "";
    let docName = (sig.title ?? "documento") + ".pdf";
    if (sig.document_id) {
      const { data: doc } = await supabase
        .from("documents")
        .select("title, file_url, storage_path")
        .eq("id", sig.document_id).eq("tenant_id", user.tenantId).single();
      if (doc?.file_url) {
        try {
          const docResp = await fetch(doc.file_url);
          if (docResp.ok) {
            const buf = await docResp.arrayBuffer();
            docBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            docName = (doc.title ?? sig.title) + ".pdf";
          }
        } catch {
          // fall through to placeholder
        }
      }
    }

    // If no document, create a simple text PDF placeholder.
    if (!docBase64) {
      const placeholderText = `Documento: ${sig.title}\n\nDocumento gerado para assinatura via PragmaOS.\nSignatario: ${sig.signer_name ?? sig.signer_email}`;
      docBase64 = btoa(unescape(encodeURIComponent(placeholderText)));
      docName = `${sig.title}.txt`;
    }

    const subject = `Solicitacao de Assinatura: ${sig.title}`;
    const message = sig.message ?? "Por favor, assine o documento anexado.";

    const envRes = await createDocusignEnvelope(
      config,
      docBase64,
      docName,
      sig.signer_name ?? sig.signer_email,
      sig.signer_email,
      subject,
      message,
    );

    if (!envRes.success || !envRes.data) {
      return c.redirect(`/signatures/${id}?error=${encodeURIComponent(envRes.message)}`);
    }
    const envelopeId = (envRes.data as { envelopeId: string }).envelopeId;

    await supabase.from("signature_requests").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      external_envelope_id: envelopeId,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
    }).eq("id", id);

    return c.redirect(`/signatures/${id}?success=${encodeURIComponent("Enviado para DocuSign com sucesso")}`);
  } catch (err) {
    return c.redirect(`/signatures/${id}?error=${encodeURIComponent(`Erro: ${(err as Error).message}`)}`);
  }
});

// POST /:id/check-status -- check status from provider and update.
signatureRoutes.post("/:id/check-status", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: sig } = await supabase
    .from("signature_requests")
    .select("*")
    .eq("id", id).eq("tenant_id", user.tenantId).single();
  if (!sig) return c.redirect("/signatures");

  if (!sig.external_envelope_id) {
    return c.redirect(`/signatures/${id}?error=${encodeURIComponent("Nenhum envelope externo vinculado")}`);
  }

  // Prevent status sync on already-final signatures
  if (sig.status === "signed" || sig.status === "rejected" || sig.status === "cancelled") {
    return c.redirect(`/signatures/${id}?error=${encodeURIComponent("Assinatura ja finalizada (status: " + sig.status + ")")}`);
  }

  try {
    let mappedStatus = sig.status;

    if (sig.provider === "clicksign") {
      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("tenant_id", user.tenantId)
        .eq("type", "clicksign")
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (!integration) {
        return c.redirect(`/signatures/${id}?error=${encodeURIComponent("Integracao ClickSign nao encontrada")}`);
      }
      const config = integration.config as ClicksignConfig;
      const statusRes = await getClicksignEnvelopeStatus(config, sig.external_envelope_id);
      if (!statusRes.success) {
        return c.redirect(`/signatures/${id}?error=${encodeURIComponent(statusRes.message)}`);
      }
      const providerStatus = (statusRes.data as { envelope?: { status?: string } })?.envelope?.status ?? "";
      const clicksignMap: Record<string, string> = {
        running: "sent",
        closed: "signed",
        canceled: "cancelled",
      };
      mappedStatus = clicksignMap[providerStatus] ?? sig.status;
    } else if (sig.provider === "docusign") {
      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("tenant_id", user.tenantId)
        .eq("type", "docusign")
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (!integration) {
        return c.redirect(`/signatures/${id}?error=${encodeURIComponent("Integracao DocuSign nao encontrada")}`);
      }
      const config = integration.config as DocusignConfig;
      const statusRes = await getDocusignEnvelopeStatus(config, sig.external_envelope_id);
      if (!statusRes.success) {
        return c.redirect(`/signatures/${id}?error=${encodeURIComponent(statusRes.message)}`);
      }
      const providerStatus = (statusRes.data as { status?: string })?.status ?? "";
      const docusignMap: Record<string, string> = {
        completed: "signed",
        declined: "rejected",
        voided: "cancelled",
        sent: "sent",
        delivered: "sent",
      };
      mappedStatus = docusignMap[providerStatus] ?? sig.status;
    } else {
      return c.redirect(`/signatures/${id}?error=${encodeURIComponent("Verificacao de status nao suportada para este provedor")}`);
    }

    const updateData: Record<string, unknown> = {
      status: mappedStatus,
      last_synced_at: new Date().toISOString(),
      sync_status: "synced",
    };
    if (mappedStatus === "signed") {
      updateData.signed_at = new Date().toISOString();
    }

    await supabase.from("signature_requests").update(updateData).eq("id", id).eq("tenant_id", user.tenantId);

    // Audit trail: log the status change
    await supabase.from("audit_log").insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      action: "signature_status_synced",
      entity_type: "signature_requests",
      entity_id: id,
      details: { from: sig.status, to: mappedStatus, provider: sig.provider },
    });

    return c.redirect(`/signatures/${id}?success=${encodeURIComponent(`Status atualizado: ${mappedStatus}`)}`);
  } catch (err) {
    return c.redirect(`/signatures/${id}?error=${encodeURIComponent(`Erro: ${(err as Error).message}`)}`);
  }
});
