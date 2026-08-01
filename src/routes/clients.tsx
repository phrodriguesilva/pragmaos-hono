import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge, BtnLink } from "../components/ui";

export const clientsRoutes = new Hono<AppEnv>();

clientsRoutes.use("*", requireAuth);

const clientSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  client_type: z.enum(["PF", "PJ"]),
  cpf: z.string().optional(),
  cnpj: z.string().optional(),
  email: z.string().email("Email invalido").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

// GET /clients -- list with search + cursor pagination.
clientsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const search = c.req.query("search")?.trim() ?? "";
  const limit = 26;

  let query = supabase
    .from("clients")
    .select("id, name, email, phone, client_type, created_at", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data: clients, count } = await query;

  const rows = (clients ?? []).slice(0, 25).map((cl) => [
    <a href={`/clients/${cl.id}`} class="text-terracota-600 hover:underline">{cl.name}</a> as unknown as string,
    cl.email ?? "-",
    cl.phone ?? "-",
    cl.client_type,
    <Badge color="green">Ativo</Badge> as unknown as string,
  ]);

  const hasMore = (clients?.length ?? 0) > 25;

  return renderPage(
    c,
    { title: "Clientes", active: "clients" },
    <>
      <PageHeader
        title="Clientes"
        icon="ph-users"
        actions={() => (
          <a href="/clients/new" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-plus" aria-hidden="true"></i>Novo Cliente
          </a>
        )}
      />
      <form method="get" action="/clients" class="mb-4 flex gap-4 items-end">
        <TextField
          label="Buscar"
          id="search"
          name="search"
          type="text"
          value={search}
          placeholder="Nome do cliente..."
          icon="ph-magnifying-glass"
        />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <div id="client-table">
        <Table
          columns={[
            { label: "Nome" },
            { label: "Email" },
            { label: "Telefone" },
            { label: "Tipo" },
            { label: "Status" },
          ]}
          rows={rows}
          emptyMsg="Nenhum cliente encontrado."
          emptyIcon="ph-users"
          ariaLabel="Lista de clientes"
        />
      </div>
      {hasMore ? (
        <div class="mt-4 text-center">
          <button
            class="btn btn-secondary"
            hx-get={`/clients?search=${encodeURIComponent(search)}&offset=25`}
            hx-target="#client-table"
            hx-swap="beforeend"
          >
            Carregar mais
          </button>
        </div>
      ) : null}
      <div class="mt-2 text-body-sm text-gray-500">{count ?? 0} cliente(s)</div>
    </>,
  );
});

// GET /clients/new -- render the create form.
clientsRoutes.get("/new", (c) => {
  return renderPage(
    c,
    { title: "Novo Cliente", active: "clients" },
    <>
      <PageHeader title="Novo Cliente" icon="ph-plus-circle" />
      <Panel>
        <form method="post" action="/clients" class="flex flex-col gap-4">
          <Select
            label="Tipo"
            id="client_type"
            name="client_type"
            options={[
              { value: "PF", label: "Pessoa Fisica" },
              { value: "PJ", label: "Pessoa Juridica" },
            ]}
            selected="PF"
            required
          />
          <TextField label="Nome" id="name" name="name" required placeholder="Nome completo ou razao social" />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="CPF" id="cpf" name="cpf" placeholder="00000000000" />
            <TextField label="CNPJ" id="cnpj" name="cnpj" placeholder="00000000000000" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Email" id="email" name="email" type="email" placeholder="cliente@email.com" />
            <TextField label="Telefone" id="phone" name="phone" placeholder="11999999999" />
          </div>
          <TextField label="Endereco" id="address" name="address" />
          <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href="/clients" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /clients -- create.
clientsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = clientSchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return renderPage(
      c,
      { title: "Novo Cliente", active: "clients" },
      <>
        <PageHeader title="Novo Cliente" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red">
            <i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>
            {Object.values(errors).flat().join(", ")}
          </div>
          <a href="/clients/new" class="btn btn-secondary">Voltar</a>
        </Panel>
      </>,
    );
  }

  const { error } = await supabase.from("clients").insert({
    tenant_id: user.tenantId,
    name: parsed.data.name,
    client_type: parsed.data.client_type,
    cpf: parsed.data.cpf || null,
    cnpj: parsed.data.cnpj || null,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    address: parsed.data.address || null,
    notes: parsed.data.notes || null,
  });

  if (error) {
    return renderPage(
      c,
      { title: "Novo Cliente", active: "clients" },
      <>
        <PageHeader title="Novo Cliente" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red"><i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>Erro ao salvar: {error.message}</div>
          <a href="/clients/new" class="btn btn-secondary">Voltar</a>
        </Panel>
      </>,
    );
  }

  return c.redirect("/clients");
});

