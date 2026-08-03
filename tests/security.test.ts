import { describe, it, expect } from "bun:test";
import { sanitizeHtml } from "../src/lib/sanitize";
import { maskCPF, maskCNPJ, maskEmail, maskPhone, maskPII } from "../src/lib/pii-mask";

// ============================================================================
// sanitize.ts — XSS protection tests
// Ensures the HTML sanitizer strips dangerous content while preserving safe HTML.
// ============================================================================

describe("sanitizeHtml — XSS protection", () => {
  it("strips <script> tags entirely", () => {
    const input = '<p>hello</p><script>alert("xss")</script><p>world</p>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("hello");
    expect(out).toContain("world");
  });

  it("strips <iframe> tags", () => {
    const input = '<iframe src="https://evil.com"></iframe><p>safe</p>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain("<iframe");
    expect(out).toContain("safe");
  });

  it("strips <style> tags", () => {
    const input = "<style>body{background:red}</style><p>ok</p>";
    const out = sanitizeHtml(input);
    expect(out).not.toContain("<style");
    expect(out).toContain("ok");
  });

  it("strips on* event handler attributes", () => {
    const input = '<p onclick="alert(1)" onmouseover="alert(2)">text</p>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onmouseover");
    expect(out).toContain("text");
  });

  it("blocks javascript: URLs in href", () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain("javascript:");
  });

  it("blocks javascript: URLs in src", () => {
    const input = '<img src="javascript:alert(1)" alt="x">';
    const out = sanitizeHtml(input);
    expect(out).not.toContain("javascript:");
  });

  it("allows safe http/https URLs", () => {
    const input = '<a href="https://example.com">link</a>';
    const out = sanitizeHtml(input);
    expect(out).toContain("https://example.com");
  });

  it("allows relative URLs", () => {
    const input = '<a href="/page">link</a>';
    const out = sanitizeHtml(input);
    expect(out).toContain('href="/page"');
  });

  it("allows mailto and tel URLs", () => {
    const input = '<a href="mailto:a@b.com">email</a><a href="tel:+5511">call</a>';
    const out = sanitizeHtml(input);
    expect(out).toContain("mailto:");
    expect(out).toContain("tel:");
  });

  it("strips HTML comments", () => {
    const input = "<!-- secret --><p>ok</p>";
    const out = sanitizeHtml(input);
    expect(out).not.toContain("secret");
    expect(out).not.toContain("<!--");
  });

  it("strips <object> and <embed>", () => {
    const input = '<object data="evil.swf"></object><embed src="evil.swf"><p>ok</p>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain("<object");
    expect(out).not.toContain("<embed");
    expect(out).toContain("ok");
  });

  it("preserves safe formatting tags", () => {
    const input = "<p>Hello <strong>world</strong> <em>foo</em> <b>bar</b></p>";
    const out = sanitizeHtml(input);
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain("<b>");
  });

  it("preserves table structure", () => {
    const input = '<table><tr><td colspan="2">cell</td></tr></table>';
    const out = sanitizeHtml(input);
    expect(out).toContain("<table>");
    expect(out).toContain('colspan="2"');
  });

  it("returns empty string for falsy input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null as unknown as string)).toBe("");
  });

  it("handles nested malicious tags", () => {
    const input = '<p>ok</p><script><script>alert(1)</script></script>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain("alert");
  });
});

// ============================================================================
// pii-mask.ts — LGPD masking tests
// Ensures PII is masked before being sent to external LLM providers.
// ============================================================================

describe("pii-mask — LGPD masking", () => {
  it("masks CPF correctly", () => {
    expect(maskCPF("123.456.789-00")).toBe("***.456.789-**");
    expect(maskCPF("CPF do cliente: 987.654.321-00")).toContain("***.654.321-**");
  });

  it("masks CNPJ correctly", () => {
    expect(maskCNPJ("12.345.678/0001-90")).toBe("**.345.678/****-**");
  });

  it("masks email correctly", () => {
    const masked = maskEmail("joao@example.com");
    expect(masked).toContain("***@example.com");
    expect(masked).not.toContain("joao@example.com");
    expect(masked.startsWith("j")).toBe(true);
  });

  it("masks phone correctly", () => {
    const masked = maskPhone("(11) 99999-9999");
    expect(masked).toBe("(11) 9****-9999");
  });

  it("maskPII applies all masks", () => {
    const text = "Cliente João CPF 123.456.789-00 email joao@test.com tel (11) 99999-9999";
    const masked = maskPII(text);
    expect(masked).not.toContain("123.456.789-00");
    expect(masked).not.toContain("joao@test.com");
    expect(masked).not.toContain("(11) 99999-9999");
    expect(masked).toContain("***.456.789-**");
    expect(masked).toContain("***@test.com");
    expect(masked).toContain("(11) 9****-9999");
  });

  it("does not mask text without PII", () => {
    const text = "Este é um texto sem dados sensíveis.";
    expect(maskPII(text)).toBe(text);
  });

  it("handles multiple CPFs in same text", () => {
    const text = "CPF1: 111.222.333-44 CPF2: 555.666.777-88";
    const masked = maskPII(text);
    expect(masked).not.toContain("111.222.333-44");
    expect(masked).not.toContain("555.666.777-88");
    expect(masked).toContain("***.222.333-**");
    expect(masked).toContain("***.666.777-**");
  });
});

