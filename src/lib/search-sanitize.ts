// Sanitize user input for use in ILIKE/LIKE patterns.
// Escapes PostgreSQL wildcard characters (% and _) and the escape char (\).
// Also truncates to a reasonable max length to prevent DoS.
// PragmaOS 2.

export function sanitizeILike(input: string, maxLength = 100): string {
  const truncated = input.slice(0, maxLength);
  return truncated.replace(/[%_\\]/g, "\\$&");
}
