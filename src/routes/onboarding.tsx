// Onboarding wizard — runs after signup, before the user reaches the dashboard.
// Steps: company -> areas -> team -> branding -> done
// Uses a dedicated full-screen layout (no sidebar) to keep focus.

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { z } from "zod";
import { requireAuth } from "../lib/session";
import { supabase } from "../lib/supabase";
import { appCss } from "../generated/css";
import { getOnboardingState, completeStep, ONBOARDING_STEPS, type OnboardingStep } from "../lib/onboarding";
import { log } from "../lib/logger";

export const onboardingRoutes = new Hono<AppEnv>();

onboardingRoutes.use("*", requireAuth);

// ============================================================
// Onboarding layout (full-screen, no sidebar)
// ============================================================
function onboardingShell(title: string, stepIdx: number, children: unknown) {
  const total = ONBOARDING_STEPS.length - 1; // exclude "done"
  const pct = Math.round((stepIdx / total) * 100);
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} — Onboarding — PragmaOS</title>
        <link rel="icon" href="/static/img/icon.svg" type="image/svg+xml" />
        <link rel="preload" href="/static/fonts/Phosphor.woff2" as="font" type="font/woff2" crossorigin="" />
        <link rel="preload" href="/static/fonts/Phosphor-Bold.woff2" as="font" type="font/woff2" crossorigin="" />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script src="/static/js/alpine.min.js" defer />
      </head>
      <body class="bg-carvao-50 text-carvao-800 font-sans min-h-screen antialiased">
        <div class="min-h-screen flex flex-col">
          {/* Top bar */}
          <header class="bg-white border-b border-carvao-100">
            <div class="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-terracota-500 flex items-center justify-center">
                  <i class="ph-bold ph-scales text-white text-lg" aria-hidden="true" />
                </div>
                <span class="text-lg font-bold tracking-tight">PragmaOS</span>
              </div>
              <a href="/dashboard" class="text-sm text-carvao-400 hover:text-carvao-600 transition">Pular por agora</a>
            </div>
            {/* Progress bar */}
            <div class="h-1 bg-carvao-100">
              <div class="h-full bg-terracota-500 transition-all duration-300" style={`width: ${pct}%`} />
            </div>
          </header>

          {/* Content */}
          <main class="flex-1 flex items-start justify-center px-4 sm:px-6 py-10">
            <div class="w-full max-w-2xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

// Step labels for the indicator
const STEP_LABELS: Record<string, string> = {
  company: "Dados do escritório",
  areas: "Áreas de atuação",
  team: "Equipe",
  branding: "Identidade",
  done: "Concluído",
};

