import fs from "fs";
import path from "path";
import { getTemplatesDir } from "../../utils/file-utils.js";
import type { ResourceNaming } from "./naming.js";

/** A planned change: written by add endpoint, or only printed with --dry-run. */
export interface PlannedFile {
  path: string;
  content: string;
  action: "create" | "update" | "overwrite";
}

/**
 * Shared files every resource depends on (copied verbatim from
 * templates/project/src). Missing ones are created; existing ones are never
 * touched (they may hold project-specific changes).
 */
export const SHARED_FILES = [
  "shared/api.utils.ts",
  "shared/errors.utils.ts",
  "shared/sanitize.utils.ts",
  "shared/null.utils.ts",
  "shared/validation.utils.ts",
  "shared/pagination.utils.ts",
  "shared/db.ts",
  "shared/openapi.utils.ts",
  "shared/route-map.utils.ts",
  "types/api.types.ts",
] as const;

export function readProjectTemplate(relativePath: string): string {
  // LF always: a Windows checkout may have converted the templates to CRLF.
  return fs.readFileSync(path.join(getTemplatesDir(), "project", "src", relativePath), "utf-8").replace(/\r\n/g, "\n");
}

export function planMissingSharedFiles(cwd: string, files: readonly string[] = SHARED_FILES): PlannedFile[] {
  return files
    .filter((file) => !fs.existsSync(path.join(cwd, "src", file)))
    .map((file) => ({ path: path.join(cwd, "src", file), content: readProjectTemplate(file), action: "create" as const }));
}

