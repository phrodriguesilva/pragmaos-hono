// AES-256-GCM encryption for sensitive data at rest (OAuth tokens, etc.).
// Uses a 32-byte key derived from the ENCRYPTION_KEY env var via PBKDF2.
// The key is never stored in the database — only ciphertext + IV + auth tag.

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { ENCRYPTION_KEY } from "./env";

const SALT = "pragmaos-salt-v1"; // Static salt — key derivation is deterministic by design.
const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 12; // 96 bits for GCM (recommended)

// Derive a 32-byte key from the env var using PBKDF2.
// This is done once and cached.
let derivedKey: Buffer | null = null;

function getKey(): Buffer {
  if (derivedKey) return derivedKey;
  if (!ENCRYPTION_KEY) {
    // In development without ENCRYPTION_KEY, use a deterministic fallback.
    // This is NOT secure for production — the env.ts validator should enforce it.
    if ((typeof Bun !== "undefined" ? Bun.env : process.env).NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY e obrigatorio em producao para criptografar tokens.");
    }
    console.warn("[CRYPTO] ENCRYPTION_KEY nao configurada — usando chave de desenvolvimento (NAO SEGURA).");
    derivedKey = pbkdf2Sync("pragmaos-dev-key-not-secure", SALT, 100000, KEY_LENGTH, "sha256");
    return derivedKey;
  }
  derivedKey = pbkdf2Sync(ENCRYPTION_KEY, SALT, 100000, KEY_LENGTH, "sha256");
  return derivedKey;
}

// Encrypt a string. Returns a base64 string containing IV + ciphertext + auth tag.
// Format: base64(iv[12] + authTag[16] + ciphertext)
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Prepend IV and auth tag so we can decrypt later.
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return `enc:v1:${combined.toString("base64")}`;
}

// Decrypt a string produced by encrypt(). Returns the original plaintext.
// Returns null if the input is not encrypted (for backward compatibility with
// plaintext tokens stored before encryption was enabled).
export function decrypt(ciphertext: string): string | null {
  if (!ciphertext.startsWith("enc:v1:")) {
    // Not encrypted — return as-is (backward compatibility).
    return ciphertext;
  }
  try {
    const key = getKey();
    const combined = Buffer.from(ciphertext.slice(7), "base64");
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = combined.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    console.error("[CRYPTO] Falha ao descriptografar — chave incorreta ou dados corrompidos.");
    return null;
  }
}

// Check if a value is encrypted (starts with our prefix).
export function isEncrypted(value: string): boolean {
  return value.startsWith("enc:v1:");
}