function stepIndicator(currentIdx: number) {
  return (
    <div class="flex items-center gap-2 mb-8 text-sm">
      {ONBOARDING_STEPS.slice(0, -1).map((s, i) => (
        <div class="flex items-center gap-2">
          <div class={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < currentIdx ? "bg-terracota-500 text-white" : i === currentIdx ? "bg-terracota-500 text-white ring-4 ring-terracota-100" : "bg-carvao-100 text-carvao-400"}`}>
            {i < currentIdx ? <i class="ph-bold ph-check" aria-hidden="true" /> : i + 1}
          </div>
          <span class={`hidden sm:inline ${i === currentIdx ? "font-semibold text-carvao-800" : "text-carvao-400"}`}>{STEP_LABELS[s]}</span>
          {i < ONBOARDING_STEPS.length - 2 && <div class={`w-6 h-px ${i < currentIdx ? "bg-terracota-500" : "bg-carvao-200"}`} />}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// GET /onboarding — redirect to the current step
// ============================================================
onboardingRoutes.get("/", async (c) => {
  const user = c.get("user");
  const state = await getOnboardingState(user.tenantId);

  if (state.completed) {
    return c.redirect("/dashboard");
  }

  return c.redirect(`/onboarding/${state.currentStep}`);
});

// ============================================================
// GET /onboarding/company — Step 1: company data
// ============================================================
onboardingRoutes.get("/company", async (c) => {
  const user = c.get("user");
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, cnpj, oab_number, address, phone, email_public, founded_year")
    .eq("id", user.tenantId)
    .single();

  const idx = ONBOARDING_STEPS.indexOf("company");
  return c.html(
    onboardingShell("Dados do Escritorio", idx, (
      <>
        {stepIndicator(idx)}
        <h1 class="text-2xl font-bold mb-2">Conte-nos sobre seu escritório</h1>
        <p class="text-carvao-500 mb-6 text-sm">Estes dados aparecem em documentos, cobranças e no seu site público. Você poderá editá-los depois.</p>

        <form method="post" action="/onboarding/company" class="bg-white rounded-2xl border border-carvao-100 p-6 flex flex-col gap-4">
          <div>
            <label for="name" class="block text-sm font-semibold text-carvao-700 mb-1">Nome do escritório *</label>
            <input id="name" name="name" type="text" required value={tenant?.name ?? ""} class="input w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="cnpj" class="block text-sm font-semibold text-carvao-700 mb-1">CNPJ</label>
              <input id="cnpj" name="cnpj" type="text" placeholder="00.000.000/0000-00" value={tenant?.cnpj ?? ""} class="input w-full" />
            </div>
            <div>
              <label for="oab_number" class="block text-sm font-semibold text-carvao-700 mb-1">OAB (registro)</label>
              <input id="oab_number" name="oab_number" type="text" placeholder="123456/SP" value={tenant?.oab_number ?? ""} class="input w-full" />
            </div>
          </div>
          <div>
            <label for="address" class="block text-sm font-semibold text-carvao-700 mb-1">Endereço</label>
            <input id="address" name="address" type="text" placeholder="Av. Paulista, 1000 - Sao Paulo/SP" value={tenant?.address ?? ""} class="input w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="phone" class="block text-sm font-semibold text-carvao-700 mb-1">Telefone</label>
              <input id="phone" name="phone" type="tel" placeholder="(11) 3000-0000" value={tenant?.phone ?? ""} class="input w-full" />
            </div>
            <div>
              <label for="email_public" class="block text-sm font-semibold text-carvao-700 mb-1">E-mail público</label>
              <input id="email_public" name="email_public" type="email" placeholder="contato@escritorio.com" value={tenant?.email_public ?? ""} class="input w-full" />
            </div>
          </div>
          <div>
            <label for="founded_year" class="block text-sm font-semibold text-carvao-700 mb-1">Ano de fundação</label>
            <input id="founded_year" name="founded_year" type="number" min="1900" max="2099" placeholder="2010" value={tenant?.founded_year ?? ""} class="input w-full" />
          </div>
          <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2 mt-2">
            Continuar <i class="ph-bold ph-arrow-right" aria-hidden="true" />
          </button>
        </form>
      </>
    )),
  );
});

const companySchema = z.object({
  name: z.string().min(2, "Nome obrigatorio"),
  cnpj: z.string().optional(),
  oab_number: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email_public: z.string().optional(),
  founded_year: z.coerce.number().int().min(1900).max(2099).optional(),
});

onboardingRoutes.post("/company", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) {
    return c.redirect("/onboarding/company");
  }

  await supabase
    .from("tenants")
    .update({
      name: parsed.data.name,
      cnpj: parsed.data.cnpj || null,
      oab_number: parsed.data.oab_number || null,
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
      email_public: parsed.data.email_public || null,
      founded_year: parsed.data.founded_year ?? null,
    })
    .eq("id", user.tenantId);

  await completeStep(user.tenantId, "company", parsed.data);
  return c.redirect("/onboarding/areas");
});

// ============================================================
// GET /onboarding/areas — Step 2: law areas
// ============================================================
onboardingRoutes.get("/areas", async (c) => {
  const user = c.get("user");
  const [{ data: allAreas }, { data: selected }] = await Promise.all([
    supabase.from("law_areas").select("id, name, slug, icon").order("name"),
    supabase.from("tenant_law_areas").select("law_area_id").eq("tenant_id", user.tenantId),
  ]);
  const selectedIds = new Set((selected ?? []).map((s) => s.law_area_id));
  const selectedCount = selectedIds.size;

  const idx = ONBOARDING_STEPS.indexOf("areas");
  return c.html(
    onboardingShell("Áreas de Atuação", idx, (
      <>
        {stepIndicator(idx)}
        <h1 class="text-2xl font-bold mb-2">Quais áreas seu escritório atua?</h1>
        <p class="text-carvao-500 mb-6 text-sm">Selecione todas que se aplicam. Isso ajuda a organizar processos e aparece no seu site público.</p>

        <form method="post" action="/onboarding/areas" class="bg-white rounded-2xl border border-carvao-100 p-6">
          {/* Search bar with Alpine.js live filter */}
          <div class="mb-4" {...{ "x-data": "{ q: '' }" }}>
            <div class="relative">
              <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-carvao-400" aria-hidden="true" />
              <input
                type="text"
                {...{ "x-model": "q", "@input": "$refs.grid.querySelectorAll('[data-area]').forEach(el => el.style.display = el.dataset.area.toLowerCase().includes(q.toLowerCase()) ? '' : 'none')" }}
                placeholder="Buscar área (ex: tributário, trabalhista, civil...)"
                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-carvao-200 text-sm focus:ring-2 focus:ring-terracota-400 focus:border-terracota-400"
                aria-label="Buscar áreas de atuação"
              />
            </div>
            <p class="text-xs text-carvao-400 mt-2">
              <span {...{ "x-text": "(() => { const grid = document.querySelector('[data-grid]'); const visible = grid ? Array.from(grid.querySelectorAll('[data-area]')).filter(el => el.style.display !== 'none').length : 0; return visible + ' áreas visíveis' })()" }}></span>
              {selectedCount > 0 && <span class="ml-2 text-terracota-600 font-medium">• {selectedCount} selecionada{selectedCount > 1 ? "s" : ""}</span>}
            </p>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3" data-grid {...{ "x-ref": "grid" }}>
            {(allAreas ?? []).map((a) => (
              <label
                data-area={a.name}
                class={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedIds.has(a.id) ? "border-terracota-500 bg-terracota-50" : "border-carvao-100 hover:border-carvao-300"}`}
              >
                <input type="checkbox" name="areas" value={a.id} checked={selectedIds.has(a.id)} class="accent-terracota-500" />
                <i class={`ph ${a.icon ?? "ph-scales"} text-lg text-terracota-600`} aria-hidden="true" />
                <span class="text-sm font-medium">{a.name}</span>
              </label>
            ))}
          </div>

          {/* Selected areas summary (always visible, even when filtered out) */}
          {selectedCount > 0 && (
            <div class="mt-6 pt-4 border-t border-carvao-100">
              <h3 class="text-sm font-semibold text-carvao-700 mb-2">Áreas selecionadas ({selectedCount})</h3>
              <div class="flex flex-wrap gap-2">
                {(allAreas ?? []).filter((a: any) => selectedIds.has(a.id)).map((a: any) => (
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-terracota-50 text-terracota-700 text-xs font-medium">
                    <i class={`ph ${a.icon ?? "ph-scales"} text-sm`} aria-hidden="true" />
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2 mt-6">
            Continuar <i class="ph-bold ph-arrow-right" aria-hidden="true" />
          </button>
        </form>
      </>
    )),
  );
});

onboardingRoutes.post("/areas", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const areas = (body.areas instanceof Array ? body.areas : body.areas ? [body.areas] : []) as string[];

  // Replace existing
  await supabase.from("tenant_law_areas").delete().eq("tenant_id", user.tenantId);
  if (areas.length > 0) {
    await supabase
      .from("tenant_law_areas")
      .insert(areas.map((aid, i) => ({ tenant_id: user.tenantId, law_area_id: aid, sort_order: i })));
  }

  await completeStep(user.tenantId, "areas", { areas });
  return c.redirect("/onboarding/team");
});

