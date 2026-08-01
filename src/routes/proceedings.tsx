import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { translateMovement } from "../lib/ai";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const proceedingsRoutes = new Hono<AppEnv>();

proceedingsRoutes.use("*", requireAuth);

const proceedingSchema = z.object({
  case_id: z.string().uuid("Processo invalido"),
  cnj_number: z.string().min(1, "Numero CNJ e obrigatorio"),
  tribunal: z.string().optional(),
  district: z.string().optional(),
});

const movementSchema = z.object({
  movement_text: z.string().min(1, "Texto do movimento e obrigatorio"),
  movement_date: z.string().min(1, "Data do movimento e obrigatoria"),
});

// GET /proceedings -- list all proceedings for the tenant (with case title).
proceedingsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const { data: proceedings } = await supabase
    .from("proceedings")
    .select("id, cnj_number, tribunal, cases(title)")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = (proceedings ?? []).map((p) => [
    <a href={`/proceedings/${p.id}`} class="text-terracota-600 hover:underline">{p.cnj_number}</a> as unknown as string,
    (p.cases as unknown as { title: string } | null)?.title ?? "-",
    p.tribunal ?? "-",
  ]);

  return renderPage(
    c,
    { title: "Andamentos", active: "proceedings" },
    <>
      <PageHeader title="Andamentos" icon="ph-scales" actions={() => <a href="/proceedings/new" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-plus" aria-hidden="true"></i>Novo Processo CNJ</a>} />
      <Table
        columns={[{ label: "CNJ" }, { label: "Processo" }, { label: "Tribunal" }]}
        rows={rows}
        emptyMsg="Nenhum processo CNJ cadastrado."
        emptyIcon="ph-scales"
        ariaLabel="Lista de processos CNJ"
      />
    </>,
  );
});

// GET /proceedings/new -- create form.
proceedingsRoutes.get("/new", async (c) => {
  const user = c.get("user");
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");

  return renderPage(
    c,
    { title: "Novo Processo CNJ", active: "proceedings" },
    <>
      <PageHeader title="Novo Processo CNJ" icon="ph-plus-circle" />
      <Panel>
        <form method="post" action="/proceedings" class="flex flex-col gap-4">
          <Select label="Processo" id="case_id" name="case_id" required
            options={(cases ?? []).map((cs) => ({ value: cs.id, label: cs.title }))}
          />
          <TextField label="Numero CNJ" id="cnj_number" name="cnj_number" required placeholder="0000000-00.0000.0.00.0000" />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Tribunal" id="tribunal" name="tribunal" />
            <TextField label="Comarca" id="district" name="district" />
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href="/proceedings" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /proceedings -- create.
proceedingsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = proceedingSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/proceedings/new");

  await supabase.from("proceedings").insert({
    tenant_id: user.tenantId,
    case_id: parsed.data.case_id,
    cnj_number: parsed.data.cnj_number,
    tribunal: parsed.data.tribunal || null,
    district: parsed.data.district || null,
  });

  return c.redirect("/proceedings");
});

// GET /proceedings/:id -- detail with movements.
proceedingsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: proceeding } = await supabase
    .from("proceedings")
    .select("*, cases(title, description)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!proceeding) return c.html("Processo CNJ nao encontrado.", 404);

  const { data: movements } = await supabase
    .from("proceeding_movements")
    .select("id, movement_text, ai_translation, movement_date, captured_at")
    .eq("proceeding_id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("movement_date", { ascending: false });

  const caseData = proceeding.cases as { title: string; description?: string } | null;

  return renderPage(
    c,
    { title: proceeding.cnj_number, active: "proceedings" },
    <>
      <PageHeader
        title={proceeding.cnj_number}
        icon="ph-scales"
        actions={() => (
          <div class="flex gap-2">
            <a href={`/proceedings/${id}/movements/new`} class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-plus" aria-hidden="true"></i>Novo Andamento</a>
            <form method="post" action={`/proceedings/${id}/delete`}>
              <button type="submit" class="btn btn-danger" onclick="return confirm('Excluir este processo CNJ?')"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button>
            </form>
          </div>
        )}
      />
      <Panel title="Dados do processo CNJ" icon="ph-scales">
        <dl class="flex flex-col gap-1 text-body-sm">
          <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline"><a href={`/cases/${proceeding.case_id}`} class="text-terracota-600 hover:underline">{caseData?.title ?? "-"}</a></dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Tribunal: </dt><dd class="inline">{proceeding.tribunal ?? "-"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Comarca: </dt><dd class="inline">{proceeding.district ?? "-"}</dd></div>
        </dl>
      </Panel>

      <div class="mt-6">
        <Panel title="Andamentos" icon="ph-list-dashes">
          <Table
            columns={[{ label: "Data" }, { label: "Movimento" }, { label: "Traducao IA" }, { label: "" }]}
            rows={(movements ?? []).map((m) => [
              new Date(m.movement_date).toLocaleDateString("pt-BR"),
              m.movement_text,
              m.ai_translation ? <span class="text-body-sm text-gray-600">{m.ai_translation}</span> : <span class="text-gray-400">-</span> as unknown as string,
              m.ai_translation ? null : (
                <form method="post" action={`/proceedings/${id}/movements/${m.id}/translate`}>
                  <button type="submit" class="btn btn-secondary"><i class="ph ph-translate" aria-hidden="true"></i>Traduzir IA</button>
                </form>
              ) as unknown as string,
            ])}
            emptyMsg="Nenhum andamento registrado."
          />
        </Panel>
      </div>
    </>,
  );
});

