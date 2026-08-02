import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Textarea, Panel, Badge, Modal } from "../components/ui";

export const permissionsRoutes = new Hono<AppEnv>();

permissionsRoutes.use("*", requireAuth);
permissionsRoutes.use("*", requireRole("socio"));

const roleSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  description: z.string().optional(),
});

const MODULES = [
  "dashboard",
  "clients",
  "cases",
  "proceedings",
  "deadlines",
  "hearings",
  "tasks",
  "documents",
  "templates",
  "diario-oficial",
  "finance",
  "honorarios",
  "billing",
  "cashflow",
  "reports",
  "users",
  "teams",
  "audit",
  "leads",
  "communications",
  "portal",
  "workflows",
  "timesheet",
  "ai-assistant",
  "integrations",
  "companies",
  "permissions",
];

// GET /permissions -- list roles.
permissionsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const { data: roles, count } = await supabase
    .from("roles")
    .select("id, name, description, is_system", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalPages = count ? Math.ceil(count / limit) : 1;

  // Fetch module counts per role.
  const roleIds = (roles ?? []).map((r) => r.id);
  let permCounts: { role_id: string; module: string }[] = [];
  if (roleIds.length) {
    const { data } = await supabase
      .from("role_permissions")
      .select("role_id, module")
      .in("role_id", roleIds)
      .eq("tenant_id", user.tenantId);
    permCounts = data ?? [];
  }

  const moduleCountMap = new Map<string, number>();
  for (const p of permCounts) {
    moduleCountMap.set(p.role_id, (moduleCountMap.get(p.role_id) ?? 0) + 1);
  }

  const rows = (roles ?? []).map((r) => [
    <a href={`/permissions/${r.id}`} class="text-[#0568ff] hover:underline">{r.name}</a> as unknown as string,
    r.description ?? "-",
    r.is_system ? <Badge color="blue" icon="ph-lock-key">Sistema</Badge> : <Badge color="gray">Personalizado</Badge> as unknown as string,
    String(moduleCountMap.get(r.id) ?? 0),
    <div class="flex items-center gap-2">
      <a href={`/permissions/${r.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <a href={`/permissions/${r.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/permissions/${r.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Permissoes", active: "permissions" },
    <>
      <PageHeader
        title="Permissoes"
        icon="ph-key"
        actions={() => (
          <Modal
            id="new-role"
            title="Novo Perfil"
            icon="ph-key"
            triggerText="Novo Perfil"
            triggerIcon="ph-plus"
            action="/permissions"
            submitLabel="Salvar"
          >
            <TextField label="Nome" id="name" name="name" required placeholder="Ex: Advogado Senior" />
            <Textarea label="Descricao" id="description" name="description" rows={3} />
          </Modal>
        )}
      />
      <Table
        columns={[
          { label: "Nome" },
          { label: "Descricao" },
          { label: "Sistema", align: "center" },
          { label: "Modulos", align: "center" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhum perfil de permissao encontrado."
        emptyIcon="ph-key"
        ariaLabel="Lista de perfis de permissao"
        count={count ?? 0}
        countLabel="perfil(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/permissions",
        }}
      />
    </>,
  );
});

// POST /permissions -- create.
permissionsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = roleSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect("/permissions");
  }

  const { error } = await supabase.from("roles").insert({
    tenant_id: user.tenantId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    is_system: false,
  });

  if (error) {
    return c.redirect("/permissions");
  }

  return c.redirect("/permissions");
});

// GET /permissions/:id -- detail: role info + permissions matrix.
permissionsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: role } = await supabase
    .from("roles")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!role) {
    return c.html("Perfil nao encontrado.", 404);
  }

  const { data: existingPerms } = await supabase
    .from("role_permissions")
    .select("module, can_view, can_create, can_edit, can_delete")
    .eq("role_id", id)
    .eq("tenant_id", user.tenantId);

  const permMap = new Map<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>();
  for (const p of existingPerms ?? []) {
    permMap.set(p.module, {
      can_view: p.can_view,
      can_create: p.can_create,
      can_edit: p.can_edit,
      can_delete: p.can_delete,
    });
  }

  return renderPage(
    c,
    { title: role.name, active: "permissions" },
    <>
      <PageHeader
        title={role.name}
        icon="ph-key"
        actions={() => (
          <div class="flex gap-2">
            {role.is_system ? null : (
              <form method="post" action={`/permissions/${id}/delete`}>
                <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este perfil?')" aria-label="Excluir">
                  <i class="ph ph-trash" aria-hidden="true"></i>Excluir
                </button>
              </form>
            )}
          </div>
        )}
      />
      <div class="mb-6">
        <Panel title="Dados do perfil" icon="ph-shield-check">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Nome: </dt><dd class="inline">{role.name}</dd></div>
            {role.description ? <div><dt class="font-semibold text-gray-700 inline">Descricao: </dt><dd class="inline">{role.description}</dd></div> : null}
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{role.is_system ? <Badge color="blue" icon="ph-lock-key">Sistema</Badge> : <Badge color="gray">Personalizado</Badge>}</dd></div>
          </dl>
          {role.is_system ? (
            <div class="mt-4 p-3 bg-blue-50 border border-blue-200 text-body-sm text-blue-800 flex items-center gap-2">
              <i class="ph ph-info" aria-hidden="true"></i>
              Perfis de sistema nao podem ser excluidos, mas suas permissoes podem ser editadas.
            </div>
          ) : null}
        </Panel>
      </div>
      <Panel title="Matriz de Permissoes" icon="ph-grid-nine">
        <form method="post" action={`/permissions/${id}`} class="flex flex-col gap-4">
          <div class="overflow-x-auto">
            <table class="data-table" aria-label="Matriz de permissoes">
              <thead>
                <tr>
                  <th>Modulo</th>
                  <th class="text-center">Visualizar</th>
                  <th class="text-center">Criar</th>
                  <th class="text-center">Editar</th>
                  <th class="text-center">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map((mod) => {
                  const perm = permMap.get(mod);
                  return (
                    <tr>
                      <td class="font-medium text-gray-800">{mod}</td>
                      <td class="text-center">
                        <input type="checkbox" name={`${mod}_can_view`} value="true" checked={perm?.can_view ?? false} class="checkbox" />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" name={`${mod}_can_create`} value="true" checked={perm?.can_create ?? false} class="checkbox" />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" name={`${mod}_can_edit`} value="true" checked={perm?.can_edit ?? false} class="checkbox" />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" name={`${mod}_can_delete`} value="true" checked={perm?.can_delete ?? false} class="checkbox" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar Permissoes</button>
            <a href="/permissions" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /permissions/:id -- update permissions (upsert role_permissions for each module).
permissionsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();

  // Build upsert rows for each module from checkbox form fields.
  const rows = MODULES.map((mod) => ({
    tenant_id: user.tenantId,
    role_id: id,
    module: mod,
    can_view: body[`${mod}_can_view`] === "true",
    can_create: body[`${mod}_can_create`] === "true",
    can_edit: body[`${mod}_can_edit`] === "true",
    can_delete: body[`${mod}_can_delete`] === "true",
  }));

  // Delete existing permissions for this role, then re-insert.
  await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", id)
    .eq("tenant_id", user.tenantId);

  await supabase
    .from("role_permissions")
    .insert(rows);

  return c.redirect(`/permissions/${id}`);
});

// POST /permissions/:id/delete -- soft delete (only if not is_system).
permissionsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: role } = await supabase
    .from("roles")
    .select("is_system")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (role?.is_system) {
    return c.html("Perfis de sistema nao podem ser excluidos.", 403);
  }

  await supabase
    .from("roles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/permissions");
});
