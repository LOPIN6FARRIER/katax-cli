/**
 * Field specs for `--fields "name:string, price:number?, starts_on:date, status:enum(draft|published)"`.
 * A trailing `?` makes the field optional: `.nullish()` in the validators,
 * a nullable column, and clearable (null = remove the value) on update.
 */

export const FIELD_TYPES = [
  "string",
  "text",
  "int",
  "number",
  "boolean",
  "date",
  "datetime",
  "email",
  "uuid",
  "enum",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldSpec {
  /** snake_case column / JSON key */
  name: string;
  type: FieldType;
  optional: boolean;
  enumValues?: string[];
}

export type IdType = "uuid" | "number" | "string";

const FIELD_NAME = /^[a-z][a-z0-9_]*$/;
const RESERVED = new Set(["id", "user_id", "created_at", "updated_at"]);

const TYPE_ALIASES: Record<string, FieldType> = {
  str: "string",
  integer: "int",
  float: "number",
  decimal: "number",
  bool: "boolean",
  timestamp: "datetime",
};

export function parseFieldType(raw: string): { type: FieldType; enumValues?: string[] } {
  const value = raw.trim().toLowerCase();
  const enumMatch = value.match(/^enum\(([^)]*)\)$/);
  if (enumMatch) {
    const enumValues = enumMatch[1]!
      .split(/[|,]/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (enumValues.length === 0) throw new Error(`enum needs at least one value: enum(a|b)`);
    for (const v of enumValues) {
      if (!/^[a-z0-9_-]+$/i.test(v)) throw new Error(`Invalid enum value "${v}" (letters, numbers, "_" and "-")`);
    }
    return { type: "enum", enumValues };
  }
  const type = (TYPE_ALIASES[value] ?? value) as FieldType;
  if (!FIELD_TYPES.includes(type) || type === "enum") {
    throw new Error(`Unknown field type "${raw}". Use one of: ${FIELD_TYPES.filter((t) => t !== "enum").join(", ")}, enum(a|b)`);
  }
  return { type };
}

export function validateFieldName(name: string, reserved: Set<string> = RESERVED): void {
  if (!FIELD_NAME.test(name)) {
    throw new Error(`Invalid field name "${name}": use snake_case (lowercase letters, numbers and "_")`);
  }
  if (reserved.has(name)) {
    throw new Error(`"${name}" is generated automatically - don't declare it in --fields`);
  }
}

export function parseFieldsSpec(spec: string, extraReserved: string[] = []): FieldSpec[] {
  const reserved = new Set([...RESERVED, ...extraReserved]);
  const fields: FieldSpec[] = [];
  // Split on commas that are not inside enum(...)
  const parts = spec.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^([^:]+):(.+?)(\?)?$/);
    if (!match) throw new Error(`Invalid field "${part}". Format: name:type or name:type? (e.g. price:number?)`);
    const name = match[1]!.trim();
    validateFieldName(name, reserved);
    if (fields.some((f) => f.name === name)) throw new Error(`Field "${name}" is declared twice`);
    const { type, enumValues } = parseFieldType(match[2]!);
    fields.push({ name, type, optional: Boolean(match[3]), ...(enumValues ? { enumValues } : {}) });
  }
  return fields;
}

// ==================== MAPPINGS ====================

export function humanize(name: string): string {
  const words = name.replace(/_id$/, "").split("_").filter(Boolean).join(" ");
  return words ? words[0]!.toUpperCase() + words.slice(1) : name;
}

/** katax-core schema expression for the field's value (no optional/nullish modifier). */
export function schemaExpression(field: FieldSpec): string {
  switch (field.type) {
    case "string":
      return field.optional ? "k.string().maxLength(255)" : "k.string().minLength(1).maxLength(255)";
    case "text":
      return field.optional ? "k.string()" : "k.string().minLength(1)";
    case "int":
      return "k.number().integer()";
    case "number":
      return "k.number()";
    case "boolean":
      return "k.boolean()";
    case "date":
      return "dateSchema";
    case "datetime":
      return "k.string().datetime()";
    case "email":
      return "k.string().email()";
    case "uuid":
      return "k.string().uuid()";
    case "enum":
      return `k.enum([${field.enumValues!.map((v) => `'${v}'`).join(", ")}] as const)`;
  }
}

/** TypeScript type of the column as returned by `pg`. */
export function rowTsType(field: FieldSpec): string {
  let base: string;
  switch (field.type) {
    case "int":
    case "number":
      base = "number";
      break;
    case "boolean":
      base = "boolean";
      break;
    case "datetime":
      base = "Date";
      break;
    case "enum":
      base = field.enumValues!.map((v) => `'${v}'`).join(" | ");
      break;
    default:
      base = "string";
  }
  return field.optional ? `${base} | null` : base;
}

/** TypeScript type of the value the client sends (datetime arrives as an ISO string). */
export function inputTsType(field: FieldSpec): string {
  if (field.type === "datetime") return "string";
  return rowTsType({ ...field, optional: false });
}

export function sqlType(field: FieldSpec): string {
  switch (field.type) {
    case "string":
    case "email":
      return "varchar(255)";
    case "text":
      return "text";
    case "int":
      return "integer";
    case "number":
      // double precision comes back from pg as a JS number (numeric would be a string)
      return "double precision";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "datetime":
      return "timestamptz";
    case "uuid":
      return "uuid";
    case "enum":
      return "text";
  }
}

/** CHECK constraint for enum columns ("" for other types). */
export function sqlCheck(field: FieldSpec): string {
  if (field.type !== "enum") return "";
  return ` CHECK (${field.name} IN (${field.enumValues!.map((v) => `'${v}'`).join(", ")}))`;
}

/** Column as written in the SELECT list (dates as text so pg doesn't shift them). */
export function selectColumn(name: string, type: FieldType | "id"): string {
  return type === "date" ? `${name}::text AS ${name}` : name;
}

export function idSchemaExpression(idType: IdType, label: string): string {
  switch (idType) {
    case "uuid":
      return `k.string().uuid('Invalid ${label} id')`;
    case "number":
      return "k.coerce.number().integer().min(1)";
    case "string":
      return "k.string().minLength(1)";
  }
}

export function idTsType(idType: IdType): string {
  return idType === "number" ? "number" : "string";
}

export function idSqlType(idType: IdType): { column: string; reference: string } {
  switch (idType) {
    case "uuid":
      return { column: "uuid PRIMARY KEY DEFAULT gen_random_uuid()", reference: "uuid" };
    case "number":
      return { column: "integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY", reference: "integer" };
    case "string":
      return { column: "text PRIMARY KEY DEFAULT gen_random_uuid()::text", reference: "text" };
  }
}
