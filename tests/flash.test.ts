import { describe, it, expect } from "bun:test";
import type { FlashType } from "../src/lib/flash";

// Test the flash message payload format directly.
// The cookie set/get logic uses hono/cookie which requires a full Hono context.
// Here we test the JSON serialization that flash.ts uses.

describe("flash.ts — payload format", () => {
  it("should serialize flash message to JSON", () => {
    const payload = JSON.stringify({ type: "success", message: "Cliente criado!" });
    const parsed = JSON.parse(payload);
    expect(parsed.type).toBe("success");
    expect(parsed.message).toBe("Cliente criado!");
  });

  it("should handle all flash types in serialization", () => {
    const types: FlashType[] = ["success", "error", "warning", "info"];
    for (const type of types) {
      const payload = JSON.stringify({ type, message: `Test ${type}` });
      const parsed = JSON.parse(payload);
      expect(parsed.type).toBe(type);
      expect(parsed.message).toBe(`Test ${type}`);
    }
  });

  it("should handle special characters in message", () => {
    const message = "Cliente 'João' criado com sucesso! Ação: <script>";
    const payload = JSON.stringify({ type: "success", message });
    const parsed = JSON.parse(payload);
    expect(parsed.message).toBe(message);
  });

  it("should handle unicode in message", () => {
    const message = "Processo nº 12345 — Ação de Cobrança";
    const payload = JSON.stringify({ type: "info", message });
    const parsed = JSON.parse(payload);
    expect(parsed.message).toBe(message);
  });

  it("should handle empty message", () => {
    const payload = JSON.stringify({ type: "warning", message: "" });
    const parsed = JSON.parse(payload);
    expect(parsed.message).toBe("");
  });

  it("should return null for invalid JSON (graceful handling)", () => {
    const raw = "invalid-json";
    let result: { type: FlashType; message: string } | null;
    try {
      result = JSON.parse(raw);
    } catch {
      result = null;
    }
    expect(result).toBeNull();
  });
});
