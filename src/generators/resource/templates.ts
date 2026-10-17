import type { ResourceNaming } from "./naming.js";
import { toCamel } from "./naming.js";
import type { FieldSpec, IdType } from "./fields.js";
import {
  humanize,
  idSchemaExpression,
  idSqlType,
  idTsType,
  inputTsType,
  rowTsType,
  schemaExpression,
  selectColumn,
  sqlCheck,
  sqlType,
} from "./fields.js";

export type ResourceMethod = "list" | "get" | "create" | "update" | "delete";
export const ALL_METHODS: ResourceMethod[] = ["list", "get", "create", "update", "delete"];

export interface ResourceContext {
  naming: ResourceNaming;
  fields: FieldSpec[];
  methods: Set<ResourceMethod>;
  idType: IdType;
  /** Mounted before requireAuth: no userId, no ownership, no user_id column. */
  isPublic: boolean;
  /** false = no repository/table: controllers are left for you to implement. */
  withRepository: boolean;
  /** Id type of each parent param (habitId -> uuid), when it differs from --id. */
  parentIdTypes?: Record<string, IdType>;
}

// ==================== helpers ====================

const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

const MAX_LINE = 110;

/** `import { a, b } from 'x';` on one line, or one name per line when too long. */
function importLine(namesList: Array<string | null | false>, from: string, typeOnly = false): string {
  const list = namesList.filter(Boolean) as string[];
  const head = `import ${typeOnly ? "type " : ""}`;
  const single = `${head}{ ${list.join(", ")} } from '${from}';`;
  if (single.length <= MAX_LINE) return single;
  return `${head}{\n${list.map((n) => `  ${n}`).join(",\n")}\n} from '${from}';`;
}

/** `export async function f(a, b): R {` on one line, or one parameter per line when too long. */
function signature(start: string, params: string[], end: string): string {
  const single = `${start}(${params.join(", ")})${end}`;
  if (single.length <= MAX_LINE) return single;
  return `${start}(\n${params.map((p) => `  ${p}`).join(",\n")}\n)${end}`;
}

