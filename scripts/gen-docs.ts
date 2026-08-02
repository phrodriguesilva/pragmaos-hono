// gen-docs.ts — auto-generates technical documentation by scanning the codebase.
//
// Scans:
//   - src/routes/*.tsx and src/routes/*.ts  → route definitions
//   - supabase/migrations/*.sql            → tables, columns, RLS, policies, indexes, FKs
//   - src/lib/*.ts                         → exported functions, interfaces, types, consts
//
// Output: src/generated/docs.ts (valid TypeScript, compiles with tsc --noEmit).
//
// Usage:  bun scripts/gen-docs.ts
//
// Keep parsing regex-based (no full AST) — simple but robust.

import { Glob } from "bun";

// ---------------------------------------------------------------------------
// Types (mirror the generated file's exports)
// ---------------------------------------------------------------------------

interface RouteDoc {
  method: string;
  path: string;
  file: string;
  comment?: string;
  schemas: string[];
}

interface ColumnDoc {
  name: string;
  type: string;
  nullable: boolean;
}

interface TableDoc {
  name: string;
  columns: ColumnDoc[];
  rls: boolean;
  policies: string[];
  indexes: string[];
  foreignKeys: string[];
  migration: string;
}

interface LibExport {
  type: "function" | "interface" | "type" | "const";
  name: string;
  comment?: string;
}

interface LibDoc {
  name: string;
  exports: LibExport[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = import.meta.dir + "/..";

/** Read a file as text, returning "" if it doesn't exist. */
async function readText(path: string): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) return "";
  return file.text();
}

/** Escape a string for safe embedding in a double-quoted TS string literal. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "");
}

/** Collect all file paths matching a glob pattern, sorted. */
async function globPaths(pattern: string): Promise<string[]> {
  const glob = new Glob(pattern);
  const paths: string[] = [];
  for await (const p of glob.scan(ROOT)) paths.push(p);
  return paths.sort();
}

/** Extract the leading block of `//` comments at the very top of a file. */
function extractFileHeaderComment(src: string): string | undefined {
  const lines = src.split("\n");
  const comments: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      // Allow blank lines between comment lines only if we've started.
      if (comments.length > 0) continue;
      continue;
    }
    if (trimmed.startsWith("//")) {
      comments.push(trimmed.replace(/^\/\/\s?/, ""));
    } else if (trimmed.startsWith("/*")) {
      // Block comment — capture until closing.
      const blockMatch = src.match(/\/\*([\s\S]*?)\*\//);
      if (blockMatch) {
        const body = blockMatch[1]
          .split("\n")
          .map((l) => l.replace(/^\s*\* ?/, "").trim())
          .filter((l) => l.length > 0);
        comments.push(...body);
      }
      break;
    } else {
      break;
    }
  }
  const text = comments.join(" ").trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Find the comment immediately above a given line index.
 * Walks upwards collecting contiguous `//` lines, then joins them.
 */
function commentAbove(lines: string[], idx: number): string | undefined {
  const collected: string[] = [];
  let i = idx - 1;
  while (i >= 0) {
    const trimmed = lines[i].trim();
    if (trimmed === "") {
      // Stop at first blank line gap (don't cross paragraph breaks).
      break;
    }
    if (trimmed.startsWith("//")) {
      collected.unshift(trimmed.replace(/^\/\/\s?/, ""));
      i--;
      continue;
    }
    break;
  }
  const text = collected.join(" ").trim();
  return text.length > 0 ? text : undefined;
}

// ---------------------------------------------------------------------------
// 1. Route scanning
// ---------------------------------------------------------------------------

/**
 * Parse src/index.ts to build a map of route-variable-name → mount path.
 * Matches `app.route("/path", varName)` and direct `app.get/post(...)`.
 */
async function buildMountMap(): Promise<{
  mounts: Map<string, string>;
  direct: RouteDoc[];
}> {
  const mounts = new Map<string, string>();
  const direct: RouteDoc[] = [];
  const src = await readText(ROOT + "/src/index.ts");
  if (!src) return { mounts, direct };

  // app.route("/path", varName)
  const routeRe = /app\.route\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = routeRe.exec(src)) !== null) {
    mounts.set(m[2], m[1]);
  }

  // Direct app.get/post/put/patch/delete("/path", ...)
  const directRe = /app\.(get|post|put|patch|delete|all)\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = directRe.exec(src)) !== null) {
    direct.push({ method: m[1].toUpperCase(), path: m[2], file: "src/index.ts", schemas: [] });
  }

  return { mounts, direct };
}