// GET /clients/:id -- detail.
clientsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!client) {
    return c.html("Cliente nao encontrado.", 404);
  }

  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, case_number, status, case_type")
    .eq("client_id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return renderPage(
    c,
    { title: client.name, active: "clients" },
    <>
      <PageHeader
        title={client.name}
        icon="ph-user"
        actions={() => (
          <div class="flex gap-2">
            <a href={`/clients/${id}/edit`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-pencil" aria-hidden="true"></i>Editar</a>
            <form method="post" action={`/clients/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este cliente?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados do cliente" icon="ph-user">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{client.client_type === "PF" ? "Pessoa Fisica" : "Pessoa Juridica"}</dd></div>
            {client.cpf ? <div><dt class="font-semibold text-gray-700 inline">CPF: </dt><dd class="inline">{client.cpf}</dd></div> : null}
            {client.cnpj ? <div><dt class="font-semibold text-gray-700 inline">CNPJ: </dt><dd class="inline">{client.cnpj}</dd></div> : null}
            {client.email ? <div><dt class="font-semibold text-gray-700 inline">Email: </dt><dd class="inline">{client.email}</dd></div> : null}
            {client.phone ? <div><dt class="font-semibold text-gray-700 inline">Telefone: </dt><dd class="inline">{client.phone}</dd></div> : null}
            {client.address ? <div><dt class="font-semibold text-gray-700 inline">Endereco: </dt><dd class="inline">{client.address}</dd></div> : null}
          </dl>
        </Panel>
        {client.notes ? (
          <Panel title="Observacoes" icon="ph-note">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{client.notes}</p>
          </Panel>
        ) : null}
      </div>
      <Panel title="Processos" icon="ph-folder-open">
        <Table
          columns={[
            { label: "Titulo" },
            { label: "Numero" },
            { label: "Tipo" },
            { label: "Status" },
          ]}
          rows={(cases ?? []).map((cs) => [
            <a href={`/cases/${cs.id}`} class="text-terracota-600 hover:underline">{cs.title}</a> as unknown as string,
            cs.case_number ?? "-",
            cs.case_type,
            <Badge color={cs.status === "active" ? "green" : cs.status === "suspended" ? "yellow" : "gray"}>
              {cs.status === "active" ? "Ativo" : cs.status === "suspended" ? "Suspenso" : "Arquivado"}
            </Badge> as unknown as string,
          ])}
          emptyMsg="Nenhum processo vinculado."
        />
      </Panel>
    </>,
  );
});

// GET /clients/:id/edit -- edit form.
clientsRoutes.get("/:id/edit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!client) {
    return c.html("Cliente nao encontrado.", 404);
  }

  return renderPage(
    c,
    { title: `Editar ${client.name}`, active: "clients" },
    <>
      <PageHeader title={`Editar ${client.name}`} icon="ph-pencil" />
      <Panel>
        <form method="post" action={`/clients/${id}`} class="flex flex-col gap-4">
          <Select
            label="Tipo"
            id="client_type"
            name="client_type"
            options={[
              { value: "PF", label: "Pessoa Fisica" },
              { value: "PJ", label: "Pessoa Juridica" },
            ]}
            selected={client.client_type}
            required
          />
          <TextField label="Nome" id="name" name="name" required value={client.name} />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="CPF" id="cpf" name="cpf" value={client.cpf ?? ""} />
            <TextField label="CNPJ" id="cnpj" name="cnpj" value={client.cnpj ?? ""} />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Email" id="email" name="email" type="email" value={client.email ?? ""} />
            <TextField label="Telefone" id="phone" name="phone" value={client.phone ?? ""} />
          </div>
          <TextField label="Endereco" id="address" name="address" value={client.address ?? ""} />
          <Textarea label="Observacoes" id="notes" name="notes" rows={3}>
            {client.notes ?? ""}
          </Textarea>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href={`/clients/${id}`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /clients/:id -- update.
clientsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = clientSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/clients/${id}/edit`);
  }

  await supabase
    .from("clients")
    .update({
      name: parsed.data.name,
      client_type: parsed.data.client_type,
      cpf: parsed.data.cpf || null,
      cnpj: parsed.data.cnpj || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/clients/${id}`);
});

// POST /clients/:id/delete -- soft delete.
clientsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/clients");
});
