import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Panel, Badge, Modal } from "../components/ui";
import { generateApiKey } from "../lib/api-auth";

export const apiKeysRoutes = new Hono<AppEnv>();

apiKeysRoutes.use("*", requireAuth);
apiKeysRoutes.use("*", requireRole("socio", "admin"));

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

// GET /api-keys — list API keys and webhooks
apiKeysRoutes.get("/", async (c) => {
  const user = c.get("user");
  const newKey = c.req.query("new_key") ?? "";
  const tab = c.req.query("tab") ?? "keys";

  const [keysRes, webhooksRes] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, last_used_at, expires_at, active, created_at")
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhooks")
      .select("id, url, events, secret, active, created_at")
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false }),
  ]);

  const keyRows = (keysRes.data ?? []).map((k) => [
    k.name,
    <code class="text-body-xs text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded">{k.key_prefix}</code> as unknown as string,
    (k.scopes ?? []).join(", ") || "-",
    <Badge color={k.active ? "green" : "gray"}>{k.active ? "Ativa" : "Revogada"}</Badge> as unknown as string,
    formatDate(k.last_used_at),
    formatDate(k.expires_at),
    k.active ? (
      <form method="post" action={`/api-keys/${k.id}/revoke`}>
        <button type="submit" class="text-body-xs text-status-red hover:underline" onclick="return confirm('Revogar esta chave?')" aria-label="Revogar">Revogar</button>
      </form>
    ) : null,
  ]);

  const webhookRows = (webhooksRes.data ?? []).map((w) => [
    w.url,
    (w.events ?? []).join(", "),
    <Badge color={w.active ? "green" : "gray"}>{w.active ? "Ativo" : "Inativo"}</Badge> as unknown as string,
    formatDate(w.created_at),
    <form method="post" action={`/api-keys/webhooks/${w.id}/delete`}>
      <button type="submit" class="text-body-xs text-status-red hover:underline" onclick="return confirm('Remover webhook?')" aria-label="Remover webhook">Remover</button>
    </form>,
  ]);

  return renderPage(
    c,
    { title: "API e Webhooks", active: "api-keys" },
    <>
      <PageHeader title="API e Webhooks" icon="ph-webhooks-logo" />

      {newKey ? (
        <div class="mb-6 p-4 bg-status-green-bg border border-status-green rounded-xl">
          <div class="flex items-start gap-3">
            <i class="ph ph-check-circle text-h4 text-status-green mt-0.5" aria-hidden="true"></i>
            <div class="flex-1">
              <div class="font-semibold text-status-green mb-1">Chave criada com sucesso!</div>
              <div class="text-body-sm text-gray-700 mb-2">Copie sua chave agora. Ela nao sera exibida novamente:</div>
              <code class="block bg-gray-900 text-status-green p-3 rounded-lg text-body-sm break-all">{newKey}</code>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tabs */}
      <div class="flex gap-2 mb-6 border-b border-gray-100">
        <a href="/api-keys?tab=keys" class={`px-4 py-2 text-body-sm font-medium ${tab === "keys" ? "text-[#0568ff] border-b-2 border-[#0568ff]" : "text-gray-500 hover:text-gray-700"}`}>Chaves de API</a>
        <a href="/api-keys?tab=webhooks" class={`px-4 py-2 text-body-sm font-medium ${tab === "webhooks" ? "text-[#0568ff] border-b-2 border-[#0568ff]" : "text-gray-500 hover:text-gray-700"}`}>Webhooks</a>
      </div>

      {tab === "keys" ? (
        <>
          <div class="mb-6 flex justify-end">
            <Modal id="new-key" title="Nova Chave de API" icon="ph-key" triggerText="Nova Chave" triggerIcon="ph-plus" action="/api-keys" submitLabel="Gerar Chave">
              <TextField label="Nome" id="name" name="name" required placeholder="Ex: Integracao CRM" icon="ph-tag" />
              <div class="flex flex-col gap-1">
                <label class="text-body-sm font-semibold text-gray-700">Escopos</label>
                <div class="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { value: "cases:read", label: "Ler processos" },
                    { value: "cases:write", label: "Criar/editar processos" },
                    { value: "clients:read", label: "Ler clientes" },
                    { value: "clients:write", label: "Criar/editar clientes" },
                    { value: "deadlines:read", label: "Ler prazos" },
                    { value: "deadlines:write", label: "Criar/editar prazos" },
                    { value: "invoices:read", label: "Ler faturas" },
                    { value: "webhooks:write", label: "Testar webhooks" },
                  ].map((s) => (
                    <label key={s.value} class="flex items-center gap-2 text-body-sm text-gray-700">
                      <input type="checkbox" name="scopes" value={s.value} class="w-4 h-4" />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <TextField label="Expira em (opcional)" id="expires_at" name="expires_at" type="date" icon="ph-calendar" />
            </Modal>
          </div>
          <Table
            columns={[{ label: "Nome" }, { label: "Chave" }, { label: "Escopos" }, { label: "Status" }, { label: "Ultimo uso" }, { label: "Expira" }, { label: "Acoes" }]}
            rows={keyRows}
            emptyMsg="Nenhuma chave de API criada."
            emptyIcon="ph-key"
            ariaLabel="Lista de chaves de API"
          />

          <div class="mt-6">
            <Panel title="Como usar a API" icon="ph-book-open">
              <div class="text-body-sm text-gray-600 space-y-2">
                <p>Autentique suas requisicoes incluindo a chave no header Authorization:</p>
                <pre class="bg-gray-900 text-gray-100 p-3 rounded-lg text-body-xs overflow-x-auto"><code>curl -H "Authorization: Bearer pk_live_..." \{"\n"}  https://sua-instancia.pragmaos.com/api/v1/cases</code></pre>
                <p class="mt-2">Todos os endpoints retornam JSON. Limite: 100 itens por pagina. Use os parametros <code>limit</code> e <code>offset</code> para paginacao.</p>
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <>
          <div class="mb-6 flex justify-end">
            <Modal id="new-webhook" title="Novo Webhook" icon="ph-webhooks-logo" triggerText="Novo Webhook" triggerIcon="ph-plus" action="/api-keys/webhooks" submitLabel="Criar">
              <TextField label="URL" id="url" name="url" required placeholder="https://seu-servidor.com/webhook" icon="ph-link" />
              <div class="flex flex-col gap-1">
                <label class="text-body-sm font-semibold text-gray-700">Eventos</label>
                <div class="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { value: "case.created", label: "Processo criado" },
                    { value: "case.updated", label: "Processo atualizado" },
                    { value: "deadline.created", label: "Prazo criado" },
                    { value: "deadline.due", label: "Prazo vencendo" },
                    { value: "invoice.created", label: "Fatura criada" },
                    { value: "invoice.paid", label: "Fatura paga" },
                    { value: "client.created", label: "Cliente criado" },
                  ].map((e) => (
                    <label key={e.value} class="flex items-center gap-2 text-body-sm text-gray-700">
                      <input type="checkbox" name="events" value={e.value} class="w-4 h-4" />
                      {e.label}
                    </label>
                  ))}
                </div>
              </div>
              <TextField label="Secret (opcional)" id="secret" name="secret" placeholder="Chave secreta para validar" icon="ph-lock" />
            </Modal>
          </div>
          <Table
            columns={[{ label: "URL" }, { label: "Eventos" }, { label: "Status" }, { label: "Criado em" }, { label: "Acoes" }]}
            rows={webhookRows}
            emptyMsg="Nenhum webhook configurado."
            emptyIcon="ph-hash"
            ariaLabel="Lista de webhooks"
          />
        </>
      )}
    </>,
  );
});