/** Checks an existing api.utils.ts exposes what the generated code imports. */
export function missingApiUtilsExports(cwd: string): string[] {
  const file = path.join(cwd, "src", "shared", "api.utils.ts");
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, "utf-8");
  return ["toSafeErrorResult", "validateComposed", "sendResponse", "createResponse"].filter(
    (name) => !new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${name}\\b`).test(content),
  );
}

// ==================== db.types.ts ====================

export function planRowType(cwd: string, rowTypeName: string, rowType: string): PlannedFile | { skipped: string } {
  const file = path.join(cwd, "src", "types", "db.types.ts");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : readProjectTemplate("types/db.types.ts");
  if (new RegExp(`\\binterface\\s+${rowTypeName}\\b|\\btype\\s+${rowTypeName}\\b`).test(current)) {
    return { skipped: `${rowTypeName} already exists in src/types/db.types.ts (left as is)` };
  }
  const base = current.replace(/\nexport \{\};\s*$/, "\n");
  return {
    path: file,
    content: `${base.trimEnd()}\n\n${rowType}`,
    action: fs.existsSync(file) ? "update" : "create",
  };
}

// ==================== migrations ====================

export function planMigration(cwd: string, table: string, sql: string): PlannedFile {
  const dir = path.join(cwd, "migrations");
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)) : [];
  const numbered = existing.map((f) => f.match(/^(\d+)_/)![1]!);
  const width = numbered.length > 0 ? Math.max(...numbered.map((n) => n.length)) : 4;
  const next = numbered.length > 0 ? Math.max(...numbered.map(Number)) + 1 : 1;
  const name = `${String(next).padStart(width, "0")}_create_${table}.sql`;
  return { path: path.join(dir, name), content: sql, action: "create" };
}

// ==================== api/routes.ts ====================

const REQUIRE_AUTH_USE = /^\s*router\.use\(\s*requireAuth\s*\)\s*;?\s*$/;
const EXPORT_DEFAULT = /^\s*export\s+default\s+router\s*;?\s*$/;
const IMPORT_END = /(^import\s+['"][^'"]+['"];?\s*$)|(\bfrom\s+['"][^'"]+['"];?\s*$)/;

export interface RoutesUpdate {
  file?: PlannedFile;
  warnings: string[];
}

/** Index after the last non-blank line before `index` (where to append to the block above). */
function endOfBlockAbove(lines: string[], index: number): number {
  let i = index - 1;
  while (i >= 0 && lines[i]!.trim() === "") i--;
  return i + 1;
}

/**
 * Registers the router in src/api/routes.ts:
 * - private resources go right before `export default router`, after
 *   `router.use(requireAuth)` (added if missing),
 * - public ones (--public) go at the end of the block above requireAuth.
 */
export function planRoutesRegistration(cwd: string, naming: ResourceNaming, isPublic: boolean): RoutesUpdate {
  const warnings: string[] = [];
  const file = path.join(cwd, "src", "api", "routes.ts");
  const importPath = `./${[...naming.folderSegments, `${naming.fileBase}.routes.js`].join("/")}`;
  const importLine = `import ${naming.routerIdentifier} from '${importPath}';`;
  const mountLine = `router.use('/${naming.mountPath}', ${naming.routerIdentifier});`;

  const exists = fs.existsSync(file);
  const original = exists
    ? fs.readFileSync(file, "utf-8")
    : "import { Router } from 'express';\n\nconst router = Router();\n\nexport default router;\n";

  if (original.includes(importPath)) {
    warnings.push(`src/api/routes.ts already imports ${importPath} (left as is)`);
    return { warnings };
  }

  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.replace(/\r\n/g, "\n").split("\n");

  // 1. imports, after the last import statement
  let lastImport = -1;
  lines.forEach((line, i) => {
    if (IMPORT_END.test(line)) lastImport = i;
  });
  const newImports = [importLine];
  if (!isPublic && !lines.some((l) => /\brequireAuth\b/.test(l) && /^import/.test(l))) {
    newImports.push("import { requireAuth } from '../middleware/auth.middleware.js';");
  }
  lines.splice(lastImport + 1, 0, ...newImports);

  // 2. mount
  let exportIndex = lines.findIndex((l) => EXPORT_DEFAULT.test(l));
  if (exportIndex === -1) {
    lines.push("", "export default router;");
    exportIndex = lines.length - 1;
  }
  const requireAuthIndex = lines.findIndex((l) => REQUIRE_AUTH_USE.test(l));

  if (isPublic) {
    let anchor = requireAuthIndex === -1 ? exportIndex : requireAuthIndex;
    // keep comments that introduce requireAuth attached to it
    while (anchor > 0 && /^\s*\/\//.test(lines[anchor - 1]!)) anchor--;
    lines.splice(endOfBlockAbove(lines, anchor), 0, mountLine);
  } else {
    if (requireAuthIndex === -1) {
      const at = endOfBlockAbove(lines, exportIndex);
      lines.splice(
        at,
        0,
        "",
        "// Everything below requires a valid access token (req.user = { id, email, role })",
        "router.use(requireAuth);",
      );
      warnings.push("Added `router.use(requireAuth)` to src/api/routes.ts: routers mounted after it are private.");
      exportIndex = lines.findIndex((l) => EXPORT_DEFAULT.test(l));
    }
    const at = endOfBlockAbove(lines, exportIndex);
    lines.splice(at, 0, mountLine);
    // exactly one blank line before `export default router`
    exportIndex = lines.findIndex((l) => EXPORT_DEFAULT.test(l));
    const blockEnd = endOfBlockAbove(lines, exportIndex);
    lines.splice(blockEnd, exportIndex - blockEnd, "");
  }

  return {
    file: { path: file, content: lines.join("\n").replace(/\n/g, eol), action: exists ? "update" : "create" },
    warnings,
  };
}

/** Reads `id: number|string` from `<Parent>Row` in db.types.ts (number -> "number", string -> "uuid"). */
export function detectRowIdType(cwd: string, rowTypeName: string): "uuid" | "number" | undefined {
  const file = path.join(cwd, "src", "types", "db.types.ts");
  if (!fs.existsSync(file)) return undefined;
  const content = fs.readFileSync(file, "utf-8");
  const match = content.match(new RegExp(`interface\\s+${rowTypeName}\\s*\\{[^}]*?\\bid\\s*:\\s*(number|string)`));
  if (!match) return undefined;
  return match[1] === "number" ? "number" : "uuid";
}
