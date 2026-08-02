// CSV export helper for reports.
// Generates a CSV string from rows and returns it as a downloadable response.

export function toCSV(rows: (string | number)[][], headers?: string[]): string {
  const escape = (val: string | number): string => {
    const s = String(val ?? "");
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [];
  if (headers) {
    lines.push(headers.map(escape).join(","));
  }
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string): Response {
  // Add BOM for Excel UTF-8 compatibility
  const bom = "\uFEFF";
  const body = bom + csv;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
