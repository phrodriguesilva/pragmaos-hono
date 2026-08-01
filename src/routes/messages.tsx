import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Panel, Badge, Modal } from "../components/ui";

export const messagesRoutes = new Hono<AppEnv>();

messagesRoutes.use("*", requireAuth);

const channelSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  case_id: z.string().optional(),
  type: z.enum(["channel", "direct"]),
});

const messageSchema = z.object({
  content: z.string().min(1, "Mensagem e obrigatoria"),
});

const memberSchema = z.object({
  user_id: z.string().uuid("Usuario invalido"),
});

const TYPE_LABELS: Record<string, string> = {
  channel: "Canal",
  direct: "Direto",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// GET /messages -- list channels.
messagesRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Fetch cases for the channel creation modal.
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");

  const caseOptions = [{ value: "", label: "Nenhum" }, ...(cases ?? []).map((cs) => ({ value: cs.id, label: cs.title }))];

  // Get channels the user is a member of.
  const { data: memberships } = await supabase
    .from("chat_channel_members")
    .select("channel_id")
    .eq("user_id", user.id);

  const channelIds = (memberships ?? []).map((m) => m.channel_id);

  if (channelIds.length === 0) {
    return renderPage(
      c,
      { title: "Mensagens", active: "messages" },
      <>
        <PageHeader
          title="Mensagens"
          icon="ph-chat-circle"
          actions={() => (
            <Modal
              id="new-channel"
              title="Novo Canal"
              icon="ph-chat-circle"
              triggerText="Novo Canal"
              triggerIcon="ph-plus"
              action="/messages"
              submitLabel="Criar Canal"
            >
              <TextField label="Nome" id="name" name="name" required placeholder="Nome do canal" icon="ph-hash" />
              <Select label="Processo (opcional)" id="case_id" name="case_id" options={caseOptions} />
              <Select label="Tipo" id="type" name="type" required selected="channel"
                options={[
                  { value: "channel", label: "Canal" },
                  { value: "direct", label: "Direto" },
                ]}
              />
            </Modal>
          )}
        />
        <Table
          columns={[
            { label: "Nome" },
            { label: "Tipo" },
            { label: "Membros" },
            { label: "Ultima mensagem" },
          ]}
          rows={[]}
          emptyMsg="Nenhum canal encontrado."
          emptyIcon="ph-chat-circle"
          ariaLabel="Lista de canais"
        />
      </>,
    );
  }

  const { data: channels } = await supabase
    .from("chat_channels")
    .select("id, name, type, created_at")
    .eq("tenant_id", user.tenantId)
    .in("id", channelIds)
    .order("created_at", { ascending: false });

  // Fetch member counts and last messages for each channel.
  const rows = await Promise.all((channels ?? []).map(async (ch) => {
    const [membersRes, lastMsgRes] = await Promise.all([
      supabase
        .from("chat_channel_members")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", ch.id),
      supabase
        .from("chat_messages")
        .select("content, created_at")
        .eq("channel_id", ch.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const memberCount = membersRes.count ?? 0;
    const lastMsg = lastMsgRes.data?.[0];
    const lastMsgText = lastMsg ? `${lastMsg.content.slice(0, 40)}${lastMsg.content.length > 40 ? "..." : ""}` : "-";

    return [
      <a href={`/messages/${ch.id}`} class="text-terracota-600 hover:underline">{ch.name}</a> as unknown as string,
      TYPE_LABELS[ch.type] ?? ch.type,
      String(memberCount),
      lastMsg ? `${lastMsgText} (${formatDateTime(lastMsg.created_at)})` : "-",
    ];
  }));

  return renderPage(
    c,
    { title: "Mensagens", active: "messages" },
    <>
      <PageHeader
        title="Mensagens"
        icon="ph-chat-circle"
        actions={() => (
            <Modal
              id="new-channel"
              title="Novo Canal"
              icon="ph-chat-circle"
              triggerText="Novo Canal"
              triggerIcon="ph-plus"
              action="/messages"
              submitLabel="Criar Canal"
            >
              <TextField label="Nome" id="name" name="name" required placeholder="Nome do canal" icon="ph-hash" />
              <Select label="Processo (opcional)" id="case_id" name="case_id" options={caseOptions} />
              <Select label="Tipo" id="type" name="type" required selected="channel"
                options={[
                  { value: "channel", label: "Canal" },
                  { value: "direct", label: "Direto" },
                ]}
              />
            </Modal>
          )}
      />
      <Table
        columns={[
          { label: "Nome" },
          { label: "Tipo" },
          { label: "Membros" },
          { label: "Ultima mensagem" },
        ]}
        rows={rows}
        emptyMsg="Nenhum canal encontrado."
        emptyIcon="ph-chat-circle"
        ariaLabel="Lista de canais"
      />
    </>,
  );
});

// POST /messages -- create channel + add creator as member.
messagesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = channelSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect("/messages");
  }

  const { data: channel, error } = await supabase
    .from("chat_channels")
    .insert({
      tenant_id: user.tenantId,
      name: parsed.data.name,
      case_id: parsed.data.case_id || null,
      type: parsed.data.type,
    })
    .select("id")
    .single();

  if (error || !channel) {
    return c.redirect("/messages");
  }

  // Add creator as a member.
  await supabase.from("chat_channel_members").insert({
    tenant_id: user.tenantId,
    channel_id: channel.id,
    user_id: user.id,
  });

  return c.redirect(`/messages/${channel.id}`);
});