/** Extract Zod schema names from a route file (`const fooSchema = z.object({`). */
function extractZodSchemas(src: string): string[] {
  const schemas: string[] = [];
  const re = /const\s+([A-Za-z_$][\w$]*)\s*=\s*z\.object\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    schemas.push(m[1]);
  }
  return schemas;
}

async function scanRoutes(): Promise<RouteDoc[]> {
  const { mounts, direct } = await buildMountMap();
  const docs: RouteDoc[] = [...direct];

  const files = await globPaths("src/routes/*.{ts,tsx}");

  for (const file of files) {
    const abs = ROOT + "/" + file;
    const src = await readText(abs);
    if (!src) continue;

    const lines = src.split("\n");
    const schemas = extractZodSchemas(src);
    const fileHeader = extractFileHeaderComment(src);

    // Determine the route variable name(s) exported by this file.
    // Pattern: `export const fooRoutes = new Hono<AppEnv>();`
    const varRe = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Hono/g;
    const varNames: string[] = [];
    let mv: RegExpExecArray | null;
    while ((mv = varRe.exec(src)) !== null) {
      varNames.push(mv[1]);
    }

    // Build a regex matching any of the route variable names: varName.get("/path", ...)
    // Also match `app.get(...)` in case a file uses the app directly.
    const subjects = varNames.length > 0 ? varNames.join("|") : "app";
    // Match: subject.get("/path", ...)  — path may be quoted with ", ', or `.
    const routeRe = new RegExp(
      "\\b(" + subjects + ")\\.(get|post|put|patch|delete|all)\\(\\s*[\"'`]([^\"'`]+)[\"'`]",
      "g",
    );

    let m: RegExpExecArray | null;
    while ((m = routeRe.exec(src)) !== null) {
      const varName = m[1];
      const method = m[2].toUpperCase();
      const routePath = m[3];

      // Compute the line index for comment lookup.
      const upTo = src.slice(0, m.index);
      const lineIdx = upTo.split("\n").length - 1;
      const comment = commentAbove(lines, lineIdx) ?? fileHeader;

      // Resolve full path via mount map.
      const mountPath = mounts.get(varName) ?? "";
      let fullPath = routePath;
      if (mountPath && mountPath !== "/") {
        fullPath =
          mountPath.endsWith("/") && routePath.startsWith("/")
            ? mountPath + routePath.slice(1)
            : !mountPath.endsWith("/") && !routePath.startsWith("/") && routePath !== ""
              ? mountPath + "/" + routePath
              : mountPath + routePath;
      }
      // Normalize: avoid trailing slash unless root.
      if (fullPath.length > 1 && fullPath.endsWith("/")) fullPath = fullPath.slice(0, -1);

      docs.push({
        method,
        path: fullPath || "/",
        file,
        comment,
        schemas,
      });
    }
  }

  return docs;
}

// ---------------------------------------------------------------------------
// 2. Migration scanning
// ---------------------------------------------------------------------------

/**
 * Parse a column definition line into { name, type, nullable }.
 * Example: `id uuid primary key default gen_random_uuid()` → { name: "id", type: "uuid", nullable: false }
 *          `deleted_at timestamptz` → { name: "deleted_at", type: "timestamptz", nullable: true }
 */
function parseColumn(raw: string): ColumnDoc | null {
  let line = raw.trim().replace(/,$/, "").trim();
  if (!line) return null;
  // Skip constraint lines (e.g. `unique (tenant_id, email)`, `primary key (...)`, `check (...)`)
  if (/^(unique|primary\s+key|check|constraint|foreign)\b/i.test(line)) return null;

  // First token = column name.
  const nameMatch = line.match(/^"?([A-Za-z_][\w]*)"?\s+/);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  // Type = token(s) after name up to the first constraint keyword.
  const rest = line.slice(nameMatch[0].length);
  const typeMatch = rest.match(/^([A-Za-z][\w]*(?:\s*\([^)]*\))?(?:\s*\[\])?)/);
  const type = typeMatch ? typeMatch[1].trim() : rest.split(/\s+/)[0] ?? "unknown";

  const nullable = !/\bnot\s+null\b/i.test(line);

  return { name, type, nullable };
}

