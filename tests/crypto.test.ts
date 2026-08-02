import { describe, it, expect } from "bun:test";
import { encrypt, decrypt, isEncrypted } from "../src/lib/crypto";

describe("crypto.ts", () => {
  it("should encrypt and decrypt a string", () => {
    const plaintext = "my-secret-oauth-token-12345";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(isEncrypted(encrypted)).toBe(true);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for same plaintext", () => {
    const plaintext = "same-secret";
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    // Different IVs should produce different ciphertexts.
    expect(enc1).not.toBe(enc2);
    // Both should decrypt to the same value.
    expect(decrypt(enc1)).toBe(plaintext);
    expect(decrypt(enc2)).toBe(plaintext);
  });

  it("should handle empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("should handle special characters", () => {
    const plaintext = "token-with-special-chars!@#$%^&*()_+-=[]{}|;':\",./<>?";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("should handle unicode", () => {
    const plaintext = "token-with-unicode-áéíóú-ç-ñ-ü-日本語";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("should return null for invalid ciphertext", () => {
    const result = decrypt("enc:v1:invalid-base64!!!");
    expect(result).toBeNull();
  });

  it("should return plaintext for non-encrypted values (backward compat)", () => {
    const plaintext = "old-plaintext-token";
    const result = decrypt(plaintext);
    expect(result).toBe(plaintext);
  });

  it("isEncrypted should detect encrypted values", () => {
    expect(isEncrypted(encrypt("test"))).toBe(true);
    expect(isEncrypted("plain-text")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });
});
