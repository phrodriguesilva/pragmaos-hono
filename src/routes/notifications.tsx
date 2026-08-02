import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Badge } from "../components/ui";

export const notificationsRoutes = new Hono<AppEnv>();

notificationsRoutes.use("*", requireAuth);

// GET /notifications — list all notifications for the current user
notificationsRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read, created_at")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  const typeIcon: Record<string, string> = {
    info: "ph-info",
    success: "ph-check-circle",
    warning: "ph-warning",
    error: "ph-x-circle",
    deadline: "ph-calendar-x",
    message: "ph-envelope",
    case: "ph-folder",
  };

  const typeColor: Record<string, "blue" | "green" | "yellow" | "red" | "gray"> = {
    info: "blue",
    success: "green",
    warning: "yellow",
    error: "red",
    deadline: "red",
    message: "blue",
    case: "gray",
  };

  return renderPage(
    c,
    { title: "Notificacoes", active: "notifications" },
    <>
      <PageHeader
        title="Notificacoes"
        icon="ph-bell"
        actions={() => (
          <form method="post" action="/notifications/mark-all-read" class="inline">
            <button type="submit" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-check-double" aria-hidden="true"></i>Marcar todas como lidas
            </button>
          </form>
        )}
      />

      {unreadCount > 0 ? (
        <div class="mb-4 p-3 bg-status-yellow-bg border border-status-yellow rounded-lg flex items-center gap-2">
          <i class="ph ph-warning text-status-yellow" aria-hidden="true"></i>
          <span class="text-body-sm text-status-yellow font-medium">
            Voce tem {unreadCount} notificacao(oes) nao lida(s).
          </span>
        </div>
      ) : null}

      <Panel title="Suas notificacoes" icon="ph-bell">
        {(notifications ?? []).length === 0 ? (
          <div class="text-center py-12 text-gray-400">
            <i class="ph ph-bell-slash text-h1 block mb-2" aria-hidden="true"></i>
            <p class="text-body-sm">Nenhuma notificacao.</p>
          </div>
        ) : (
          <ul class="flex flex-col gap-1">
            {(notifications ?? []).map((n) => (
              <li
                key={n.id}
                class={`flex items-start gap-3 p-3 rounded-lg border ${n.read ? "border-gray-100 bg-white" : "border-terracota-200 bg-terracota-50"}`}
              >
                <i class={`ph ${typeIcon[n.type] ?? "ph-info"} text-h4 ${n.read ? "text-gray-400" : "text-terracota-600"}`} aria-hidden="true"></i>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class={`text-body-sm font-medium ${n.read ? "text-gray-600" : "text-gray-900"}`}>{n.title}</span>
                    {!n.read ? <Badge color="red">Nova</Badge> : null}
                  </div>
                  {n.body ? <p class="text-body-xs text-gray-500 mt-1">{n.body}</p> : null}
                  <div class="text-body-xs text-gray-400 mt-1">
                    {new Date(n.created_at).toLocaleString("pt-BR")}
                    {n.link ? <a href={n.link} class="ml-2 text-terracota-600 hover:underline">Ver detalhes</a> : null}
                  </div>
                </div>
                {!n.read ? (
                  <form method="post" action={`/notifications/${n.id}/read`}>
                    <button type="submit" class="text-body-xs text-terracota-600 hover:underline">Marcar lida</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>,
  );
});

// POST /notifications/:id/read — mark as read
notificationsRoutes.post("/:id/read", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);
  return c.redirect("/notifications");
});

// POST /notifications/mark-all-read — mark all as read
notificationsRoutes.post("/mark-all-read", async (c) => {
  const user = c.get("user");
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("tenant_id", user.tenantId)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq("read", false);
  return c.redirect("/notifications");
});

// GET /notifications/api/count — JSON endpoint for badge count
notificationsRoutes.get("/api/count", async (c) => {
  const user = c.get("user");
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", user.tenantId)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq("read", false);
  return c.json({ count: count ?? 0 });
});
