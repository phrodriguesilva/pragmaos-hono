import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const companiesRoutes = new Hono<AppEnv>();

companiesRoutes.use("*", requireAuth);

const companySchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  cnpj: z.string().optional(),
  email: z.string().email("Email invalido").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const representativeSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  cpf: z.string().optional(),
  email: z.string().email("Email invalido").optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.string().optional(),
});

// GET /companies -- list companies.
companiesRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, cnpj, email, phone, active")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = (companies ?? []).map((co) => [
    <a href={`/companies/${co.id}`} class="text-terracota-600 hover:underline">{co.name}</a> as unknown as string,
    co.cnpj ?? "-",
    co.email ?? "-",
    co.phone ?? "-",
    co.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Empresas", active: "companies" },
    <>
      <PageHeader
        title="Empresas"
        icon="ph-building"
        actions={() => (
          <a href="/companies/new" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-plus" aria-hidden="true"></i>Nova Empresa
          </a>
        )}
      />
      <Table
        columns={[
          { label: "Nome" },
          { label: "CNPJ" },
          { label: "Email" },
          { label: "Telefone" },
          { label: "Status" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma empresa encontrada."
        emptyIcon="ph-building"
        ariaLabel="Lista de empresas"
      />
    </>,
  );
});

// GET /companies/new -- render the create form.
companiesRoutes.get("/new", (c) => {
  return renderPage(
    c,
    { title: "Nova Empresa", active: "companies" },
    <>
      <PageHeader title="Nova Empresa" icon="ph-plus-circle" />
      <Panel>
        <form method="post" action="/companies" class="flex flex-col gap-4">
          <TextField label="Nome" id="name" name="name" required placeholder="Razao social" />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="CNPJ" id="cnpj" name="cnpj" placeholder="00000000000000" />
            <TextField label="Email" id="email" name="email" type="email" placeholder="empresa@email.com" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Telefone" id="phone" name="phone" placeholder="11999999999" />
            <TextField label="Endereco" id="address" name="address" />
          </div>
          <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href="/companies" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /companies -- create.
companiesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = companySchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return renderPage(
      c,
      { title: "Nova Empresa", active: "companies" },
      <>
        <PageHeader title="Nova Empresa" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red">
            <i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>
            {Object.values(errors).flat().join(", ")}
          </div>
          <a href="/companies/new" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar</a>
        </Panel>
      </>,
    );
  }

  const { error } = await supabase.from("companies").insert({
    tenant_id: user.tenantId,
    name: parsed.data.name,
    cnpj: parsed.data.cnpj || null,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    address: parsed.data.address || null,
    notes: parsed.data.notes || null,
    active: true,
  });

  if (error) {
    return renderPage(
      c,
      { title: "Nova Empresa", active: "companies" },
      <>
        <PageHeader title="Nova Empresa" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red"><i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>Erro ao salvar: {error.message}</div>
          <a href="/companies/new" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar</a>
        </Panel>
      </>,
    );
  }

  return c.redirect("/companies");
});

// GET /companies/:id -- detail: company info + representatives table.
companiesRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!company) {
    return c.html("Empresa nao encontrada.", 404);
  }

  const { data: representatives } = await supabase
    .from("company_representatives")
    .select("id, name, cpf, email, phone, role")
    .eq("company_id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return renderPage(
    c,
    { title: company.name, active: "companies" },
    <>
      <PageHeader
        title={company.name}
        icon="ph-building"
        actions={() => (
          <div class="flex gap-2">
            <a href={`/companies/${id}/edit`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-pencil" aria-hidden="true"></i>Editar</a>
            <form method="post" action={`/companies/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta empresa?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados da empresa" icon="ph-building">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">CNPJ: </dt><dd class="inline">{company.cnpj ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Email: </dt><dd class="inline">{company.email ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Telefone: </dt><dd class="inline">{company.phone ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Endereco: </dt><dd class="inline">{company.address ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline">{company.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge>}</dd></div>
          </dl>
        </Panel>
        {company.notes ? (
          <Panel title="Observacoes" icon="ph-note">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{company.notes}</p>
          </Panel>
        ) : null}
      </div>
      <Panel title="Representantes" icon="ph-users">
        <div class="mb-4">
          <a href={`/companies/${id}/representatives/new`} class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-plus" aria-hidden="true"></i>Novo Representante</a>
        </div>
        <Table
          columns={[
            { label: "Nome" },
            { label: "CPF" },
            { label: "Email" },
            { label: "Telefone" },
            { label: "Cargo" },
            { label: "Acoes", align: "center" },
          ]}
          rows={(representatives ?? []).map((rep) => [
            rep.name,
            rep.cpf ?? "-",
            rep.email ?? "-",
            rep.phone ?? "-",
            rep.role ?? "-",
            <form method="post" action={`/companies/${id}/representatives/${rep.id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este representante?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form> as unknown as string,
          ])}
          emptyMsg="Nenhum representante cadastrado."
          emptyIcon="ph-users"
          ariaLabel="Lista de representantes"
        />
      </Panel>
    </>,
  );
});

