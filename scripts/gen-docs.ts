// Technical documentation generator.
// Scans src/routes/*.tsx for route definitions and supabase/migrations/*.sql
// for table definitions, then emits a static docs page.
//
// Run: bun scripts/gen-docs.ts
// Output: src/generated/docs.ts (a self-contained JSX component)

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";

interface RouteEntry {
  method: string;
  path: string;
  file: string;
  description?: string;
}

interface TableEntry {
  name: string;
  columns: { name: string; type: string; nullable: boolean; default?: string }[];
  rls: boolean;
  migration: string;
}

interface ModuleEntry {
  name: string;
  file: string;
  routes: RouteEntry[];
}

async function scanRoutes(routesDir: string): Promise<ModuleEntry[]> {
  const files = (await readdir(routesDir)).filter((f) => f.endsWith(".tsx"));
  const modules: ModuleEntry[] = [];

  for (const file of files) {
    const filePath = join(routesDir, file);
    const content = await readFile(filePath, "utf-8");
    const routes: RouteEntry[] = [];

    // Match patterns like: routes.get("/path", ...) routes.post("/path/:id", ...)
    // Also match: app.route("/path", ...)
    const routeRegex = /\.(get|post|put|patch|delete|route)\(\s*["'`]([^"'`]+)["'`]/g;
    let match: RegExpExecArray | null;
    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1] === "route" ? "MOUNT" : match[1].toUpperCase();
      const path = match[2]!;
      routes.push({ method, path, file: basename(file) });
    }

    if (routes.length > 0) {
      modules.push({
        name: basename(file, ".tsx"),
        file: basename(file),
        routes,
      });
    }
  }

  return modules.sort((a, b) => a.name.localeCompare(b.name));
}

async function scanMigrations(migrationsDir: string): Promise<TableEntry[]> {
  let files: string[];
  try {
    files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql"));
  } catch {
    return [];
  }

  const tables = new Map<string, TableEntry>();

  for (const file of files) {
    const content = await readFile(join(migrationsDir, file), "utf-8");

    // Find CREATE TABLE statements.
    const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\);/gi;
    let match: RegExpExecArray | null;
    while ((match = createRegex.exec(content)) !== null) {
      const tableName = match[1]!;
      const body = match[2]!;
      const columns: TableEntry["columns"] = [];

      // Parse columns — split by commas at top level (ignore commas inside parens).
      const lines = splitColumns(body);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("--") || trimmed.toUpperCase().startsWith("CONSTRAINT") ||
            trimmed.toUpperCase().startsWith("PRIMARY") || trimmed.toUpperCase().startsWith("FOREIGN") ||
            trimmed.toUpperCase().startsWith("UNIQUE") || trimmed.toUpperCase().startsWith("CHECK")) {
          continue;
        }
        const colMatch = trimmed.match(/^["`]?(\w+)["`]?\s+(\w+(?:\s*\([^)]*\))?)/);
        if (colMatch) {
          const colName = colMatch[1]!;
          const colType = colMatch[2]!.trim();
          const nullable = !/NOT\s+NULL/i.test(trimmed);
          const defaultMatch = trimmed.match(/DEFAULT\s+([^,]+)/i);
          columns.push({
            name: colName,
            type: colType,
            nullable,
            default: defaultMatch?.[1]?.trim(),
          });
        }
      }

      // Check for RLS in the same migration.
      const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?["\`]?:?${tableName}["\`]?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      const rls = rlsRegex.test(content);

      const existing = tables.get(tableName);
      if (!existing || columns.length > existing.columns.length) {
        tables.set(tableName, {
          name: tableName,
          columns,
          rls,
          migration: file,
        });
      } else if (rls && !existing.rls) {
        existing.rls = true;
      }
    }

    // Also check for ALTER TABLE ENABLE ROW LEVEL SECURITY for existing tables.
    const rlsAlterRegex = /ALTER\s+TABLE\s+(?:public\.)?["`]?(\w+)["`]?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
    while ((match = rlsAlterRegex.exec(content)) !== null) {
      const tableName = match[1]!;
      const existing = tables.get(tableName);
      if (existing) {
        existing.rls = true;
      }
    }
  }

  return [...tables.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function splitColumns(body: string): string[] {
  const lines: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of body) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      lines.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

async function scanIntegrations(libDir: string): Promise<{ name: string; file: string; description: string }[]> {
  let files: string[];
  try {
    files = (await readdir(libDir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  } catch {
    return [];
  }

  const integrations: { name: string; file: string; description: string }[] = [];
  for (const file of files) {
    const content = await readFile(join(libDir, file), "utf-8");
    // Extract first JSDoc block description.
    const jsDocMatch = content.match(/\/\*\*[\s\S]*?\*\//);
    let description = "";
    if (jsDocMatch) {
      const lines = jsDocMatch[0]!.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).filter((l) => l && !l.startsWith("@"));
      description = lines.filter((l) => l !== "/**" && l !== "*/").join(" ").trim();
    }
    if (!description) {
      // Fallback: first // comment.
      const commentMatch = content.match(/\/\/\s*(.+)/);
      description = commentMatch?.[1]?.trim() ?? "";
    }
    if (description) {
      integrations.push({ name: basename(file, ".ts"), file, description });
    }
  }

  return integrations.sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const root = dirname(dirname(new URL(import.meta.url).pathname));
  const routesDir = join(root, "src", "routes");
  const migrationsDir = join(root, "supabase", "migrations");
  const libDir = join(root, "src", "lib");
  const outDir = join(root, "src", "generated");

  console.log("Scanning routes...");
  const modules = await scanRoutes(routesDir);
  const totalRoutes = modules.reduce((sum, m) => sum + m.routes.length, 0);

  console.log("Scanning migrations...");
  const tables = await scanMigrations(migrationsDir);

  console.log("Scanning libs...");
  const integrations = await scanIntegrations(libDir);

  console.log(`Found ${modules.length} modules, ${totalRoutes} routes, ${tables.length} tables, ${integrations.length} libs`);

  // Generate the docs component.
  const component = generateDocsComponent(modules, tables, integrations, totalRoutes);

  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "docs.ts");
  await writeFile(outPath, component, "utf-8");
  console.log(`Written: ${outPath}`);
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

function generateDocsComponent(
  modules: ModuleEntry[],
  tables: TableEntry[],
  integrations: { name: string; file: string; description: string }[],
  totalRoutes: number,
): string {
  const generatedAt = new Date().toISOString();

  return `// AUTO-GENERATED by scripts/gen-docs.ts — do not edit manually.
// Regenerate with: bun scripts/gen-docs.ts
// Generated at: ${generatedAt}

export const docsData = ${JSON.stringify({ modules, tables, integrations, totalRoutes, generatedAt }, null, 2)};

export const docsGeneratedAt = "${generatedAt}";
`;
}

main().catch((err) => {
  console.error("Failed to generate docs:", err);
  process.exit(1);
});