async function scanMigrations(): Promise<TableDoc[]> {
  const files = await globPaths("supabase/migrations/*.sql");
  const tables = new Map<string, TableDoc>();

  for (const file of files) {
    const migration = file.split("/").pop() ?? file;
    const src = await readText(ROOT + "/" + file);
    if (!src) continue;

    // --- create table statements ---
    // Capture from `create table [if not exists] name (` to the matching `);`
    const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][\w.]*)\s*\(([\s\S]*?)\n\)\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = tableRe.exec(src)) !== null) {
      const tableName = m[1].replace(/^public\./, "");
      const body = m[2];

      // Split body into column/constraint lines on top-level commas.
      const columns: ColumnDoc[] = [];
      const foreignKeys: string[] = [];
      let depth = 0;
      let buf = "";
      for (const ch of body) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
          const col = parseColumn(buf);
          if (col) columns.push(col);
          // Foreign key inline references.
          const fkMatch = buf.match(/references\s+([A-Za-z_][\w.]*)\s*\(([^)]*)\)/i);
          if (fkMatch) {
            foreignKeys.push(`${col?.name ?? "unknown"} → ${fkMatch[1].replace(/^public\./, "")}(${fkMatch[2]})`);
          }
          buf = "";
        } else {
          buf += ch;
        }
      }
      // Last line.
      if (buf.trim()) {
        const col = parseColumn(buf);
        if (col) columns.push(col);
        const fkMatch = buf.match(/references\s+([A-Za-z_][\w.]*)\s*\(([^)]*)\)/i);
        if (fkMatch) {
          foreignKeys.push(`${col?.name ?? "unknown"} → ${fkMatch[1].replace(/^public\./, "")}(${fkMatch[2]})`);
        }
      }

      const existing = tables.get(tableName);
      if (existing) {
        // Merge: later migrations may add columns (alter table add column).
        // For create table, just keep first definition but append new FKs.
        existing.foreignKeys.push(...foreignKeys);
      } else {
        tables.set(tableName, {
          name: tableName,
          columns,
          rls: false,
          policies: [],
          indexes: [],
          foreignKeys,
          migration,
        });
      }
    }

    // --- alter table ... add column --- (capture added columns)
    const addColRe =
      /alter\s+table\s+(?:if\s+exists\s+)?([A-Za-z_][\w.]*)\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([^\n;]+)/gi;
    while ((m = addColRe.exec(src)) !== null) {
      const tableName = m[1].replace(/^public\./, "");
      const col = parseColumn(m[2].trim());
      if (col) {
        const t = tables.get(tableName);
        if (t && !t.columns.some((c) => c.name === col.name)) {
          t.columns.push(col);
        }
      }
    }

    // --- enable RLS ---
    const rlsRe = /alter\s+table\s+(?:if\s+exists\s+)?([A-Za-z_][\w.]*)\s+enable\s+row\s+level\s+security/gi;
    while ((m = rlsRe.exec(src)) !== null) {
      const tableName = m[1].replace(/^public\./, "");
      const t = tables.get(tableName);
      if (t) t.rls = true;
    }

    // --- create policy ---
    const policyRe = /create\s+policy\s+(?:if\s+not\s+exists\s+)?["']?([^"'\s]+)["']?\s+on\s+([A-Za-z_][\w.]*)/gi;
    while ((m = policyRe.exec(src)) !== null) {
      const policyName = m[1];
      const tableName = m[2].replace(/^public\./, "");
      const t = tables.get(tableName);
      if (t && !t.policies.includes(policyName)) {
        t.policies.push(policyName);
      }
    }

    // --- create index ---
    const indexRe =
      /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][\w]*)\s+on\s+([A-Za-z_][\w.]*)\s*\(([^)]*)\)/gi;
    while ((m = indexRe.exec(src)) !== null) {
      const indexName = m[1];
      const tableName = m[2].replace(/^public\./, "");
      const t = tables.get(tableName);
      if (t && !t.indexes.includes(indexName)) {
        t.indexes.push(indexName);
      }
    }
  }

  return [...tables.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// 3. Lib scanning
// ---------------------------------------------------------------------------

async function scanLibs(): Promise<LibDoc[]> {
  const files = await globPaths("src/lib/*.ts");
  const docs: LibDoc[] = [];

  for (const file of files) {
    const abs = ROOT + "/" + file;
    const src = await readText(abs);
    if (!src) continue;

    const name = file.split("/").pop() ?? file;
    const lines = src.split("\n");
    const exports: LibExport[] = [];
    const seen = new Set<string>();

    // exported functions: `export function name(` or `export async function name(`
    const fnRe = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = fnRe.exec(src)) !== null) {
      const key = "function:" + m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      const lineIdx = src.slice(0, m.index).split("\n").length - 1;
      exports.push({ type: "function", name: m[1], comment: commentAbove(lines, lineIdx) });
    }

    // exported interfaces: `export interface Name`
    const ifaceRe = /export\s+interface\s+([A-Za-z_$][\w$]*)/g;
    while ((m = ifaceRe.exec(src)) !== null) {
      const key = "interface:" + m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      const lineIdx = src.slice(0, m.index).split("\n").length - 1;
      exports.push({ type: "interface", name: m[1], comment: commentAbove(lines, lineIdx) });
    }

    // exported types: `export type Name`
    const typeRe = /export\s+type\s+([A-Za-z_$][\w$]*)/g;
    while ((m = typeRe.exec(src)) !== null) {
      const key = "type:" + m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      const lineIdx = src.slice(0, m.index).split("\n").length - 1;
      exports.push({ type: "type", name: m[1], comment: commentAbove(lines, lineIdx) });
    }

    // exported consts: `export const name =`
    const constRe = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g;
    while ((m = constRe.exec(src)) !== null) {
      const key = "const:" + m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      const lineIdx = src.slice(0, m.index).split("\n").length - 1;
      exports.push({ type: "const", name: m[1], comment: commentAbove(lines, lineIdx) });
    }

    docs.push({ name, exports });
  }

  return docs.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// 4. Code generation