// GET /companies/:id/edit -- edit form.
companiesRoutes.get("/:id/edit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!company) {
    return c.html("Empresa nao encontrada.", 404);
  }

  return renderPage(
    c,
    { title: `Editar ${company.name}`, active: "companies" },
    <>
      <PageHeader title={`Editar ${company.name}`} icon="ph-pencil" />
      <Panel>
        <form method="post" action={`/companies/${id}`} class="flex flex-col gap-4">
          <TextField label="Nome" id="name" name="name" required value={company.name} />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="CNPJ" id="cnpj" name="cnpj" value={company.cnpj ?? ""} />
            <TextField label="Email" id="email" name="email" type="email" value={company.email ?? ""} />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Telefone" id="phone" name="phone" value={company.phone ?? ""} />
            <TextField label="Endereco" id="address" name="address" value={company.address ?? ""} />
          </div>
          <Textarea label="Observacoes" id="notes" name="notes" rows={3}>
            {company.notes ?? ""}
          </Textarea>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href={`/companies/${id}`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /companies/:id -- update.
companiesRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = companySchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/companies/${id}/edit`);
  }

  await supabase
    .from("companies")
    .update({
      name: parsed.data.name,
      cnpj: parsed.data.cnpj || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/companies/${id}`);
});

// POST /companies/:id/delete -- soft delete.
companiesRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/companies");
});

// GET /companies/:id/representatives/new -- form to create representative.
companiesRoutes.get("/:id/representatives/new", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!company) {
    return c.html("Empresa nao encontrada.", 404);
  }

  return renderPage(
    c,
    { title: "Novo Representante", active: "companies" },
    <>
      <PageHeader title="Novo Representante" icon="ph-user-plus" />
      <Panel>
        <p class="mb-4 text-body-sm text-gray-600">Empresa: <a href={`/companies/${id}`} class="text-terracota-600 hover:underline">{company.name}</a></p>
        <form method="post" action={`/companies/${id}/representatives`} class="flex flex-col gap-4">
          <TextField label="Nome" id="name" name="name" required placeholder="Nome completo" />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="CPF" id="cpf" name="cpf" placeholder="00000000000" />
            <TextField label="Cargo" id="role" name="role" placeholder="Diretor, Gerente..." />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Email" id="email" name="email" type="email" placeholder="representante@email.com" />
            <TextField label="Telefone" id="phone" name="phone" placeholder="11999999999" />
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href={`/companies/${id}`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /companies/:id/representatives -- create representative.
companiesRoutes.post("/:id/representatives", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = representativeSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/companies/${id}/representatives/new`);
  }

  await supabase.from("company_representatives").insert({
    tenant_id: user.tenantId,
    company_id: id,
    name: parsed.data.name,
    cpf: parsed.data.cpf || null,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    role: parsed.data.role || null,
  });

  return c.redirect(`/companies/${id}`);
});

// POST /companies/:id/representatives/:repId/delete -- soft delete representative.
companiesRoutes.post("/:id/representatives/:repId/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const repId = c.req.param("repId");

  await supabase
    .from("company_representatives")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", repId)
    .eq("company_id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/companies/${id}`);
});
