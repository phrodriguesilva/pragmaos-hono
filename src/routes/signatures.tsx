import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Panel, Badge, Modal } from "../components/ui";

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
  expires_at: z.string().optional(),
});

// GET / -- list signature requests with create modal.
signatureRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [reqRes, casesRes, clientsRes, docsRes] = await Promise.all([
    supabase
      .from("signature_requests")
      .select("id, title, signer_name, signer_email, provider, status, sent_at, signed_at")
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("documents").select("id, title").eq("tenant_id", user.tenantId).order("title"),
  ]);

  const requests = reqRes.data ?? [];
  const cases = casesRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const docs = docsRes.data ?? [];

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
    <a href={`/signatures/${r.id}`} class="text-terracota-600 hover:underline">{r.title}</a> as unknown as string,
    r.signer_name ?? r.signer_email,
    providerLabel(r.provider),
    statusBadge(r.status) as unknown as string,
    r.sent_at ? new Date(r.sent_at).toLocaleDateString("pt-BR") : "-",
    r.signed_at ? new Date(r.signed_at).toLocaleDateString("pt-BR") : "-",
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
                  { value: "internal", label: "Interno" },
                  { value: "clicksign", label: "Clicksign" },
                  { value: "docusign", label: "DocuSign" },
                  { value: "govbr", label: "Gov.br" },
                  { value: "icp_brasil", label: "ICP-Brasil" },
                ]}
              />
              <TextField label="Expira em" id="expires_at" name="expires_at" type="date" value={defaultExpires} />
            </div>
            <div class="grid grid-cols-3 gap-4">
              <Select label="Cliente (opcional)" id="client_id" name="client_id"
                options={[{ value: "", label: "Nenhum" }, ...clients.map((cl) => ({ value: cl.id, label: cl.name }))]}
              />
              <Select label="Processo (opcional)" id="case_id" name="case_id"
                options={[{ value: "", label: "Nenhum" }, ...cases.map((cs) => ({ value: cs.id, label: cs.title }))]}
              />
              <Select label="Documento (opcional)" id="document_id" name="document_id"
                options={[{ value: "", label: "Nenhum" }, ...docs.map((d) => ({ value: d.id, label: d.title }))]}
              />
            </div>
          </Modal>
        )}
      />
      <Table
        columns={[
          { label: "Titulo" }, { label: "Signatario" }, { label: "Provedor" },
          { label: "Status" }, { label: "Enviado em" }, { label: "Assinado em" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma solicitacao de assinatura encontrada."
        emptyIcon="ph-pen-nib"
        ariaLabel="Lista de solicitacoes de assinatura"
      />
    </>,
  );
});

// POST / -- create + set status=sent, sent_at=now.
signatureRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = signatureSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/signatures");

  await supabase.from("signature_requests").insert({
    tenant_id: user.tenantId,
    title: parsed.data.title,
    signer_email: parsed.data.signer_email,
    signer_name: parsed.data.signer_name || null,
    provider: parsed.data.provider,
    case_id: parsed.data.case_id || null,
    client_id: parsed.data.client_id || null,
    document_id: parsed.data.document_id || null,
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
    .select("id, title, signer_email, signer_name, provider, status, sent_at, signed_at, expires_at, created_at, case_id, client_id, document_id, cases(title), clients(name), documents(title)")
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
            {caseTitle ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Processo:</dt><dd><a href={`/cases/${req.case_id}`} class="text-terracota-600 hover:underline">{caseTitle}</a></dd></div> : null}
            {clientName ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Cliente:</dt><dd><a href={`/clients/${req.client_id}`} class="text-terracota-600 hover:underline">{clientName}</a></dd></div> : null}
            {docTitle ? <div class="flex gap-2 text-body-sm"><dt class="font-semibold text-gray-700 w-28">Documento:</dt><dd><a href={`/documents/${req.document_id}`} class="text-terracota-600 hover:underline">{docTitle}</a></dd></div> : null}
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
      <Panel title="Linha do Tempo" icon="ph-timeline">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 text-body-sm">
            <i class="ph ph-circle-fill text-carvao-600 text-body-sm" aria-hidden="true"></i>
            <span class="font-semibold text-gray-700">Criada em:</span>
            <span class="text-gray-900">{new Date(req.created_at).toLocaleString("pt-BR")}</span>
          </div>
          {req.sent_at ? (
            <div class="flex items-center gap-2 text-body-sm">
              <i class="ph ph-circle-fill text-blue-500 text-body-sm" aria-hidden="true"></i>
              <span class="font-semibold text-gray-700">Enviada em:</span>
              <span class="text-gray-900">{new Date(req.sent_at).toLocaleString("pt-BR")}</span>
            </div>
          ) : null}
          {req.signed_at ? (
            <div class="flex items-center gap-2 text-body-sm">
              <i class="ph ph-circle-fill text-green-500 text-body-sm" aria-hidden="true"></i>
              <span class="font-semibold text-gray-700">Assinada em:</span>
              <span class="text-gray-900">{new Date(req.signed_at).toLocaleString("pt-BR")}</span>
            </div>
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
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Cancelar esta solicitacao de assinatura?')"><i class="ph ph-x-circle" aria-hidden="true"></i>Cancelar</button>
            </form>
          </div>
        </Panel>
        </div>
      ) : null}
      <div class="mt-4">
      <Panel>
        <form method="post" action={`/signatures/${id}/delete`}>
          <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta solicitacao de assinatura?')"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button>
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