// GET /messages/:id -- chat view.
messagesRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: channel } = await supabase
    .from("chat_channels")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!channel) return c.html("Canal nao encontrado.", 404);

  const [messagesRes, membersRes, allProfilesRes] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, user_id, content, created_at")
      .eq("channel_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("chat_channel_members")
      .select("id, user_id, created_at")
      .eq("channel_id", id),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("tenant_id", user.tenantId)
      .order("full_name"),
  ]);

  // Fetch profile names for members.
  const memberUserIds = (membersRes.data ?? []).map((m) => m.user_id);
  let memberProfiles: { id: string; full_name: string }[] = [];
  if (memberUserIds.length > 0) {
    const { data: mp } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", memberUserIds);
    memberProfiles = mp ?? [];
  }

  const profileMap = new Map<string, string>();
  for (const p of memberProfiles) {
    profileMap.set(p.id, p.full_name);
  }

  // Members with names.
  const members = (membersRes.data ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    name: profileMap.get(m.user_id) ?? "Usuario",
  }));

  // All profiles not yet members (for add member dropdown).
  const memberUserIdSet = new Set(members.map((m) => m.user_id));
  const availableProfiles = (allProfilesRes.data ?? []).filter((p) => !memberUserIdSet.has(p.id));

  return renderPage(
    c,
    { title: channel.name, active: "messages" },
    <>
      <PageHeader
        title={channel.name}
        icon="ph-chat-circle"
        actions={() => (
          <div class="flex gap-2">
            <form method="post" action={`/messages/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este canal?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir Canal
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-3 gap-4">
        {/* Chat area */}
        <div class="col-span-2">
          <Panel title="Mensagens" icon="ph-chat-circle-text">
            <div class="flex flex-col gap-2 mb-4" style="max-height: 400px; overflow-y: auto;">
              {(messagesRes.data ?? []).length === 0 ? (
                <div class="text-center text-gray-500 py-8">
                  <i class="ph ph-chat-circle text-h2 block mb-2 text-gray-300" aria-hidden="true"></i>
                  Nenhuma mensagem ainda. Inicie a conversa.
                </div>
              ) : (
                (messagesRes.data ?? []).map((msg) => {
                  const isOwn = msg.user_id === user.id;
                  const authorName = profileMap.get(msg.user_id) ?? "Usuario";
                  return (
                    <div class={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div
                        class={`max-w-[75%] rounded px-3 py-2 ${isOwn ? "bg-carvao-100" : "bg-gray-100"}`}
                      >
                        {!isOwn ? (
                          <div class="text-body-xs font-semibold text-carvao-700 mb-1">{authorName}</div>
                        ) : null}
                        <div class="text-body-sm text-gray-800 whitespace-pre-wrap">{msg.content}</div>
                        <div class="text-body-xs text-gray-400 mt-1">{formatDateTime(msg.created_at)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <form method="post" action={`/messages/${id}/messages`} class="flex gap-2">
              <input
                type="text"
                id="content"
                name="content"
                required
                placeholder="Digite sua mensagem..."
                class="input flex-1"
              />
              <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Enviar</button>
            </form>
          </Panel>
        </div>
        {/* Members sidebar */}
        <div>
          <Panel title="Membros" icon="ph-users">
            <ul class="flex flex-col gap-2 mb-4">
              {members.map((m) => (
                <li class="flex items-center justify-between text-body-sm">
                  <span class="flex items-center gap-2">
                    <i class="ph ph-user-circle text-body text-carvao-600" aria-hidden="true"></i>
                    {m.name}
                    {m.user_id === user.id ? <Badge color="blue">Voce</Badge> : null}
                  </span>
                  {m.user_id !== user.id ? (
                    <form method="post" action={`/messages/${id}/members/${m.id}/remove`}>
                      <button type="submit" class="text-status-red hover:underline text-body-xs inline-flex items-center gap-1" onclick="return confirm('Remover este membro?')">
                        <i class="ph ph-x" aria-hidden="true"></i>Remover
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {availableProfiles.length > 0 ? (
              <form method="post" action={`/messages/${id}/members`} class="flex flex-col gap-2">
                <Select label="Adicionar membro" id="user_id" name="user_id" required
                  options={availableProfiles.map((p) => ({ value: p.id, label: p.full_name }))}
                />
                <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-user-plus" aria-hidden="true"></i>Adicionar Membro</button>
              </form>
            ) : (
              <p class="text-body-sm text-gray-500">Todos os usuarios ja sao membros.</p>
            )}
          </Panel>
        </div>
      </div>
    </>,
  );
});

// POST /messages/:id/messages -- send message.
messagesRoutes.post("/:id/messages", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = messageSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/messages/${id}`);
  }

  await supabase.from("chat_messages").insert({
    tenant_id: user.tenantId,
    channel_id: id,
    user_id: user.id,
    content: parsed.data.content,
  });

  return c.redirect(`/messages/${id}`);
});

// POST /messages/:id/members -- add member.
messagesRoutes.post("/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = memberSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/messages/${id}`);
  }

  // Check if already a member.
  const { data: existing } = await supabase
    .from("chat_channel_members")
    .select("id")
    .eq("channel_id", id)
    .eq("user_id", parsed.data.user_id)
    .single();

  if (!existing) {
    await supabase.from("chat_channel_members").insert({
      tenant_id: user.tenantId,
      channel_id: id,
      user_id: parsed.data.user_id,
    });
  }

  return c.redirect(`/messages/${id}`);
});

// POST /messages/:id/members/:memberId/remove -- remove member.
messagesRoutes.post("/:id/members/:memberId/remove", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const memberId = c.req.param("memberId");

  await supabase
    .from("chat_channel_members")
    .delete()
    .eq("id", memberId)
    .eq("channel_id", id);

  return c.redirect(`/messages/${id}`);
});

// POST /messages/:id/delete -- delete channel.
messagesRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Delete messages and members first, then the channel.
  await supabase.from("chat_messages").delete().eq("channel_id", id);
  await supabase.from("chat_channel_members").delete().eq("channel_id", id);
  await supabase
    .from("chat_channels")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/messages");
});
