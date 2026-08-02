import { describe, it, expect } from "bun:test";
import { toCSV, csvResponse } from "../src/lib/export";

describe("export.ts", () => {
  describe("toCSV", () => {
    it("should convert simple rows to CSV", () => {
      const result = toCSV([["Alice", 30], ["Bob", 25]], ["Name", "Age"]);
      expect(result).toBe("Name,Age\r\nAlice,30\r\nBob,25");
    });

    it("should handle empty rows", () => {
      const result = toCSV([], ["A", "B"]);
      expect(result).toBe("A,B");
    });

    it("should escape values with commas", () => {
      const result = toCSV([["hello,world"]]);
      expect(result).toBe('"hello,world"');
    });

    it("should escape values with quotes", () => {
      const result = toCSV([['say "hi"']]);
      expect(result).toBe('"say ""hi"""');
    });

    it("should escape values with newlines", () => {
      const result = toCSV([["line1\nline2"]]);
      expect(result).toBe('"line1\nline2"');
    });

    it("should handle null/undefined values", () => {
      const result = toCSV([[null, undefined] as unknown as (string | number)[]]);
      expect(result).toBe(",");
    });

    it("should handle numbers", () => {
      const result = toCSV([[42, 3.14, -7]]);
      expect(result).toBe("42,3.14,-7");
    });

    it("should use CRLF line endings", () => {
      const result = toCSV([["a"], ["b"]]);
      expect(result).toBe("a\r\nb");
    });
  });

  describe("csvResponse", () => {
    it("should return a Response with CSV content type", () => {
      const resp = csvResponse("test.csv", "a,b\r\n1,2");
      expect(resp.status).toBe(200);
      expect(resp.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
      expect(resp.headers.get("Content-Disposition")).toBe('attachment; filename="test.csv"');
    });

    it("should include BOM for Excel compatibility", async () => {
      const resp = csvResponse("test.csv", "hello");
      const text = await resp.text();
      expect(text.startsWith("\uFEFF")).toBe(true);
    });
  });
});
