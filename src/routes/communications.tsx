import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const communicationsRoutes = new Hono<AppEnv>();

communicationsRoutes.use("*", requireAuth);

const commSchema = z.object({
  case_id: z.string().optional(),
  client_id: z.string().optional(),
  channel: z.string().min(1, "Canal e obrigatorio"),
  direction: z.enum(["inbound", "outbound"]),
  message_body: z.string().min(1, "Mensagem e obrigatoria"),
});

communicationsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const { data: logs } = await supabase
    .from("communications_log")
    .select("id, channel, direction, message_body, status, sent_at, cases(title), clients(name)")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(50);

  const rows = (logs ?? []).map((l) => [
    new Date(l.sent_at).toLocaleString("pt-BR"),
    l.channel,
    <Badge color={l.direction === "inbound" ? "blue" : "gray"}>{l.direction === "inbound" ? "Recebida" : "Enviada"}</Badge> as unknown as string,
    (l.cases as unknown as { title: string } | null)?.title ?? "-",
    (l.clients as unknown as { name: string } | null)?.name ?? "-",
    l.message_body.length > 60 ? l.message_body.slice(0, 60) + "..." : l.message_body,
  ]);

  return renderPage(
    c,
    { title: "Comunicacao", active: "communications" },
    <>
      <PageHeader title="Comunicacao" icon="ph-chats-circle" actions={() => <a href="/communications/new" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-plus" aria-hidden="true"></i>Registrar Comunicacao</a>} />
      <Table
        columns={[{ label: "Data" }, { label: "Canal" }, { label: "Direcao" }, { label: "Processo" }, { label: "Cliente" }, { label: "Mensagem" }]}
        rows={rows}
        emptyMsg="Nenhuma comunicacao registrada."
        emptyIcon="ph-chats-circle"
        ariaLabel="Log de comunicacao"
      />
    </>,
  );
});

communicationsRoutes.get("/new", async (c) => {
  const user = c.get("user");
  const [casesRes, clientsRes] = await Promise.all([
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  return renderPage(
    c,
    { title: "Registrar Comunicacao", active: "communications" },
    <>
      <PageHeader title="Registrar Comunicacao" icon="ph-plus-circle" />
      <Panel>
        <form method="post" action="/communications" class="flex flex-col gap-4">
          <Select label="Cliente" id="client_id" name="client_id"
            options={[{ value: "", label: "Nenhum" }, ...(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))]}
          />
          <Select label="Processo" id="case_id" name="case_id"
            options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
          />
          <div class="grid grid-cols-2 gap-4">
            <Select label="Canal" id="channel" name="channel" required
              options={[
                { value: "whatsapp", label: "WhatsApp" },
                { value: "email", label: "Email" },
                { value: "telefone", label: "Telefone" },
                { value: "presencial", label: "Presencial" },
                { value: "outro", label: "Outro" },
              ]}
            />
            <Select label="Direcao" id="direction" name="direction" required selected="outbound"
              options={[
                { value: "outbound", label: "Enviada" },
                { value: "inbound", label: "Recebida" },
              ]}
            />
          </div>
          <Textarea label="Mensagem" id="message_body" name="message_body" rows={5} required />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Registrar</button>
            <a href="/communications" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

communicationsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = commSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/communications/new");

  await supabase.from("communications_log").insert({
    tenant_id: user.tenantId,
    case_id: parsed.data.case_id || null,
    client_id: parsed.data.client_id || null,
    channel: parsed.data.channel,
    direction: parsed.data.direction,
    message_body: parsed.data.message_body,
    status: "sent",
  });

  return c.redirect("/communications");
});