// ---------------------------------------------------------------------------

function genRoutes(docs: RouteDoc[]): string {
  const items = docs.map((d) => {
    const comment = d.comment ? ` comment: "${esc(d.comment)}",` : "";
    const schemas = d.schemas.length > 0 ? ` schemas: [${d.schemas.map((s) => `"${esc(s)}"`).join(", ")}],` : "";
    return `  { method: "${esc(d.method)}", path: "${esc(d.path)}", file: "${esc(d.file)}",${comment}${schemas} },`;
  });
  return `export const routesDocs: RouteDoc[] = [\n${items.join("\n")}\n];\n`;
}

function genTables(docs: TableDoc[]): string {
  const items = docs.map((t) => {
    const cols = t.columns
      .map((c) => `    { name: "${esc(c.name)}", type: "${esc(c.type)}", nullable: ${c.nullable} },`)
      .join("\n");
    const policies = t.policies.map((p) => `"${esc(p)}"`).join(", ");
    const indexes = t.indexes.map((i) => `"${esc(i)}"`).join(", ");
    const fks = t.foreignKeys.map((f) => `"${esc(f)}"`).join(", ");
    return `  {
    name: "${esc(t.name)}",
    columns: [
${cols}
    ],
    rls: ${t.rls},
    policies: [${policies}],
    indexes: [${indexes}],
    foreignKeys: [${fks}],
    migration: "${esc(t.migration)}",
  },`;
  });
  return `export const tablesDocs: TableDoc[] = [\n${items.join("\n")}\n];\n`;
}

function genLibs(docs: LibDoc[]): string {
  const items = docs.map((l) => {
    const exports = l.exports
      .map(
        (e) =>
          `    { type: "${e.type}", name: "${esc(e.name)}"${e.comment ? `, comment: "${esc(e.comment)}"` : ""} },`,
      )
      .join("\n");
    return `  {\n    name: "${esc(l.name)}",\n    exports: [\n${exports}\n    ],\n  },`;
  });
  return `export const libsDocs: LibDoc[] = [\n${items.join("\n")}\n];\n`;
}

async function generate(routes: RouteDoc[], tables: TableDoc[], libs: LibDoc[]): Promise<void> {
  const header = `// AUTO-GENERATED by scripts/gen-docs.ts — do not edit by hand.
// Generated at: ${new Date().toISOString()}

export interface RouteDoc {
  method: string;
  path: string;
  file: string;
  comment?: string;
  schemas: string[];
}

export interface TableDoc {
  name: string;
  columns: { name: string; type: string; nullable: boolean }[];
  rls: boolean;
  policies: string[];
  indexes: string[];
  foreignKeys: string[];
  migration: string;
}

export interface LibDoc {
  name: string;
  exports: { type: "function" | "interface" | "type" | "const"; name: string; comment?: string }[];
}

`;

  const body =
    genRoutes(routes) + "\n" + genTables(tables) + "\n" + genLibs(libs) + "\n" + `export const docsGeneratedAt: string = "${new Date().toISOString()}";\n`;

  const output = header + body;
  await Bun.write(ROOT + "/src/generated/docs.ts", output);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Scanning codebase for documentation...");

  const [routes, tables, libs] = await Promise.all([scanRoutes(), scanMigrations(), scanLibs()]);

  await generate(routes, tables, libs);

  console.log("");
  console.log("Documentation generated → src/generated/docs.ts");
  console.log(`  Routes:  ${routes.length}`);
  console.log(`  Tables:  ${tables.length}`);
  console.log(`  Libs:    ${libs.length} (${libs.reduce((n, l) => n + l.exports.length, 0)} exports)`);
  console.log("");
}

main().catch((err) => {
  console.error("gen-docs failed:", err);
  process.exit(1);
});
