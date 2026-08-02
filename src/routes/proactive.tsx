import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { log } from "../lib/logger";
import { setFlash, getFlash } from "../lib/flash";
import { sendProactiveNotification, processNewMovementsForNotification, type MovementInfo } from "../lib/proactive-notifications";
import { PageHeader, Panel, Badge, Table, type TableColumn } from "../components/ui";

export const proactiveRoutes = new Hono<AppEnv>();

proactiveRoutes.use("*", requireAuth);

// GET / — dashboard showing recent proactive notifications and pending movements.
proactiveRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Get recent proactive notifications.
  const { data: recentNotifications } = await supabase
    .from("whatsapp_messages")
    .select("id, phone, message, status, created_at, metadata")
    .eq("tenant_id", user.tenantId)
    .eq("source", "proactive_notification")
    .order("created_at", { ascending: false })
    .limit(20);

  // Get recent case movements that could be notified.
  const { data: recentMovements } = await supabase
    .from("case_movements")
    .select(`
      id, movement_text, movement_date, created_at,
      cases!inner(id, title, case_number, client_id, clients!inner(name, phone, cpf))
    `)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(10);

  const flash = getFlash(c);

  // Build table data for movements.
  const movementColumns: TableColumn[] = [
    { label: "Processo", align: "left" },
    { label: "Cliente", align: "left" },
    { label: "Movimento", align: "left" },
    { label: "Data", align: "left" },
    { label: "Telefone", align: "left" },
    { label: "Acao", align: "right" },
  ];

  const movementRows: (string | number)[][] = (recentMovements ?? []).map((m) => {
    const caseData = m.cases as unknown as { id: string; title: string; case_number: string; clients: { name: string; phone?: string; cpf?: string } };
    const client = caseData.clients;
    return [
      caseData.case_number,
      client.name,
      (m.movement_text ?? "").slice(0, 60),
      new Date(m.movement_date).toLocaleDateString("pt-BR"),
      client.phone ?? "—",
      "Notificar",
    ];
  });

  // Build table data for notifications.
  const notifColumns: TableColumn[] = [
    { label: "Telefone", align: "left" },
    { label: "Mensagem", align: "left" },
    { label: "Status", align: "left" },
    { label: "Data", align: "left" },
  ];

  const notifRows: (string | number)[][] = (recentNotifications ?? []).map((n) => [
    n.phone,
    (n.message ?? "").slice(0, 80),
    n.status,
    new Date(n.created_at).toLocaleString("pt-BR"),
  ]);

  return renderPage(
    c,
    { title: "Notificacoes Proativas", active: "proactive" },
    <>
        {flash && (
          <div class={`fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg ${flash.type === "success" ? "bg-green-600" : flash.type === "error" ? "bg-red-600" : flash.type === "warning" ? "bg-yellow-600" : "bg-blue-600"} text-white`}>
            {flash.message}
          </div>
        )}

        <PageHeader title="Notificacoes Proativas" icon="ph-bell-ringing" />

        <div class="space-y-6">
          {/* Stats */}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Panel>
              <div class="text-center">
                <div class="text-3xl font-bold text-blue-600">{recentNotifications?.length ?? 0}</div>
                <div class="text-sm text-gray-500 mt-1">Notificacoes recentes</div>
              </div>
            </Panel>
            <Panel>
              <div class="text-center">
                <div class="text-3xl font-bold text-green-600">
                  {recentNotifications?.filter((n) => n.status === "sent").length ?? 0}
                </div>
                <div class="text-sm text-gray-500 mt-1">Enviadas com sucesso</div>
              </div>
            </Panel>
            <Panel>
              <div class="text-center">
                <div class="text-3xl font-bold text-yellow-600">{recentMovements?.length ?? 0}</div>
                <div class="text-sm text-gray-500 mt-1">Movimentos recentes</div>
              </div>
            </Panel>
          </div>

          {/* Batch action */}
          <div class="flex justify-end">
            <form method="post" action="/proactive/batch" class="inline">
              <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Processar todos os movimentos
              </button>
            </form>
          </div>

          {/* Pending movements */}
          <Panel>
            <h2 class="text-lg font-semibold mb-4">Movimentos Recentes</h2>
            {movementRows.length > 0 ? (
              <div class="space-y-2">
                {(recentMovements ?? []).map((m) => {
                  const caseData = m.cases as unknown as { id: string; title: string; case_number: string; clients: { name: string; phone?: string; cpf?: string } };
                  const client = caseData.clients;
                  return (
                    <div key={m.id} class="flex items-center justify-between border-b border-gray-100 py-3">
                      <div class="flex-1 min-w-0">
                        <div class="font-mono text-sm text-gray-700">{caseData.case_number}</div>
                        <div class="text-sm font-medium">{client.name}</div>
                        <div class="text-sm text-gray-500 truncate">{m.movement_text}</div>
                        <div class="text-xs text-gray-400 mt-1">
                          {new Date(m.movement_date).toLocaleDateString("pt-BR")} — {client.phone ?? "sem telefone"}
                        </div>
                      </div>
                      <form method="post" class="inline ml-4">
                        <input type="hidden" name="case_id" value={caseData.id} />
                        <input type="hidden" name="case_title" value={caseData.title} />
                        <input type="hidden" name="case_number" value={caseData.case_number} />
                        <input type="hidden" name="movement_text" value={m.movement_text} />
                        <input type="hidden" name="movement_date" value={m.movement_date} />
                        <input type="hidden" name="client_name" value={client.name} />
                        <input type="hidden" name="client_phone" value={client.phone ?? ""} />
                        <input type="hidden" name="client_cpf" value={client.cpf ?? ""} />
                        <button type="submit" class="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded">
                          Notificar
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p class="text-gray-500 text-sm">Nenhum movimento recente encontrado.</p>
            )}
          </Panel>

          {/* Recent notifications */}
          <Panel>
            <h2 class="text-lg font-semibold mb-4">Notificacoes Enviadas</h2>
            {notifRows.length > 0 ? (
              <div class="space-y-2">
                {(recentNotifications ?? []).map((n) => (
                  <div key={n.id} class="flex items-start justify-between border-b border-gray-100 py-3">
                    <div class="flex-1 min-w-0">
                      <div class="font-mono text-sm text-gray-700">{n.phone}</div>
                      <div class="text-sm text-gray-600 truncate">{n.message}</div>
                      <div class="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
                    </div>
                    <Badge color={n.status === "sent" ? "green" : "red"}>{n.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p class="text-gray-500 text-sm">Nenhuma notificacao proativa enviada ainda.</p>
            )}
          </Panel>
        </div>
      </>,
  );
});
proactiveRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.formData();

  const movement: MovementInfo = {
    caseId: body.get("case_id") as string,
    caseTitle: body.get("case_title") as string,
    caseNumber: body.get("case_number") as string,
    movementText: body.get("movement_text") as string,
    movementDate: body.get("movement_date") as string,
    clientName: body.get("client_name") as string,
    clientPhone: (body.get("client_phone") as string) || undefined,
    clientCpf: (body.get("client_cpf") as string) || undefined,
  };

  const result = await sendProactiveNotification(user.tenantId, movement);

  if (result.sent) {
    setFlash(c, "success", "Notificacao enviada com sucesso!");
    log.info("Manual proactive notification sent", { tenantId: user.tenantId, caseId: movement.caseId });
  } else if (result.skipped) {
    setFlash(c, "warning", `Notificacao nao enviada: ${result.skipReason}`);
  } else {
    setFlash(c, "error", `Erro ao enviar: ${result.error}`);
  }

  return c.redirect("/proactive");
});

// POST /batch — process all recent movements.
proactiveRoutes.post("/batch", async (c) => {
  const user = c.get("user");

  // Get recent movements.
  const { data: recentMovements } = await supabase
    .from("case_movements")
    .select(`
      id, movement_text, movement_date,
      cases!inner(id, title, case_number, client_id, clients!inner(name, phone, cpf))
    `)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!recentMovements || recentMovements.length === 0) {
    setFlash(c, "warning", "Nenhum movimento encontrado para processar.");
    return c.redirect("/proactive");
  }

  const movements: MovementInfo[] = recentMovements.map((m) => {
    const caseData = m.cases as unknown as { id: string; title: string; case_number: string; clients: { name: string; phone?: string; cpf?: string } };
    return {
      caseId: caseData.id,
      caseTitle: caseData.title,
      caseNumber: caseData.case_number,
      movementText: m.movement_text,
      movementDate: m.movement_date,
      clientName: caseData.clients.name,
      clientPhone: caseData.clients.phone,
      clientCpf: caseData.clients.cpf,
    };
  });

  const result = await processNewMovementsForNotification(user.tenantId, movements);
  setFlash(c, "success", `Lote processado: ${result.sent} enviadas, ${result.skipped} puladas, ${result.failed} falharam.`);

  return c.redirect("/proactive");
});
