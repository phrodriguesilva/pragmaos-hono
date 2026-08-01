// Bootstrap script: creates the first tenant (Luiz Fabiano's law firm) and
// the first socio user. Run with: bun run seed
//
// Prerequisites:
//   1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
//   2. Run the migrations in supabase/migrations/ against your Supabase project
//   3. Run: bun run seed
//
// This script is idempotent: it skips if the tenant or user already exists.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Erro: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_NAME = process.env.SEED_TENANT_NAME ?? "Luiz Fabiano Advocacia";
const TENANT_CNPJ = process.env.SEED_TENANT_CNPJ ?? "00000000000000";
const USER_EMAIL = process.env.SEED_USER_EMAIL ?? "luiz@escritorio.com";
const USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? "Mudar123!";
const USER_NAME = process.env.SEED_USER_NAME ?? "Luiz Fabiano";

async function seed() {
  // 1. Create or find the tenant.
  let { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("cnpj", TENANT_CNPJ)
    .maybeSingle();

  if (!tenant) {
    const { data: newTenant, error } = await supabase
      .from("tenants")
      .insert({ name: TENANT_NAME, cnpj: TENANT_CNPJ, plan: "free", active: true })
      .select("id")
      .single();
    if (error) {
      console.error("Erro ao criar tenant:", error.message);
      process.exit(1);
    }
    tenant = newTenant;
    console.log(`Tenant criado: ${TENANT_NAME} (${tenant.id})`);
  } else {
    console.log(`Tenant ja existe: ${TENANT_NAME} (${tenant.id})`);
  }

  // 2. Create the auth user (or find if exists).
  const { data: existingUser } = await supabase.auth.admin.listUsers();
  const found = existingUser.users.find((u) => u.email === USER_EMAIL);

  let userId: string;
  if (found) {
    userId = found.id;
    console.log(`Usuario auth ja existe: ${USER_EMAIL} (${userId})`);
  } else {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email: USER_EMAIL,
      password: USER_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      console.error("Erro ao criar usuario auth:", error.message);
      process.exit(1);
    }
    userId = newUser.user.id;
    console.log(`Usuario auth criado: ${USER_EMAIL} (${userId})`);
  }

  // 3. Create or update the profile row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    const { error } = await supabase.from("profiles").insert({
      id: userId,
      tenant_id: tenant.id,
      email: USER_EMAIL,
      full_name: USER_NAME,
      role: "socio",
      active: true,
    });
    if (error) {
      console.error("Erro ao criar profile:", error.message);
      process.exit(1);
    }
    console.log(`Profile criado: ${USER_NAME} (socio)`);
  } else {
    console.log(`Profile ja existe: ${USER_NAME}`);
  }

  console.log("\nSeed concluido!");
  console.log(`Login: ${USER_EMAIL}`);
  console.log(`Senha: ${USER_PASSWORD}`);
  console.log("\nALTERE A SENHA APOS O PRIMEIRO LOGIN.");
}

seed().catch((err) => {
  console.error("Seed falhou:", err);
  process.exit(1);
});
