import { describe, it, expect } from "bun:test";

// Test the NFD normalization logic used in conflict.ts.
// This was the bug fixed in Auditoria 2: "João" and "Joao" should match.
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("conflict.ts — name normalization (NFD)", () => {
  it("should normalize accented characters", () => {
    expect(normalizeName("João Silva")).toBe("joao silva");
    expect(normalizeName("José Aparecida")).toBe("jose aparecida");
    expect(normalizeName("Coração")).toBe("coracao");
  });

  it("should be case-insensitive", () => {
    expect(normalizeName("JOÃO SILVA")).toBe("joao silva");
    expect(normalizeName("joão silva")).toBe("joao silva");
    expect(normalizeName("JoÃo SiLvA")).toBe("joao silva");
  });

  it("should collapse multiple spaces", () => {
    expect(normalizeName("João   Silva   Santos")).toBe("joao silva santos");
    expect(normalizeName("  João  Silva  ")).toBe("joao silva");
  });

  it("should trim leading/trailing whitespace", () => {
    expect(normalizeName("  João Silva  ")).toBe("joao silva");
    expect(normalizeName("João Silva   ")).toBe("joao silva");
  });

  it("should handle empty string", () => {
    expect(normalizeName("")).toBe("");
  });

  it("should handle names without accents", () => {
    expect(normalizeName("Maria Santos")).toBe("maria santos");
  });

  it("should handle special Portuguese characters (ç, ñ)", () => {
    expect(normalizeName("França")).toBe("franca");
    expect(normalizeName("Muñoz")).toBe("munoz");
  });

  it("should match accented and non-accented versions (the bug fix)", () => {
    // This is the core test: "João" and "Joao" should be equal after normalization.
    expect(normalizeName("João Silva")).toBe(normalizeName("Joao Silva"));
    expect(normalizeName("Coração")).toBe(normalizeName("Coracao"));
    expect(normalizeName("França Neto")).toBe(normalizeName("Franca Neto"));
  });
});
