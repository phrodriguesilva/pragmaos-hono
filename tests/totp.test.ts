import { describe, it, expect } from "bun:test";
import {
  generateTOTPSecret,
  validateTOTP,
  buildTOTPUri,
  generateBackupCodes,
} from "../src/lib/totp";

describe("totp.ts", () => {
  describe("generateTOTPSecret", () => {
    it("should generate a base32 secret and URI", () => {
      const { secret, uri } = generateTOTPSecret("user@example.com");
      expect(secret).toBeTruthy();
      expect(secret.length).toBeGreaterThan(10);
      expect(uri).toContain("otpauth://totp/");
      expect(uri).toContain("user%40example.com");
      expect(uri).toContain("PragmaOS");
    });

    it("should generate unique secrets", () => {
      const a = generateTOTPSecret("a@example.com");
      const b = generateTOTPSecret("b@example.com");
      expect(a.secret).not.toBe(b.secret);
    });
  });

  describe("validateTOTP", () => {
    it("should validate a correct TOTP code", () => {
      const { secret } = generateTOTPSecret("test@example.com");
      // Generate a valid token using otpauth directly.
      const OTPAuth = require("otpauth");
      const totp = new OTPAuth.TOTP({
        issuer: "PragmaOS",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const token = totp.generate();
      expect(validateTOTP(token, secret)).toBe(true);
    });

    it("should reject an invalid code", () => {
      const { secret } = generateTOTPSecret("test@example.com");
      expect(validateTOTP("000000", secret)).toBe(false);
    });

    it("should reject invalid secret", () => {
      expect(validateTOTP("123456", "INVALID_SECRET!")).toBe(false);
    });
  });

  describe("buildTOTPUri", () => {
    it("should build a URI from existing secret", () => {
      const { secret } = generateTOTPSecret("test@example.com");
      const uri = buildTOTPUri("test@example.com", secret);
      expect(uri).toContain("otpauth://totp/");
      expect(uri).toContain("PragmaOS");
    });
  });

  describe("generateBackupCodes", () => {
    it("should generate 10 codes by default", () => {
      const codes = generateBackupCodes();
      expect(codes.length).toBe(10);
    });

    it("should generate codes with 8 characters", () => {
      const codes = generateBackupCodes();
      for (const code of codes) {
        expect(code.length).toBe(8);
      }
    });

    it("should not use ambiguous characters (0, O, I, 1)", () => {
      const codes = generateBackupCodes(100);
      for (const code of codes) {
        expect(code).not.toContain("0");
        expect(code).not.toContain("O");
        expect(code).not.toContain("I");
        expect(code).not.toContain("1");
      }
    });

    it("should generate unique codes (mostly)", () => {
      const codes = generateBackupCodes(100);
      const unique = new Set(codes);
      // Allow some collisions with 100 codes, but most should be unique.
      expect(unique.size).toBeGreaterThan(80);
    });
  });
});