// ============================================================
// GET /onboarding/team — Step 3: invite team members
// ============================================================
onboardingRoutes.get("/team", async (c) => {
  const user = c.get("user");
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("tenant_id", user.tenantId)
    .order("created_at");

  const idx = ONBOARDING_STEPS.indexOf("team");
  return c.html(
    onboardingShell("Equipe", idx, (
      <>
        {stepIndicator(idx)}
        <h1 class="text-2xl font-bold mb-2">Convide sua equipe</h1>
        <p class="text-carvao-500 mb-6 text-sm">Adicione membros agora ou pule para fazer depois. Cada convite cria um usuário no seu escritório.</p>

        <div class="bg-white rounded-2xl border border-carvao-100 p-6 mb-4">
          <h3 class="font-semibold mb-3 text-sm">Membros atuais</h3>
          <ul class="space-y-2">
            {(members ?? []).map((m) => (
              <li class="flex items-center justify-between py-2 border-b border-carvao-50 last:border-0">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-carvao-100 flex items-center justify-center text-sm font-bold text-carvao-600">
                    {m.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div class="text-sm font-medium">{m.full_name}</div>
                    <div class="text-xs text-carvao-400">{m.email}</div>
                  </div>
                </div>
                <span class="text-xs px-2 py-1 rounded-full bg-carvao-50 text-carvao-500 capitalize">{m.role}</span>
              </li>
            ))}
          </ul>
        </div>

        <form method="post" action="/onboarding/team" class="bg-white rounded-2xl border border-carvao-100 p-6">
          <h3 class="font-semibold mb-3 text-sm">Adicionar membro (opcional)</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <input name="invite_name" type="text" placeholder="Nome" class="input w-full" />
            <input name="invite_email" type="email" placeholder="E-mail" class="input w-full" />
            <select name="invite_role" class="input w-full">
              <option value="advogado">Advogado(a)</option>
              <option value="socio">Sócio(a)</option>
              <option value="estagiario">Estagiário(a)</option>
              <option value="financeiro">Financeiro</option>
              <option value="recepcao">Recepção</option>
            </select>
          </div>
          <p class="text-xs text-carvao-400 mb-4">O membro receberá um e-mail para definir a senha. Você pode adicionar mais depois.</p>
          <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2">
            Continuar <i class="ph-bold ph-arrow-right" aria-hidden="true" />
          </button>
        </form>
      </>
    )),
  );
});

const teamSchema = z.object({
  invite_name: z.string().optional(),
  invite_email: z.string().email().optional().or(z.literal("")),
  invite_role: z.string().optional(),
});

onboardingRoutes.post("/team", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = teamSchema.safeParse(body);

  // Optionally invite a member
  if (parsed.success && parsed.data.invite_email && parsed.data.invite_name) {
    // Create auth user with a temporary password — they'll reset via email.
    const tempPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: parsed.data.invite_email,
      password: tempPass,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.invite_name, invited_by: user.fullName },
    });

    if (!authError && authData.user) {
      await supabase.from("profiles").insert({
        id: authData.user.id,
        tenant_id: user.tenantId,
        email: parsed.data.invite_email,
        full_name: parsed.data.invite_name,
        role: parsed.data.invite_role ?? "advogado",
        active: true,
      });
    } else {
      log.warn("Onboarding: failed to invite member", { email: parsed.data.invite_email, error: authError?.message });
    }
  }

  await completeStep(user.tenantId, "team", { invited: parsed.success ? (parsed.data.invite_email ?? null) : null });
  return c.redirect("/onboarding/branding");
});

