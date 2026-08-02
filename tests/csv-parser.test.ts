import { describe, it, expect } from "bun:test";

// Copy of the parseCSV function from import.tsx for testing.
// (Can't import directly because the route file has side effects.)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { currentField += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      currentField += char; i++; continue;
    }
    if (char === '"') { inQuotes = true; i++; continue; }
    if (char === ",") { currentRow.push(currentField); currentField = ""; i++; continue; }
    if (char === "\r") { i++; continue; }
    if (char === "\n") { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = ""; i++; continue; }
    currentField += char; i++;
  }
  if (currentField.length > 0 || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last && last.length === 1 && last[0] === "") { rows.pop(); } else { break; }
  }
  return rows;
}

describe("CSV Parser", () => {
  it("should parse simple CSV", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6";
    const rows = parseCSV(csv);
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual(["a", "b", "c"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
    expect(rows[2]).toEqual(["4", "5", "6"]);
  });

  it("should parse quoted fields with commas", () => {
    const csv = 'name,description\n"Silva, Joao","Advogado"';
    const rows = parseCSV(csv);
    expect(rows[1][0]).toBe("Silva, Joao");
    expect(rows[1][1]).toBe("Advogado");
  });

  it("should parse escaped quotes", () => {
    const csv = 'text\n"He said ""hello"""';
    const rows = parseCSV(csv);
    expect(rows[1][0]).toBe('He said "hello"');
  });

  it("should handle empty fields", () => {
    const csv = "a,b,c\n,,\n1,,3";
    const rows = parseCSV(csv);
    expect(rows[1]).toEqual(["", "", ""]);
    expect(rows[2]).toEqual(["1", "", "3"]);
  });

  it("should handle BOM", () => {
    const csv = "\uFEFFname,email\nJoao,joao@test.com";
    const rows = parseCSV(csv);
    expect(rows[0][0]).toBe("name");
    expect(rows[0][1]).toBe("email");
  });

  it("should handle CRLF line endings", () => {
    const csv = "a,b\r\n1,2\r\n3,4";
    const rows = parseCSV(csv);
    expect(rows.length).toBe(3);
    expect(rows[1]).toEqual(["1", "2"]);
  });

  it("should handle single row (header only)", () => {
    const csv = "a,b,c";
    const rows = parseCSV(csv);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(["a", "b", "c"]);
  });

  it("should handle empty input", () => {
    const rows = parseCSV("");
    expect(rows.length).toBe(0);
  });

  it("should remove trailing empty rows", () => {
    const csv = "a,b\n1,2\n\n\n";
    const rows = parseCSV(csv);
    expect(rows.length).toBe(2);
  });

  it("should handle newlines inside quoted fields", () => {
    const csv = 'description\n"Line 1\nLine 2"';
    const rows = parseCSV(csv);
    expect(rows.length).toBe(2);
    expect(rows[1][0]).toBe("Line 1\nLine 2");
  });
});