// POST /api-keys — create new API key
apiKeysRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const name = body.name as string;
  const scopesRaw = body.scopes;
  const scopes = Array.isArray(scopesRaw) ? scopesRaw : (scopesRaw ? [scopesRaw] : []);
  const expiresAt = body.expires_at as string;

  if (!name) return c.redirect("/api-keys?error=Nome obrigatorio");

  const { key, keyHash, keyPrefix } = await generateApiKey(name);

  await supabase.from("api_keys").insert({
    tenant_id: user.tenantId,
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    scopes,
    expires_at: expiresAt || null,
    created_by: user.id,
  });

  return c.redirect(`/api-keys?new_key=${encodeURIComponent(key)}`);
});

// POST /api-keys/:id/revoke — revoke API key
apiKeysRoutes.post("/:id/revoke", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase
    .from("api_keys")
    .update({ active: false, revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);
  return c.redirect("/api-keys");
});

// POST /api-keys/webhooks — create webhook
apiKeysRoutes.post("/webhooks", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const url = body.url as string;
  const eventsRaw = body.events;
  const events = Array.isArray(eventsRaw) ? eventsRaw : (eventsRaw ? [eventsRaw] : []);
  const secret = (body.secret as string) || null;

  if (!url) return c.redirect("/api-keys?tab=webhooks&error=URL obrigatoria");

  await supabase.from("webhooks").insert({
    tenant_id: user.tenantId,
    url,
    events,
    secret,
  });

  return c.redirect("/api-keys?tab=webhooks&success=Webhook criado");
});

// POST /api-keys/webhooks/:id/delete — delete webhook
apiKeysRoutes.post("/webhooks/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase
    .from("webhooks")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);
  return c.redirect("/api-keys?tab=webhooks");
});