// ============================================================
// GET /onboarding/branding — Step 4: identity (logo, colors, tagline)
// ============================================================
onboardingRoutes.get("/branding", async (c) => {
  const user = c.get("user");
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, tagline, description, primary_color, secondary_color, logo_url, subdomain")
    .eq("id", user.tenantId)
    .single();

  const idx = ONBOARDING_STEPS.indexOf("branding");
  return c.html(
    onboardingShell("Identidade", idx, (
      <>
        {stepIndicator(idx)}
        <h1 class="text-2xl font-bold mb-2">Personalize sua identidade</h1>
        <p class="text-carvao-500 mb-6 text-sm">Cores e tagline aparecem no seu site público e nos documentos. Você pode mudar tudo depois.</p>

        <form method="post" action="/onboarding/branding" class="bg-white rounded-2xl border border-carvao-100 p-6 flex flex-col gap-4">
          <div>
            <label for="tagline" class="block text-sm font-semibold text-carvao-700 mb-1">Slogan / Tagline</label>
            <input id="tagline" name="tagline" type="text" placeholder="Ex: Advocacia estrategica para empresas" value={tenant?.tagline ?? ""} class="input w-full" />
          </div>
          <div>
            <label for="description" class="block text-sm font-semibold text-carvao-700 mb-1">Descrição curta</label>
            <textarea id="description" name="description" rows={2} placeholder="Em 1-2 frases, o que seu escritorio faz." class="input w-full">{tenant?.description ?? ""}</textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="primary_color" class="block text-sm font-semibold text-carvao-700 mb-1">Cor primária</label>
              <div class="flex items-center gap-2">
                <input id="primary_color" name="primary_color" type="color" value={tenant?.primary_color ?? "#c8553d"} class="w-12 h-10 rounded cursor-pointer border border-carvao-200" />
                <input type="text" value={tenant?.primary_color ?? "#c8553d"} readonly class="input flex-1 text-sm" />
              </div>
            </div>
            <div>
              <label for="secondary_color" class="block text-sm font-semibold text-carvao-700 mb-1">Cor secundária</label>
              <div class="flex items-center gap-2">
                <input id="secondary_color" name="secondary_color" type="color" value={tenant?.secondary_color ?? "#2b2925"} class="w-12 h-10 rounded cursor-pointer border border-carvao-200" />
                <input type="text" value={tenant?.secondary_color ?? "#2b2925"} readonly class="input flex-1 text-sm" />
              </div>
            </div>
          </div>
          <div>
            <label for="subdomain" class="block text-sm font-semibold text-carvao-700 mb-1">Subdomínio do seu site público</label>
            <div class="flex items-center gap-1">
              <input id="subdomain" name="subdomain" type="text" placeholder="meu-escritorio" value={tenant?.subdomain ?? ""} class="input flex-1" />
              <span class="text-sm text-carvao-400">.pragmaos.app</span>
            </div>
            <p class="text-xs text-carvao-400 mt-1">Seu site ficara em <strong>subdominio.pragmaos.app</strong>. Voce pode usar dominio proprio depois.</p>
          </div>
          <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2 mt-2">
            Concluir onboarding <i class="ph-bold ph-check-circle" aria-hidden="true" />
          </button>
        </form>
      </>
    )),
  );
});

