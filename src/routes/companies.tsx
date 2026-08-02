import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge, Modal } from "../components/ui";

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
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let query = supabase
    .from("companies")
    .select("id, name, cnpj, email, phone, active", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) query = query.ilike("name", `%${search}%`);

  query = query.range(offset, offset + limit - 1);

  const { data: companies, count } = await query;
  const totalPages = count ? Math.ceil(count / limit) : 1;

  const rows = (companies ?? []).map((co) => [
    <a href={`/companies/${co.id}`} class="text-[#0568ff] hover:underline">{co.name}</a> as unknown as string,
    co.cnpj ?? "-",
    co.email ?? "-",
    co.phone ?? "-",
    co.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/companies/${co.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <a href={`/companies/${co.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/companies/${co.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Empresas", active: "companies" },
    <>
      <PageHeader
        title="Empresas"
        icon="ph-building"
        actions={() => (
          <Modal
            id="newCompany"
            title="Nova Empresa"
            icon="ph-building"
            triggerText="Nova Empresa"
            triggerIcon="ph-plus"
            action="/companies"
            submitLabel="Salvar"
            large
          >
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
          </Modal>
        )}
      />
      <form method="get" action="/companies" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Nome da empresa..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Nome" },
          { label: "CNPJ" },
          { label: "Email" },
          { label: "Telefone" },
          { label: "Status" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma empresa encontrada."
        emptyIcon="ph-building"
        ariaLabel="Lista de empresas"
        count={count ?? 0}
        countLabel="empresa(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/companies",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST /companies -- create.
companiesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = companySchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect("/companies");
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
    return c.redirect("/companies");
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
            <Modal
              id="editCompany"
              title="Editar Empresa"
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/companies/${id}`}
              submitLabel="Salvar Alteracoes"
              large
            >
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
            </Modal>
            <form method="post" action={`/companies/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta empresa?')" aria-label="Excluir">
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
          <Modal
            id="newRepresentative"
            title="Novo Representante"
            icon="ph-user-plus"
            triggerText="Novo Representante"
            triggerIcon="ph-plus"
            action={`/companies/${id}/representatives`}
            submitLabel="Salvar"
          >
            <TextField label="Nome" id="name" name="name" required placeholder="Nome completo" />
            <div class="grid grid-cols-2 gap-4">
              <TextField label="CPF" id="cpf" name="cpf" placeholder="00000000000" />
              <TextField label="Cargo" id="role" name="role" placeholder="Diretor, Gerente..." />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <TextField label="Email" id="email" name="email" type="email" placeholder="representante@email.com" />
              <TextField label="Telefone" id="phone" name="phone" placeholder="11999999999" />
            </div>
          </Modal>
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
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este representante?')" aria-label="Excluir">
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

// POST /companies/:id -- update.
companiesRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = companySchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/companies/${id}`);
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

// POST /companies/:id/representatives -- create representative.
companiesRoutes.post("/:id/representatives", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = representativeSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/companies/${id}`);
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
