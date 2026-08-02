import { describe, it, expect } from "bun:test";
import { isSentryEnabled, captureException, captureMessage, initSentry } from "../src/lib/sentry";

describe("sentry.ts", () => {
  describe("isSentryEnabled", () => {
    it("should return false when SENTRY_DSN is not set", () => {
      // SENTRY_DSN is empty in test environment.
      expect(isSentryEnabled()).toBe(false);
    });
  });

  describe("initSentry", () => {
    it("should not throw when DSN is not configured", () => {
      expect(() => initSentry()).not.toThrow();
    });
  });

  describe("captureException", () => {
    it("should not throw when Sentry is not configured", async () => {
      await expect(captureException(new Error("test error"))).resolves.toBeUndefined();
    });

    it("should accept context with tags and extra", async () => {
      await expect(
        captureException("test error", {
          tags: { module: "test" },
          extra: { detail: "something" },
          user: { id: "user-123", email: "test@example.com" },
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("captureMessage", () => {
    it("should not throw when Sentry is not configured", async () => {
      await expect(captureMessage("test message")).resolves.toBeUndefined();
    });

    it("should accept different levels", async () => {
      await expect(captureMessage("info", "info")).resolves.toBeUndefined();
      await expect(captureMessage("warning", "warning")).resolves.toBeUndefined();
      await expect(captureMessage("error", "error")).resolves.toBeUndefined();
    });
  });
});