const brandingSchema = z.object({
  tagline: z.string().optional(),
  description: z.string().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  subdomain: z.string().optional(),
});

onboardingRoutes.post("/branding", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = brandingSchema.safeParse(body);
  if (!parsed.success) {
    return c.redirect("/onboarding/branding");
  }

  // Check subdomain uniqueness if provided
  let subdomain = parsed.data.subdomain?.trim().toLowerCase() || null;
  if (subdomain) {
    subdomain = subdomain.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("subdomain", subdomain)
      .neq("id", user.tenantId)
      .maybeSingle();
    if (existing) {
      subdomain = `${subdomain}-${Date.now().toString(36)}`;
    }
  }

  await supabase
    .from("tenants")
    .update({
      tagline: parsed.data.tagline || null,
      description: parsed.data.description || null,
      primary_color: parsed.data.primary_color || "#c8553d",
      secondary_color: parsed.data.secondary_color || "#2b2925",
      subdomain,
    })
    .eq("id", user.tenantId);

  await completeStep(user.tenantId, "branding", parsed.data);
  return c.redirect("/onboarding/done");
});

// ============================================================
// GET /onboarding/done — completion screen
// ============================================================
onboardingRoutes.get("/done", async (c) => {
  const user = c.get("user");
  const state = await getOnboardingState(user.tenantId);
  if (!state.completed) {
    // Mark the final "done" step as complete — this sets onboarding_completed = true.
    // (completeStep("branding") only advances the pointer to "done" but doesn't flip
    // the completed flag, so we must complete the "done" step itself.)
    await completeStep(user.tenantId, "done");
  }

  const idx = ONBOARDING_STEPS.indexOf("done");
  return c.html(
    onboardingShell("Tudo pronto!", idx, (
      <div class="text-center py-10">
        <div class="w-20 h-20 rounded-full bg-status-green-bg flex items-center justify-center mx-auto mb-6">
          <i class="ph-bold ph-check-circle text-4xl text-status-green" aria-hidden="true" />
        </div>
        <h1 class="text-3xl font-bold mb-3">Tudo pronto!</h1>
        <p class="text-carvao-500 mb-8 max-w-md mx-auto">
          Seu escritório está configurado. Agora você pode começar a usar o PragmaOS — adicionar processos, clientes e explorar todos os recursos.
        </p>
        <a href="/dashboard" class="btn btn-primary inline-flex items-center gap-2 px-8 py-3">
          <i class="ph-bold ph-squares-four" aria-hidden="true" />
          Ir para o Dashboard
        </a>
      </div>
    )),
  );
});