// GET /proceedings/:id/movements/new -- new movement form.
proceedingsRoutes.get("/:id/movements/new", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { data: proceeding } = await supabase
    .from("proceedings")
    .select("cnj_number")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!proceeding) return c.html("Processo CNJ nao encontrado.", 404);

  return renderPage(
    c,
    { title: "Novo Andamento", active: "proceedings" },
    <>
      <PageHeader title={`Novo Andamento - ${proceeding.cnj_number}`} icon="ph-plus-circle" />
      <Panel>
        <form method="post" action={`/proceedings/${id}/movements`} class="flex flex-col gap-4">
          <TextField label="Data do movimento" id="movement_date" name="movement_date" type="date" required />
          <Textarea label="Texto do movimento" id="movement_text" name="movement_text" rows={6} required />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href={`/proceedings/${id}`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /proceedings/:id/movements -- create movement.
proceedingsRoutes.post("/:id/movements", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = movementSchema.safeParse(body);
  if (!parsed.success) return c.redirect(`/proceedings/${id}/movements/new`);

  await supabase.from("proceeding_movements").insert({
    tenant_id: user.tenantId,
    proceeding_id: id,
    movement_text: parsed.data.movement_text,
    movement_date: new Date(parsed.data.movement_date).toISOString(),
  });

  return c.redirect(`/proceedings/${id}`);
});

// POST /proceedings/:id/movements/:mid/translate -- AI translate movement.
proceedingsRoutes.post("/:id/movements/:mid/translate", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const mid = c.req.param("mid");

  const { data: movement } = await supabase
    .from("proceeding_movements")
    .select("movement_text")
    .eq("id", mid)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!movement) return c.html("Andamento nao encontrado.", 404);

  const { data: proceeding } = await supabase
    .from("proceedings")
    .select("cases(title, description)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  const caseData = proceeding?.cases as unknown as { title: string; description?: string } | null;
  const context = caseData ? `${caseData.title}${caseData.description ? ` - ${caseData.description}` : ""}` : undefined;

  try {
    const translation = await translateMovement(user.tenantId, movement.movement_text, context);
    await supabase.from("proceeding_movements").update({ ai_translation: translation }).eq("id", mid).eq("tenant_id", user.tenantId);
  } catch (err) {
    console.error("translate error:", err);
  }

  return c.redirect(`/proceedings/${id}`);
});

// POST /proceedings/:id/delete -- soft delete.
proceedingsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("proceedings").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/proceedings");
});
