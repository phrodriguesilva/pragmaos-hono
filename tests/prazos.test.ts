import { describe, it, expect } from "bun:test";
import { isFeriadoNacional, isDiaUtil, calcularPrazo, proximosDiasUteis, formatDataBR, PRAZOS_CPC } from "../src/lib/prazos";

describe("prazos.ts", () => {
  it("should identify national holidays", () => {
    // Confraternizacao mundial (Jan 1).
    expect(isFeriadoNacional(new Date(2024, 0, 1))).toBe(true);
    // Independence day (Sep 7).
    expect(isFeriadoNacional(new Date(2024, 8, 7))).toBe(true);
    // Christmas (Dec 25).
    expect(isFeriadoNacional(new Date(2024, 11, 25))).toBe(true);
    // Regular day (Feb 15).
    expect(isFeriadoNacional(new Date(2024, 1, 15))).toBe(false);
  });

  it("should identify business days (outside recesso)", () => {
    // Monday Feb 5, 2024 — outside recesso (Jan 1-20).
    expect(isDiaUtil(new Date(2024, 1, 5))).toBe(true);
    // Saturday Feb 10.
    expect(isDiaUtil(new Date(2024, 1, 10))).toBe(false);
    // Sunday Feb 11.
    expect(isDiaUtil(new Date(2024, 1, 11))).toBe(false);
    // Holiday (Sep 7).
    expect(isDiaUtil(new Date(2024, 8, 7))).toBe(false);
  });

  it("should identify recesso forense (Jan 1-20, Dec 20-31)", () => {
    // Jan 15 is within recesso.
    expect(isDiaUtil(new Date(2024, 0, 15))).toBe(false);
    // Jan 21 is outside recesso (Sunday, but recesso check passes).
    // Actually Jan 21 2024 is a Sunday, so still not business day.
    // Feb 1 is outside recesso.
    expect(isDiaUtil(new Date(2024, 1, 1))).toBe(true);
    // Dec 25 is within recesso + also Christmas.
    expect(isDiaUtil(new Date(2024, 11, 25))).toBe(false);
  });

  it("should calculate prazo with dias_uteis", () => {
    // Start on Monday Feb 5, 2024 + 5 business days = Monday Feb 12.
    const result = calcularPrazo({
      tipo: "dias_uteis",
      dias: 5,
      dataInicio: new Date(2024, 1, 5),
    });
    expect(result.dataVencimento).toBeInstanceOf(Date);
    expect(result.diasUteisContados).toBe(5);
    // Feb 5 (Mon) + 5 business days = Feb 12 (Mon).
    expect(result.dataVencimento.getDay()).toBe(1); // Monday
    expect(result.dataVencimento.getDate()).toBe(12);
  });

  it("should calculate prazo with dias_corridos", () => {
    const result = calcularPrazo({
      tipo: "dias_corridos",
      dias: 7,
      dataInicio: new Date(2024, 1, 5),
    });
    // 7 calendar days later = Feb 12.
    expect(result.dataVencimento.getDate()).toBe(12);
  });

  it("should return next business days", () => {
    const days = proximosDiasUteis(5, []);
    expect(days.length).toBe(5);
    for (const d of days) {
      expect(isDiaUtil(d)).toBe(true);
    }
  });

  it("should format date in BR format", () => {
    const d = new Date(2024, 1, 15);
    const formatted = formatDataBR(d);
    expect(formatted).toContain("15");
    expect(formatted).toContain("02");
    expect(formatted).toContain("2024");
  });

  it("should have CPC prazo definitions", () => {
    expect(Object.keys(PRAZOS_CPC).length).toBeGreaterThan(0);
    // Each should have tipo, dias, descricao.
    for (const [key, val] of Object.entries(PRAZOS_CPC)) {
      expect(val.tipo).toBeDefined();
      // "personalizado" has dias: 0, which is valid.
      expect(val.dias).toBeGreaterThanOrEqual(0);
      expect(val.descricao).toBeTruthy();
    }
  });

  it("should have known CPC prazos", () => {
    expect(PRAZOS_CPC["contestacao"].dias).toBe(15);
    expect(PRAZOS_CPC["embargos_declaracao"].dias).toBe(5);
  });
});
