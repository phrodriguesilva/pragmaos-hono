// Self-service tenant provisioning.
// Allows new law firms to sign up and create their tenant automatically.
// Creates: tenant record, admin user, default settings.
//
// PragmaOS 2.

import { supabase } from "./supabase";
import { log } from "./logger";

export interface SignupRequest {
  firmName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  plan: "trial" | "starter" | "pro" | "enterprise";
  phone?: string;
}

export interface SignupResult {
  success: boolean;
  tenantId?: string;
  userId?: string;
  error?: string;
}

// Create a new tenant and admin user.
export async function provisionTenant(req: SignupRequest): Promise<SignupResult> {
  // 1. Check if email is already registered.
  const { data: existingUser } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", req.adminEmail)
    .maybeSingle();

  if (existingUser) {
    return { success: false, error: "Nao foi possivel criar a conta. Tente novamente ou entre em contato com o suporte." };
  }

  // 2. Create the auth user via Supabase Auth.
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: req.adminEmail,
    password: req.adminPassword,
    email_confirm: true, // auto-confirm for self-service
    user_metadata: {
      full_name: req.adminName,
      firm_name: req.firmName,
    },
  });

  if (authError || !authData.user) {
    log.error("Failed to create auth user during provisioning", { email: req.adminEmail, error: authError?.message });
    return { success: false, error: `Erro ao criar usuario: ${authError?.message ?? "erro desconhecido"}` };
  }

  const userId = authData.user.id;

  // 3. Create the tenant record.
  const slug = req.firmName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  // Ensure slug is unique.
  const { data: existingTenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const finalSlug = existingTenant ? `${slug}-${Date.now().toString(36)}` : slug;

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name: req.firmName,
      slug: finalSlug,
      plan: req.plan,
      status: "active",
      max_users: req.plan === "trial" ? 3 : req.plan === "starter" ? 10 : req.plan === "pro" ? 50 : 999,
      trial_ends_at: req.plan === "trial" ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : null,
    })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    log.error("Failed to create tenant during provisioning", { firmName: req.firmName, error: tenantError?.message });
    // Clean up: delete the auth user.
    await supabase.auth.admin.deleteUser(userId);
    return { success: false, error: `Erro ao criar escritorio: ${tenantError?.message ?? "erro desconhecido"}` };
  }

  const tenantId = tenant.id;

  // 4. Create the admin profile.
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      tenant_id: tenantId,
      email: req.adminEmail,
      full_name: req.adminName,
      role: "socio",
      phone: req.phone ?? null,
      active: true,
    });

  if (profileError) {
    log.error("Failed to create admin profile during provisioning", { userId, tenantId, error: profileError.message });
    // Clean up.
    await supabase.from("tenants").delete().eq("id", tenantId);
    await supabase.auth.admin.deleteUser(userId);
    return { success: false, error: `Erro ao criar perfil: ${profileError.message}` };
  }

  // 5. Create default settings for the tenant.
  await supabase
    .from("tenant_settings")
    .insert({
      tenant_id: tenantId,
      settings: {
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        currency: "BRL",
        date_format: "dd/MM/yyyy",
      },
    });

  // 6. Create default categories/tags.
  await supabase
    .from("case_tags")
    .insert([
      { tenant_id: tenantId, name: "Prioritario", color: "#ef4444" },
      { tenant_id: tenantId, name: "Media Complexidade", color: "#f59e0b" },
      { tenant_id: tenantId, name: "Alta Complexidade", color: "#dc2626" },
    ]);

  log.info("Tenant provisioned successfully", {
    tenantId,
    firmName: req.firmName,
    adminEmail: req.adminEmail,
    plan: req.plan,
  });

  return { success: true, tenantId, userId };
}

// Check if self-service signup is enabled.
export async function isSignupEnabled(): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "self_service_signup")
    .maybeSingle();

  // Default: enabled if no setting exists.
  return data?.value !== "false";
}