/** Template literal holding a comma list, wrapped like a paragraph when too long. */
function wrapList(items: string[], indent: string): string {
  const lines: string[] = [];
  let current = "";
  for (const item of items) {
    const next = current ? `${current}, ${item}` : item;
    if (next.length > MAX_LINE - indent.length && current) {
      lines.push(current + ",");
      current = item;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join(`\n${indent}`);
}

function names(ctx: ResourceContext) {
  const { naming } = ctx;
  const S = naming.singular.pascal;
  const s = naming.singular.camel;
  const P = naming.plural.pascal;
  const p = naming.plural.camel;
  const label = naming.singular.words;
  const labels = naming.plural.words;
  const base = naming.fileBase;
  const rel = naming.srcRelative;
  const constName = naming.singular.snake.toUpperCase();
  return { S, s, P, p, label, labels, base, rel, constName };
}

function has(ctx: ResourceContext, method: ResourceMethod): boolean {
  return ctx.methods.has(method);
}

const needsIdParam = (ctx: ResourceContext): boolean => has(ctx, "get") || has(ctx, "update") || has(ctx, "delete");
const needsParentParam = (ctx: ResourceContext): boolean =>
  ctx.naming.parents.length > 0 && (has(ctx, "list") || has(ctx, "create"));
const hasParents = (ctx: ResourceContext): boolean => ctx.naming.parents.length > 0;

function clearableFields(ctx: ResourceContext): FieldSpec[] {
  return ctx.fields.filter((f) => f.optional);
}

/** A parent's id type: detected from its row type in db.types.ts, else the same as --id. */
function parentIdType(ctx: ResourceContext, parent: ResourceNaming["parents"][number]): IdType {
  return ctx.parentIdTypes?.[parent.param] ?? ctx.idType;
}

function idTs(ctx: ResourceContext): string {
  return idTsType(ctx.idType);
}

// ==================== validator ====================

export function renderValidator(ctx: ResourceContext): string {
  const { S, P, s, label, rel, constName } = names(ctx);
  const usesDate = ctx.fields.some((f) => f.type === "date") && (has(ctx, "create") || has(ctx, "update"));
  const lines: string[] = [];

  lines.push(`import { k, kataxInfer } from 'katax-core';`);
  lines.push(`import type { ValidationResult } from '${rel}shared/api.utils.js';`);
  lines.push(`import { validateNormalized } from '${rel}shared/null.utils.js';`);
  lines.push(`import type { NullsToUndefined } from '${rel}shared/null.utils.js';`);
  if (usesDate) lines.push(`import { dateSchema } from '${rel}shared/validation.utils.js';`);
  if (has(ctx, "list")) lines.push(`import { limitField, pageField } from '${rel}shared/pagination.utils.js';`);
  lines.push("");

  if (has(ctx, "update")) {
    const clearable = clearableFields(ctx).map((f) => `'${f.name}'`);
    lines.push(`/** Fields where \`null\` means "clear it" on update (any other null means "not provided"). */`);
    lines.push(`export const ${constName}_CLEARABLE = [${clearable.join(", ")}] as const;`);
    lines.push(`type ${S}Clearable = (typeof ${constName}_CLEARABLE)[number];`);
    lines.push("");
  }

  lines.push("// ==================== SCHEMAS ====================");
  lines.push("");

  const parentEntries = ctx.naming.parents.map(
    (parent) =>
      `  ${parent.param}: ${idSchemaExpression(parentIdType(ctx, parent), humanize(parent.column).toLowerCase())}.describe('${parent.pascal} id.')`,
  );

  if (needsParentParam(ctx)) {
    lines.push(`export const ${s}ParentParamSchema = k.object({`);
    lines.push(parentEntries.join(",\n"));
    lines.push("});");
    lines.push("");
  }

  if (needsIdParam(ctx)) {
    lines.push(`export const ${s}IdParamSchema = k.object({`);
    lines.push([...parentEntries, `  id: ${idSchemaExpression(ctx.idType, label)}.describe('${cap(label)} id.')`].join(",\n"));
    lines.push("});");
    lines.push("");
  }

  if (has(ctx, "list")) {
    lines.push(`export const list${P}QuerySchema = k.object({`);
    lines.push("  page: pageField,");
    lines.push("  limit: limitField");
    lines.push("});");
    lines.push("");
  }

  if (has(ctx, "create")) {
    lines.push(`export const create${S}Schema = k.object({`);
    lines.push(
      ctx.fields
        .map((f) => {
          const expr = schemaExpression(f);
          return f.optional
            ? `  ${f.name}: ${expr}.nullish().describe('${humanize(f.name)}. Optional.')`
            : `  ${f.name}: ${expr}.describe('${humanize(f.name)}.')`;
        })
        .join(",\n"),
    );
    lines.push("});");
    lines.push("");
  }

  if (has(ctx, "update")) {
    lines.push(`export const update${S}Schema = k.object({`);
    lines.push(
      ctx.fields
        .map((f) => {
          const text = f.optional ? `New ${humanize(f.name).toLowerCase()}, or null to remove it.` : `New ${humanize(f.name).toLowerCase()}.`;
          return `  ${f.name}: ${schemaExpression(f)}.nullish().describe('${text}')`;
        })
        .join(",\n"),
    );
    lines.push("});");
    lines.push("");
  }

  lines.push("// ==================== INPUT TYPES (inferred, never hand-written) ====================");
  lines.push("");
  if (needsParentParam(ctx)) lines.push(`export type ${S}ParentParam = kataxInfer<typeof ${s}ParentParamSchema>;`);
  if (needsIdParam(ctx)) lines.push(`export type ${S}IdParam = kataxInfer<typeof ${s}IdParamSchema>;`);
  if (has(ctx, "list")) lines.push(`export type List${P}Query = kataxInfer<typeof list${P}QuerySchema>;`);
  if (has(ctx, "create")) lines.push(`export type Create${S}Input = NullsToUndefined<kataxInfer<typeof create${S}Schema>>;`);
  if (has(ctx, "update")) {
    lines.push(`export type Update${S}Input = NullsToUndefined<kataxInfer<typeof update${S}Schema>, ${S}Clearable>;`);
  }
  lines.push("");

  lines.push("// ==================== VALIDATORS ====================");
  const validator = (fn: string, type: string, schema: string, keep?: string): void => {
    lines.push("");
    lines.push(`export async function ${fn}(data: unknown): Promise<ValidationResult<${type}>> {`);
    lines.push(`  return validateNormalized(${schema}, data${keep ? `, ${keep}` : ""});`);
    lines.push("}");
  };
  if (needsParentParam(ctx)) validator(`validate${S}ParentParam`, `${S}ParentParam`, `${s}ParentParamSchema`);
  if (needsIdParam(ctx)) validator(`validate${S}IdParam`, `${S}IdParam`, `${s}IdParamSchema`);
  if (has(ctx, "list")) validator(`validateList${P}Query`, `List${P}Query`, `list${P}QuerySchema`);
  if (has(ctx, "create")) validator(`validateCreate${S}`, `Create${S}Input`, `create${S}Schema`);
  if (has(ctx, "update")) validator(`validateUpdate${S}`, `Update${S}Input`, `update${S}Schema`, `${constName}_CLEARABLE`);

  return lines.join("\n") + "\n";
}

// ==================== db row type ====================

export function renderRowType(ctx: ResourceContext): string {
  const { S, label } = names(ctx);
  const id = idTs(ctx);
  const lines = [`/** Table \`${ctx.naming.table}\` (${label}). */`, `export interface ${S}Row {`, `  id: ${id};`];
  if (!ctx.isPublic) lines.push("  user_id: string;");
  for (const parent of ctx.naming.parents) lines.push(`  ${parent.column}: ${idTsType(parentIdType(ctx, parent))};`);
  for (const field of ctx.fields) {
    if (field.type === "date") lines.push("  /** YYYY-MM-DD (selected with ::text) */");
    lines.push(`  ${field.name}: ${rowTsType(field)};`);
  }
  lines.push("  created_at: Date;", "  updated_at: Date;", "}");
  return lines.join("\n") + "\n";
}

// ==================== types ====================

export function renderTypes(ctx: ResourceContext): string {
  const { S, P, p, label, rel } = names(ctx);
  const id = idTs(ctx);
  const lines: string[] = [];
  lines.push(`import type { ${S}Row } from '${rel}types/db.types.js';`);
  if (has(ctx, "list")) lines.push(`import type { PaginationMeta } from '${rel}shared/pagination.utils.js';`);
  lines.push("");
  lines.push(`/** What the API returns for a ${label}. Add computed fields here and fill them in the controller's toView(). */`);
  lines.push(`export type ${S}View = ${S}Row;`);

  if (has(ctx, "list")) {
    lines.push("");
    lines.push(`export interface ${P}ListResult {`);
    lines.push(`  ${p}: ${S}View[];`);
    lines.push("  pagination: PaginationMeta;");
    lines.push("}");
    lines.push("");
    lines.push(`export interface ${S}ListFilter {`);
    if (!ctx.isPublic) lines.push("  userId: string;");
    for (const parent of ctx.naming.parents) lines.push(`  ${parent.param}: ${idTsType(parentIdType(ctx, parent))};`);
    lines.push("  limit: number;", "  offset: number;", "}");
  }

  if (has(ctx, "create")) {
    lines.push("");
    lines.push("/** Repository input for INSERT: every column explicit, `null` instead of `undefined`. */");
    lines.push(`export interface Create${S}Params {`);
    if (!ctx.isPublic) lines.push("  userId: string;");
    for (const parent of ctx.naming.parents) lines.push(`  ${parent.param}: ${idTsType(parentIdType(ctx, parent))};`);
    for (const f of ctx.fields) lines.push(`  ${toCamel(f.name)}: ${inputTsType(f)}${f.optional ? " | null" : ""};`);
    lines.push("}");
  }

  if (has(ctx, "update")) {
    lines.push("");
    lines.push("/**");
    lines.push(" * Repository input for UPDATE: `undefined` = leave the column as is,");
    lines.push(" * `null` = set NULL (only optional columns accept it).");
    lines.push(" */");
    lines.push(`export interface Update${S}Params {`);
    for (const f of ctx.fields) lines.push(`  ${toCamel(f.name)}?: ${inputTsType(f)}${f.optional ? " | null" : ""};`);
    lines.push("}");
  }

  return lines.join("\n") + "\n";
}

// ==================== repository ====================

function listWhere(ctx: ResourceContext): { clauses: string[]; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (!ctx.isPublic) {
    params.push("filter.userId");
    clauses.push(`user_id = $${params.length}`);
  }
  for (const parent of ctx.naming.parents) {
    params.push(`filter.${parent.param}`);
    clauses.push(`${parent.column} = $${params.length}`);
  }
  return { clauses, params };
}

export function renderRepository(ctx: ResourceContext): string {
  const { S, P, rel, base, constName } = names(ctx);
  const table = ctx.naming.table;
  const id = idTs(ctx);
  const columnsConst = `${constName}_COLUMNS`;
  const selectList = [
    "id",
    ...(ctx.isPublic ? [] : ["user_id"]),
    ...ctx.naming.parents.map((p) => p.column),
    ...ctx.fields.map((f) => selectColumn(f.name, f.type)),
    "created_at",
    "updated_at",
  ].join(", ");

  const typeImports = [
    has(ctx, "create") ? `Create${S}Params` : null,
    has(ctx, "list") ? `${S}ListFilter` : null,
    has(ctx, "update") ? `Update${S}Params` : null,
  ].filter(Boolean);

  const lines: string[] = [];
  lines.push(`import { db } from '${rel}shared/db.js';`);
  lines.push(`import type { ${S}Row } from '${rel}types/db.types.js';`);
  if (typeImports.length > 0) lines.push(importLine(typeImports, `./${base}.types.js`, true));
  lines.push("");
  lines.push("/** Explicit column list (never SELECT *); dates as text so pg doesn't shift them by timezone. */");
  lines.push(`const ${columnsConst} = \`${wrapList(selectList.split(", "), "  ")}\`;`);

  if (has(ctx, "list")) {
    const { clauses, params } = listWhere(ctx);
    const where = clauses.length > 0 ? `\n     WHERE ${clauses.join(" AND ")}` : "";
    const limitIndex = params.length + 1;
    lines.push("");
    lines.push(`export async function list${P}(filter: ${S}ListFilter): Promise<${S}Row[]> {`);
    lines.push(`  return db().query<${S}Row[]>(`);
    lines.push(`    \`SELECT \${${columnsConst}} FROM ${table}${where}`);
    lines.push("     ORDER BY created_at DESC");
    lines.push(`     LIMIT $${limitIndex} OFFSET $${limitIndex + 1}\`,`);
    lines.push(`    [${[...params, "filter.limit", "filter.offset"].join(", ")}]`);
    lines.push("  );");
    lines.push("}");
    lines.push("");
    lines.push(`export async function count${P}(filter: Omit<${S}ListFilter, 'limit' | 'offset'>): Promise<number> {`);
    lines.push("  const rows = await db().query<Array<{ count: string }>>(");
    lines.push(`    \`SELECT COUNT(*)::text AS count FROM ${table}${where.replace(/\n\s+/, " ")}\`,`);
    lines.push(`    [${params.join(", ")}]`);
    lines.push("  );");
    lines.push("  return Number(rows[0]?.count ?? 0);");
    lines.push("}");
  }

  if (needsIdParam(ctx) || has(ctx, "update")) {
    lines.push("");
    lines.push(`export async function find${S}ById(id: ${id}): Promise<${S}Row | null> {`);
    lines.push(`  const rows = await db().query<${S}Row[]>(\`SELECT \${${columnsConst}} FROM ${table} WHERE id = $1\`, [id]);`);
    lines.push("  return rows[0] ?? null;");
    lines.push("}");
  }

  if (!ctx.isPublic) {
    for (const parent of ctx.naming.parents) {
      if (!needsParentParam(ctx)) break;
      lines.push("");
      lines.push(`/** The parent ${parent.pascal.toLowerCase()} exists and belongs to the user. */`);
      lines.push(`export async function ${toCamel(parent.pascal)}ExistsForUser(${parent.param}: ${idTsType(parentIdType(ctx, parent))}, userId: string): Promise<boolean> {`);
      lines.push("  const rows = await db().query<Array<{ exists: boolean }>>(");
      lines.push(`    'SELECT EXISTS (SELECT 1 FROM ${parent.table} WHERE id = $1 AND user_id = $2) AS exists',`);
      lines.push(`    [${parent.param}, userId]`);
      lines.push("  );");
      lines.push("  return rows[0]?.exists ?? false;");
      lines.push("}");
    }
  }

  if (has(ctx, "create")) {
    const columns = [
      ...(ctx.isPublic ? [] : [{ column: "user_id", value: "params.userId" }]),
      ...ctx.naming.parents.map((p) => ({ column: p.column, value: `params.${p.param}` })),
      ...ctx.fields.map((f) => ({ column: f.name, value: `params.${toCamel(f.name)}` })),
    ];
    lines.push("");
    lines.push(`export async function insert${S}(params: Create${S}Params): Promise<${S}Row> {`);
    lines.push(`  const rows = await db().query<${S}Row[]>(`);
    if (columns.length === 0) {
      lines.push(`    \`INSERT INTO ${table} DEFAULT VALUES RETURNING \${${columnsConst}}\`,`);
      lines.push("    []");
    } else {
      lines.push(`    \`INSERT INTO ${table} (${columns.map((c) => c.column).join(", ")})`);
      lines.push(`     VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`);
      lines.push(`     RETURNING \${${columnsConst}}\`,`);
      lines.push(`    [${columns.map((c) => c.value).join(", ")}]`);
    }
    lines.push("  );");
    lines.push("  return rows[0]!;");
    lines.push("}");
  }

  if (has(ctx, "update")) {
    lines.push("");
    lines.push("/** Only the keys that are not `undefined` are written (a missing key never becomes NULL). */");
    lines.push(`export async function update${S}(id: ${id}, params: Update${S}Params): Promise<${S}Row | null> {`);
    lines.push("  const columns: Record<string, unknown> = {");
    lines.push(ctx.fields.map((f) => `    ${f.name}: params.${toCamel(f.name)}`).join(",\n"));
    lines.push("  };");
    lines.push("  const entries = Object.entries(columns).filter(([, value]) => value !== undefined);");
    lines.push(`  if (entries.length === 0) return find${S}ById(id);`);
    lines.push("");
    lines.push("  const sets = entries.map(([column], i) => `${column} = $${i + 2}`).join(', ');");
    lines.push(`  const rows = await db().query<${S}Row[]>(`);
    lines.push(`    \`UPDATE ${table} SET \${sets}, updated_at = now() WHERE id = $1 RETURNING \${${columnsConst}}\`,`);
    lines.push("    [id, ...entries.map(([, value]) => value)]");
    lines.push("  );");
    lines.push("  return rows[0] ?? null;");
    lines.push("}");
  }

  if (has(ctx, "delete")) {
    lines.push("");
    lines.push(`export async function delete${S}(id: ${id}): Promise<boolean> {`);
    lines.push(`  const rows = await db().query<Array<{ id: ${id} }>>('DELETE FROM ${table} WHERE id = $1 RETURNING id', [id]);`);
    lines.push("  return rows.length > 0;");
    lines.push("}");
  }

  return lines.join("\n") + "\n";
}

// ==================== controller ====================

export function renderController(ctx: ResourceContext): string {
  const { S, P, p, label, labels, rel, base } = names(ctx);
  const repo = `${p}Repository`;
  const owned = !ctx.isPublic;
  const userArg = owned ? "userId: string, " : "";
  const userLog = owned ? ", userId" : "";
  const parentCheck = owned && needsParentParam(ctx);

  const validatorTypes = [
    needsParentParam(ctx) ? `${S}ParentParam` : null,
    needsIdParam(ctx) ? `${S}IdParam` : null,
    has(ctx, "list") ? `List${P}Query` : null,
    has(ctx, "create") ? `Create${S}Input` : null,
    has(ctx, "update") ? `Update${S}Input` : null,
  ].filter(Boolean);

  const lines: string[] = [];

  if (!ctx.withRepository) {
    lines.push(`import { toSafeErrorResult } from '${rel}shared/api.utils.js';`);
    lines.push(`import type { ControllerResult } from '${rel}shared/api.utils.js';`);
    lines.push(`import { AppError } from '${rel}shared/errors.utils.js';`);
    lines.push(importLine(validatorTypes, `./${base}.validator.js`, true));
    lines.push("");
    lines.push("// No repository was generated (--no-repository): implement each operation here, with external");
    lines.push(`// calls in a ${base}.service.ts and any SQL in a ${base}.repository.ts. Use createResponse.success(...).`);
    const stub = (fn: string, args: string[], context: string): void => {
      lines.push("");
      lines.push(`export async function ${fn}(${args.join(", ")}): Promise<ControllerResult<unknown>> {`);
      lines.push("  try {");
      lines.push("    throw new AppError('Not implemented yet', 501, 'NOT_IMPLEMENTED');");
      lines.push("  } catch (error) {");
      lines.push(`    return toSafeErrorResult(error, { context: '${context}'${userLog} });`);
      lines.push("  }");
      lines.push("}");
    };
    const user = owned ? ["userId: string"] : [];
    const parent = needsParentParam(ctx) ? [`_parent: ${S}ParentParam`] : [];
    if (has(ctx, "list")) stub(`list${P}`, [...user, ...parent, `_query: List${P}Query`], `${p}.list`);
    if (has(ctx, "get")) stub(`get${S}`, [...user, `_params: ${S}IdParam`], `${p}.get`);
    if (has(ctx, "create")) stub(`create${S}`, [...user, ...parent, `_input: Create${S}Input`], `${p}.create`);
    if (has(ctx, "update")) stub(`update${S}`, [...user, `_params: ${S}IdParam`, `_input: Update${S}Input`], `${p}.update`);
    if (has(ctx, "delete")) stub(`delete${S}`, [...user, `_params: ${S}IdParam`], `${p}.delete`);
    return lines.join("\n") + "\n";
  }

  lines.push(`import { createResponse, toSafeErrorResult } from '${rel}shared/api.utils.js';`);
  lines.push(`import type { ControllerResult } from '${rel}shared/api.utils.js';`);
  lines.push(`import { notFoundError } from '${rel}shared/errors.utils.js';`);
  if (has(ctx, "list")) lines.push(`import { buildPaginationMeta, resolvePage } from '${rel}shared/pagination.utils.js';`);
  lines.push(`import * as ${repo} from './${base}.repository.js';`);
  lines.push(importLine(validatorTypes, `./${base}.validator.js`, true));
  lines.push(importLine([`${S}View`, has(ctx, "list") && `${P}ListResult`], `./${base}.types.js`, true));
  lines.push(`import type { ${S}Row } from '${rel}types/db.types.js';`);

  const needsLoad = has(ctx, "get") || has(ctx, "update") || has(ctx, "delete");
  if (needsLoad) {
    const conditions = [
      "!row",
      ...(owned ? ["row.user_id !== userId"] : []),
      ...ctx.naming.parents.map((parent) => `row.${parent.column} !== params.${parent.param}`),
    ];
    lines.push("");
    lines.push(
      owned
        ? `/** Loads a ${label} and checks ownership: someone else's ${label} is reported as not found (no existence leak). */`
        : `/** Loads one ${label} or throws a 404. */`,
    );
    lines.push(`async function require${S}(${userArg}params: ${S}IdParam): Promise<${S}Row> {`);
    lines.push(`  const row = await ${repo}.find${S}ById(params.id);`);
    lines.push(`  if (${conditions.join(" || ")}) throw notFoundError('${cap(label)}');`);
    lines.push("  return row;");
    lines.push("}");
  }

  if (parentCheck) {
    for (const parent of ctx.naming.parents) {
      lines.push("");
      lines.push(`async function require${parent.pascal}(userId: string, ${parent.param}: ${idTsType(parentIdType(ctx, parent))}): Promise<void> {`);
      lines.push(`  if (!(await ${repo}.${toCamel(parent.pascal)}ExistsForUser(${parent.param}, userId))) throw notFoundError('${parent.pascal}');`);
      lines.push("}");
    }
  }

  lines.push("");
  lines.push(`function toView(row: ${S}Row): ${S}View {`);
  lines.push("  return row;");
  lines.push("}");

  const parentGuards = (indent: string, source: string): void => {
    if (!parentCheck) return;
    for (const parent of ctx.naming.parents) {
      lines.push(`${indent}await require${parent.pascal}(userId, ${source}.${parent.param});`);
    }
  };
  const userPass = owned ? "userId, " : "";
  const userParams = owned ? ["userId: string"] : [];
  const parentParams = needsParentParam(ctx) ? [`parent: ${S}ParentParam`] : [];

  if (has(ctx, "list")) {
    const filterEntries = [
      ...(owned ? ["userId"] : []),
      ...ctx.naming.parents.map((parent) => `${parent.param}: parent.${parent.param}`),
    ];
    lines.push("");
    lines.push(signature(`export async function list${P}`, [...userParams, ...parentParams, `query: List${P}Query`], `: Promise<ControllerResult<${P}ListResult>> {`));
    lines.push("  try {");
    parentGuards("    ", "parent");
    lines.push("    const { page, limit, offset } = resolvePage(query.page, query.limit);");
    lines.push(filterEntries.length > 0 ? `    const filter = { ${filterEntries.join(", ")} };` : "    const filter = {};");
    lines.push("    const [rows, total] = await Promise.all([");
    lines.push(`      ${repo}.list${P}({ ...filter, limit, offset }),`);
    lines.push(`      ${repo}.count${P}(filter)`);
    lines.push("    ]);");
    lines.push("    const pagination = buildPaginationMeta(page, limit, total);");
    lines.push(`    return createResponse.success('${cap(labels)} retrieved', { ${p}: rows.map(toView), pagination }, 200, pagination);`);
    lines.push("  } catch (error) {");
    lines.push(`    return toSafeErrorResult(error, { context: '${p}.list'${userLog} });`);
    lines.push("  }");
    lines.push("}");
  }

  if (has(ctx, "get")) {
    lines.push("");
    lines.push(signature(`export async function get${S}`, [...userParams, `params: ${S}IdParam`], `: Promise<ControllerResult<${S}View>> {`));
    lines.push("  try {");
    lines.push(`    return createResponse.success('${cap(label)} retrieved', toView(await require${S}(${userPass}params)));`);
    lines.push("  } catch (error) {");
    lines.push(`    return toSafeErrorResult(error, { context: '${p}.get'${userLog}, id: params.id });`);
    lines.push("  }");
    lines.push("}");
  }

  if (has(ctx, "create")) {
    const entries = [
      ...(owned ? ["userId"] : []),
      ...ctx.naming.parents.map((parent) => `${parent.param}: parent.${parent.param}`),
      ...ctx.fields.map((f) => `${toCamel(f.name)}: input.${f.name}${f.optional ? " ?? null" : ""}`),
    ];
    lines.push("");
    lines.push(signature(`export async function create${S}`, [...userParams, ...parentParams, `input: Create${S}Input`], `: Promise<ControllerResult<${S}View>> {`));
    lines.push("  try {");
    parentGuards("    ", "parent");
    lines.push("    // Defaults and undefined -> null happen here, at the controller -> repository boundary.");
    lines.push(`    const row = await ${repo}.insert${S}({`);
    lines.push(entries.map((e) => `      ${e}`).join(",\n"));
    lines.push("    });");
    lines.push(`    return createResponse.success('${cap(label)} created', toView(row), 201);`);
    lines.push("  } catch (error) {");
    lines.push(`    return toSafeErrorResult(error, { context: '${p}.create'${userLog} });`);
    lines.push("  }");
    lines.push("}");
  }

  if (has(ctx, "update")) {
    lines.push("");
    lines.push(signature(`export async function update${S}`, [...userParams, `params: ${S}IdParam`, `input: Update${S}Input`], `: Promise<ControllerResult<${S}View>> {`));
    lines.push("  try {");
    lines.push(`    await require${S}(${userPass}params);`);
    lines.push(`    const row = await ${repo}.update${S}(params.id, {`);
    lines.push("      // undefined = keep the current value; null = clear it (optional fields only)");
    lines.push(ctx.fields.map((f) => `      ${toCamel(f.name)}: input.${f.name}`).join(",\n"));
    lines.push("    });");
    lines.push(`    if (!row) throw notFoundError('${cap(label)}');`);
    lines.push(`    return createResponse.success('${cap(label)} updated', toView(row));`);
    lines.push("  } catch (error) {");
    lines.push(`    return toSafeErrorResult(error, { context: '${p}.update'${userLog}, id: params.id });`);
    lines.push("  }");
    lines.push("}");
  }

  if (has(ctx, "delete")) {
    lines.push("");
    lines.push(signature(`export async function delete${S}`, [...userParams, `params: ${S}IdParam`], `: Promise<ControllerResult<{ id: ${idTs(ctx)} }>> {`));
    lines.push("  try {");
    lines.push(`    await require${S}(${userPass}params);`);
    lines.push(`    if (!(await ${repo}.delete${S}(params.id))) throw notFoundError('${cap(label)}');`);
    lines.push(`    return createResponse.success('${cap(label)} deleted', { id: params.id });`);
    lines.push("  } catch (error) {");
    lines.push(`    return toSafeErrorResult(error, { context: '${p}.delete'${userLog}, id: params.id });`);
    lines.push("  }");
    lines.push("}");
  }

  return lines.join("\n") + "\n";
}

// ==================== handler ====================

export function renderHandler(ctx: ResourceContext): string {
  const { S, P, base, rel } = names(ctx);
  const user = ctx.isPublic ? "" : "req.user!.id, ";
  const withParent = needsParentParam(ctx);
  const usesComposed = withParent || has(ctx, "update");

  const validators = [
    withParent ? `validate${S}ParentParam` : null,
    needsIdParam(ctx) ? `validate${S}IdParam` : null,
    has(ctx, "list") ? `validateList${P}Query` : null,
    has(ctx, "create") ? `validateCreate${S}` : null,
    has(ctx, "update") ? `validateUpdate${S}` : null,
  ].filter(Boolean);
  const controllers = [
    has(ctx, "list") ? `list${P}` : null,
    has(ctx, "get") ? `get${S}` : null,
    has(ctx, "create") ? `create${S}` : null,
    has(ctx, "update") ? `update${S}` : null,
    has(ctx, "delete") ? `delete${S}` : null,
  ].filter(Boolean);

  const lines: string[] = [];
  lines.push("import type { Request, Response } from 'express';");
  lines.push(`import { sendResponse${usesComposed ? ", validateComposed" : ""} } from '${rel}shared/api.utils.js';`);
  lines.push(importLine(validators, `./${base}.validator.js`));
  lines.push(importLine(controllers, `./${base}.controller.js`));
  lines.push("");
  lines.push(
    ctx.isPublic
      ? "// Handlers only wire validator -> controller (public routes: mounted before requireAuth)."
      : "// Handlers only wire validator -> controller. req.user is set by requireAuth (mounted in api/routes.ts).",
  );

  const handler = (name: string, body: string[]): void => {
    lines.push("");
    lines.push(`export async function ${name}(req: Request, res: Response): Promise<void> {`);
    lines.push(...body);
    lines.push("}");
  };

  if (has(ctx, "list")) {
    handler(
      `list${P}Handler`,
      withParent
        ? [
            "  await sendResponse(",
            "    req,",
            "    res,",
            "    () =>",
            "      validateComposed(",
            `        () => validate${S}ParentParam(req.params),`,
            `        () => validateList${P}Query(req.query),`,
            "        (params, query) => ({ params, query })",
            "      ),",
            `    (data) => list${P}(${user}data.params, data.query)`,
            "  );",
          ]
        : [`  await sendResponse(req, res, () => validateList${P}Query(req.query), (query) => list${P}(${user}query));`],
    );
  }
  if (has(ctx, "get")) {
    handler(`get${S}Handler`, [
      `  await sendResponse(req, res, () => validate${S}IdParam(req.params), (params) => get${S}(${user}params));`,
    ]);
  }
  if (has(ctx, "create")) {
    handler(
      `create${S}Handler`,
      withParent
        ? [
            "  await sendResponse(",
            "    req,",
            "    res,",
            "    () =>",
            "      validateComposed(",
            `        () => validate${S}ParentParam(req.params),`,
            `        () => validateCreate${S}(req.body),`,
            "        (params, input) => ({ params, input })",
            "      ),",
            `    (data) => create${S}(${user}data.params, data.input)`,
            "  );",
          ]
        : [`  await sendResponse(req, res, () => validateCreate${S}(req.body), (input) => create${S}(${user}input));`],
    );
  }
  if (has(ctx, "update")) {
    handler(`update${S}Handler`, [
      "  await sendResponse(",
      "    req,",
      "    res,",
      "    () =>",
      "      validateComposed(",
      `        () => validate${S}IdParam(req.params),`,
      `        () => validateUpdate${S}(req.body),`,
      "        (params, input) => ({ params, input })",
      "      ),",
      `    (data) => update${S}(${user}data.params, data.input)`,
      "  );",
    ]);
  }
  if (has(ctx, "delete")) {
    handler(`delete${S}Handler`, [
      `  await sendResponse(req, res, () => validate${S}IdParam(req.params), (params) => delete${S}(${user}params));`,
    ]);
  }

  return lines.join("\n") + "\n";
}

// ==================== routes ====================

export function renderRoutes(ctx: ResourceContext): string {
  const { S, s, P, label, labels, base, rel } = names(ctx);
  const apiPath = `/api/${ctx.naming.mountPath}`;
  const withParent = needsParentParam(ctx);

  const schemas = [
    withParent ? `${s}ParentParamSchema` : null,
    needsIdParam(ctx) ? `${s}IdParamSchema` : null,
    has(ctx, "list") ? `list${P}QuerySchema` : null,
    has(ctx, "create") ? `create${S}Schema` : null,
    has(ctx, "update") ? `update${S}Schema` : null,
  ].filter(Boolean);
  const handlers = [
    has(ctx, "list") ? `list${P}Handler` : null,
    has(ctx, "get") ? `get${S}Handler` : null,
    has(ctx, "create") ? `create${S}Handler` : null,
    has(ctx, "update") ? `update${S}Handler` : null,
    has(ctx, "delete") ? `delete${S}Handler` : null,
  ].filter(Boolean);

  const parentParams = withParent ? `, params: ${s}ParentParamSchema` : "";
  const article = /^[aeiou]/i.test(label) ? "an" : "a";
  const lines: string[] = [];
  lines.push("import { Router } from 'express';");
  lines.push(`import { docs } from '${rel}shared/openapi.utils.js';`);
  lines.push(importLine(schemas, `./${base}.validator.js`));
  lines.push(importLine(handlers, `./${base}.handler.js`));
  lines.push("");
  if (hasParents(ctx)) {
    lines.push("// mergeParams: the parent ids in the mount path reach req.params");
    lines.push("const router = Router({ mergeParams: true });");
  } else {
    lines.push("const router = Router();");
  }

  const route = (method: string, sub: string, doc: string, handler: string): void => {
    lines.push("");
    lines.push(`/** ${method.toUpperCase()} ${apiPath}${sub === "/" ? "" : sub} */`);
    lines.push(`router.${method}('${sub}', docs({ ${doc} }), ${handler});`);
  };

  if (has(ctx, "list")) route("get", "/", `summary: 'List ${labels}'${parentParams}, query: list${P}QuerySchema`, `list${P}Handler`);
  if (has(ctx, "create")) route("post", "/", `summary: 'Create ${article} ${label}'${parentParams}, body: create${S}Schema`, `create${S}Handler`);
  if (has(ctx, "get")) route("get", "/:id", `summary: 'Get ${article} ${label}', params: ${s}IdParamSchema`, `get${S}Handler`);
  if (has(ctx, "update")) {
    route(
      "patch",
      "/:id",
      `summary: 'Update ${article} ${label}', description: 'Only the fields sent change; null clears optional fields.', params: ${s}IdParamSchema, body: update${S}Schema`,
      `update${S}Handler`,
    );
  }
  if (has(ctx, "delete")) route("delete", "/:id", `summary: 'Delete ${article} ${label}', params: ${s}IdParamSchema`, `delete${S}Handler`);

  lines.push("");
  lines.push("export default router;");
  return lines.join("\n") + "\n";
}

// ==================== migration ====================

export function renderMigration(ctx: ResourceContext): string {
  const table = ctx.naming.table;
  const id = idSqlType(ctx.idType);
  const columns: string[] = [`  id ${id.column}`];
  if (!ctx.isPublic) columns.push("  user_id uuid NOT NULL -- REFERENCES users(id) ON DELETE CASCADE");
  for (const parent of ctx.naming.parents) {
    columns.push(`  ${parent.column} ${idSqlType(parentIdType(ctx, parent)).reference} NOT NULL REFERENCES ${parent.table}(id) ON DELETE CASCADE`);
  }
  for (const field of ctx.fields) {
    columns.push(`  ${field.name} ${sqlType(field)}${field.optional ? "" : " NOT NULL"}${sqlCheck(field)}`);
  }
  columns.push("  created_at timestamptz NOT NULL DEFAULT now()", "  updated_at timestamptz NOT NULL DEFAULT now()");

  // user_id comment must not swallow the comma: put commas before comments.
  const body = columns
    .map((col, i) => {
      const comma = i < columns.length - 1 ? "," : "";
      const commentIndex = col.indexOf(" --");
      return commentIndex >= 0 ? `${col.slice(0, commentIndex)}${comma}${col.slice(commentIndex)}` : `${col}${comma}`;
    })
    .join("\n");

  const indexes: string[] = [];
  const listColumns = [...(ctx.isPublic ? [] : ["user_id"]), ...ctx.naming.parents.map((p) => p.column)];
  if (listColumns.length > 0) {
    indexes.push(`CREATE INDEX IF NOT EXISTS ${table}_${listColumns.join("_")}_idx ON ${table} (${listColumns.join(", ")}, created_at DESC);`);
  }

  return [
    `-- ${ctx.naming.singular.words}: generated by katax add endpoint ${ctx.naming.input}`,
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    body,
    ");",
    ...indexes,
    "",
  ].join("\n");
}
