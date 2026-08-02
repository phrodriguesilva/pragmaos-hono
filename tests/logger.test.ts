import { describe, it, expect } from "bun:test";
import { log } from "../src/lib/logger";

describe("logger.ts", () => {
  describe("log", () => {
    it("should have debug, info, warn, error, and child methods", () => {
      expect(typeof log.debug).toBe("function");
      expect(typeof log.info).toBe("function");
      expect(typeof log.warn).toBe("function");
      expect(typeof log.error).toBe("function");
      expect(typeof log.child).toBe("function");
    });

    it("should not throw when logging", () => {
      expect(() => log.info("test message")).not.toThrow();
      expect(() => log.error("error message", { code: 500 })).not.toThrow();
      expect(() => log.warn("warn message")).not.toThrow();
      expect(() => log.debug("debug message")).not.toThrow();
    });

    it("should create child logger with context", () => {
      const child = log.child({ requestId: "abc-123" });
      expect(typeof child.info).toBe("function");
      expect(typeof child.error).toBe("function");
      expect(typeof child.child).toBe("function");
      // Should not throw when logging with child.
      expect(() => child.info("child message")).not.toThrow();
    });

    it("should support nested child loggers", () => {
      const parent = log.child({ module: "test" });
      const child = parent.child({ function: "nested" });
      expect(() => child.info("nested message")).not.toThrow();
    });
  });
});
