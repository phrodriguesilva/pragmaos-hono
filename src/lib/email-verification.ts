import { supabase } from "./supabase";
import { log } from "./logger";

const TOKEN_BYTES = 32;
const TOKEN_EXPIRY_HOURS = 24;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hash));
}

export async function generateVerificationToken(userId: string): Promise<string> {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const token = bytesToHex(bytes);
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  await supabase.from("email_verifications").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return token;
}

export async function verifyEmailToken(token: string): Promise<{ success: boolean; userId?: string; error?: string }> {
  const tokenHash = await hashToken(token);

  const { data: record, error } = await supabase
    .from("email_verifications")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !record) {
    return { success: false, error: "Token invalido ou nao encontrado." };
  }

  if (record.used_at) {
    return { success: false, error: "Token ja utilizado." };
  }

  if (new Date(record.expires_at) < new Date()) {
    return { success: false, error: "Token expirado." };
  }

  // Mark token as used.
  await supabase
    .from("email_verifications")
    .update({ used_at: new Date().toISOString() })
    .eq("id", record.id);

  // Confirm email in Supabase Auth.
  const { error: updateError } = await supabase.auth.admin.updateUserById(record.user_id, {
    email_confirm: true,
  });

  if (updateError) {
    log.error("Failed to confirm email after verification", { userId: record.user_id, error: updateError.message });
    return { success: false, error: "Erro ao confirmar email." };
  }

  return { success: true, userId: record.user_id };
}