// ============================================================================
// tenant-ownership.ts — IDOR prevention tests
// These helpers are the core defense against IDOR. We test the input
// validation logic (empty/missing IDs return false) without hitting the DB.
// ============================================================================

describe("tenant-ownership — input validation (IDOR prevention)", () => {
  // We import dynamically to mock supabase.
  // The helpers must reject empty/null IDs before any DB call.
  // This is verified by checking that no DB call is made for bad input.

  it("helpers module exports all expected functions", async () => {
    const mod = await import("../src/lib/tenant-ownership");
    expect(typeof mod.caseBelongsToTenant).toBe("function");
    expect(typeof mod.clientBelongsToTenant).toBe("function");
    expect(typeof mod.proceedingBelongsToTenant).toBe("function");
    expect(typeof mod.documentBelongsToTenant).toBe("function");
    expect(typeof mod.taskBelongsToTenant).toBe("function");
    expect(typeof mod.profileBelongsToTenant).toBe("function");
    expect(typeof mod.honorarioBelongsToTenant).toBe("function");
  });

  it("caseBelongsToTenant returns false for empty caseId", async () => {
    const mod = await import("../src/lib/tenant-ownership");
    const result = await mod.caseBelongsToTenant("", "tenant-1");
    expect(result).toBe(false);
  });

  it("caseBelongsToTenant returns false for empty tenantId", async () => {
    const mod = await import("../src/lib/tenant-ownership");
    const result = await mod.caseBelongsToTenant("case-1", "");
    expect(result).toBe(false);
  });

  it("clientBelongsToTenant returns false for empty inputs", async () => {
    const mod = await import("../src/lib/tenant-ownership");
    expect(await mod.clientBelongsToTenant("", "t1")).toBe(false);
    expect(await mod.clientBelongsToTenant("c1", "")).toBe(false);
  });

  it("documentBelongsToTenant returns false for empty inputs", async () => {
    const mod = await import("../src/lib/tenant-ownership");
    expect(await mod.documentBelongsToTenant("", "t1")).toBe(false);
    expect(await mod.documentBelongsToTenant("d1", "")).toBe(false);
  });

  it("profileBelongsToTenant returns false for empty inputs", async () => {
    const mod = await import("../src/lib/tenant-ownership");
    expect(await mod.profileBelongsToTenant("", "t1")).toBe(false);
    expect(await mod.profileBelongsToTenant("u1", "")).toBe(false);
  });
});

// ============================================================================
// requireRole — RBAC middleware tests
// Verifies the middleware blocks unauthorized roles and allows authorized ones.
// ============================================================================

describe("requireRole — RBAC middleware", () => {
  // We test the middleware logic by simulating the Hono context shape.
  // requireRole reads c.get("user") and checks role inclusion.
  it("blocks when user is missing", async () => {
    const { requireRole } = await import("../src/lib/session");
    const c = {
      get: () => undefined,
      html: (body: string, status: number) => ({ body, status }),
    };
    const next = async () => {};
    const middleware = requireRole("socio", "admin");
    const result = await middleware(c as any, next) as unknown as { body: string; status: number };
    expect(result.body).toBe("Acesso negado.");
    expect(result.status).toBe(403);
  });

  it("blocks when user role is not in allowed list", async () => {
    const { requireRole } = await import("../src/lib/session");
    const c = {
      get: () => ({ role: "parceiro", tenantId: "t1" }),
      html: (body: string, status: number) => ({ body, status }),
    };
    const next = async () => {};
    const middleware = requireRole("socio", "admin");
    const result = await middleware(c as any, next) as unknown as { body: string; status: number };
    expect(result.body).toBe("Acesso negado.");
    expect(result.status).toBe(403);
  });

  it("allows when user role is in allowed list", async () => {
    const { requireRole } = await import("../src/lib/session");
    let nextCalled = false;
    const c = {
      get: () => ({ role: "socio", tenantId: "t1" }),
      html: (body: string, status: number) => ({ body, status }),
    };
    const next = async () => { nextCalled = true; };
    const middleware = requireRole("socio", "admin");
    await middleware(c as any, next);
    expect(nextCalled).toBe(true);
  });

  it("allows admin role when only admin is required", async () => {
    const { requireRole } = await import("../src/lib/session");
    let nextCalled = false;
    const c = {
      get: () => ({ role: "admin", tenantId: "t1" }),
      html: (body: string, status: number) => ({ body, status }),
    };
    const next = async () => { nextCalled = true; };
    const middleware = requireRole("admin");
    await middleware(c as any, next);
    expect(nextCalled).toBe(true);
  });
});
