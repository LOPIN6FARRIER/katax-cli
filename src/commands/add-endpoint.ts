import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { error, gray, info, success, title, warning } from "../utils/logger.js";
import { checkAndNotifyProjectDependencyUpdates } from "../utils/version-check.js";
import { resolveResourceNaming } from "../generators/resource/naming.js";
import type { ResourceNaming } from "../generators/resource/naming.js";
import { FIELD_TYPES, parseFieldType, parseFieldsSpec, validateFieldName } from "../generators/resource/fields.js";
import type { FieldSpec, IdType } from "../generators/resource/fields.js";
import {
  ALL_METHODS,
  renderController,
  renderHandler,
  renderMigration,
  renderRepository,
  renderRoutes,
  renderRowType,
  renderTypes,
  renderValidator,
} from "../generators/resource/templates.js";
import type { ResourceContext, ResourceMethod } from "../generators/resource/templates.js";
import {
  missingApiUtilsExports,
  planMigration,
  planMissingSharedFiles,
  planRoutesRegistration,
  detectRowIdType,
  planRowType,
  readProjectTemplate,
} from "../generators/resource/project-files.js";
import type { PlannedFile } from "../generators/resource/project-files.js";

export interface AddEndpointOptions {
  /** Comma list: list,get,create,update,delete (default: all) */
  methods?: string;
  /** uuid (default) | number | string */
  id?: string;
  /** "name:string, price:number?, starts_on:date" */
  fields?: string;
  table?: string;
  singular?: string;
  public?: boolean;
  /** commander sets false with --no-repository */
  repository?: boolean;
  dryRun?: boolean;
  force?: boolean;
  /** commander sets false with --no-interactive */
  interactive?: boolean;
}

const METHOD_ALIASES: Record<string, ResourceMethod> = {
  list: "list",
  index: "list",
  get: "get",
  read: "get",
  show: "get",
  create: "create",
  post: "create",
  update: "update",
  patch: "update",
  put: "update",
  delete: "delete",
  remove: "delete",
  del: "delete",
};

export function parseMethods(value: string | undefined): Set<ResourceMethod> {
  if (!value || value.trim() === "" || value.trim() === "all") return new Set(ALL_METHODS);
  const methods = new Set<ResourceMethod>();
  for (const raw of value.split(",").map((m) => m.trim().toLowerCase()).filter(Boolean)) {
    const method = METHOD_ALIASES[raw];
    if (!method) throw new Error(`Unknown method "${raw}". Use: list, get, create, update, delete`);
    methods.add(method);
  }
  if (methods.size === 0) throw new Error("--methods needs at least one of: list, get, create, update, delete");
  return methods;
}

export function parseIdType(value: string | undefined): IdType {
  const id = (value ?? "uuid").toLowerCase();
  if (id === "uuid" || id === "number" || id === "string") return id;
  if (id === "int" || id === "integer" || id === "serial") return "number";
  throw new Error(`Unknown --id "${value}". Use uuid (default), number or string`);
}

const METHOD_CHOICES: Array<{ name: string; value: ResourceMethod }> = [
  { name: "list    GET    /resource", value: "list" },
  { name: "get     GET    /resource/:id", value: "get" },
  { name: "create  POST   /resource", value: "create" },
  { name: "update  PATCH  /resource/:id", value: "update" },
  { name: "delete  DELETE /resource/:id", value: "delete" },
];

async function promptMethods(): Promise<Set<ResourceMethod>> {
  const { methods } = await inquirer.prompt<{ methods: ResourceMethod[] }>([
    {
      type: "checkbox",
      name: "methods",
      message: "Operations to generate (space to toggle, enter to confirm):",
      choices: METHOD_CHOICES.map((c) => ({ ...c, short: c.value, checked: true })),
      validate: (selected: ResourceMethod[]) => selected.length > 0 || "Pick at least one operation",
    },
  ]);
  return new Set(methods);
}

async function promptFields(reserved: string[]): Promise<FieldSpec[]> {
  info("Define the fields (press Enter on an empty name to finish).");
  gray(`  Types: ${FIELD_TYPES.filter((t) => t !== "enum").join(", ")}, enum(a|b)\n`);
  const fields: FieldSpec[] = [];
  for (;;) {
    const { name } = await inquirer.prompt<{ name: string }>([
      {
        type: "input",
        name: "name",
        message: "Field name (snake_case):",
        validate: (input: string) => {
          if (!input.trim()) return true;
          try {
            validateFieldName(input.trim(), new Set(["id", "user_id", "created_at", "updated_at", ...reserved]));
            if (fields.some((f) => f.name === input.trim())) return "Already added";
            return true;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
      },
    ]);
    if (!name.trim()) break;

    const { type, optional } = await inquirer.prompt<{ type: string; optional: boolean }>([
      {
        type: "input",
        name: "type",
        message: `Type for "${name.trim()}":`,
        default: "string",
        validate: (input: string) => {
          try {
            parseFieldType(input);
            return true;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
      },
      { type: "confirm", name: "optional", message: "Optional (can be omitted / null)?", default: false },
    ]);
    const parsed = parseFieldType(type);
    fields.push({ name: name.trim(), type: parsed.type, optional, ...(parsed.enumValues ? { enumValues: parsed.enumValues } : {}) });
  }
  return fields;
}

function readPackageJson(cwd: string): Record<string, any> | null {
  const file = path.join(cwd, "package.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function relative(cwd: string, file: string): string {
  return path.relative(cwd, file).split(path.sep).join("/");
}

export interface ResourcePlan {
  naming: ResourceNaming;
  context: ResourceContext;
  files: PlannedFile[];
  warnings: string[];
  migration?: PlannedFile;
}

/** Builds every file change for a resource without touching the disk. */
export function planResource(cwd: string, naming: ResourceNaming, context: ResourceContext, force = false): ResourcePlan {
  const warnings: string[] = [];
  const files: PlannedFile[] = [];
  const base = naming.fileBase;

  const typesContent = context.withRepository
    ? renderTypes(context)
    : // Without a table there is no row type: the view is yours to define.
      `/** What the API returns for a ${naming.singular.words}. */\nexport interface ${naming.singular.pascal}View {\n  id: ${context.idType === "number" ? "number" : "string"};\n}\n`;

  const resourceFiles: Array<[string, string]> = [
    [`${base}.validator.ts`, renderValidator(context)],
    [`${base}.types.ts`, typesContent],
    ...(context.withRepository ? ([[`${base}.repository.ts`, renderRepository(context)]] as Array<[string, string]>) : []),
    [`${base}.controller.ts`, renderController(context)],
    [`${base}.handler.ts`, renderHandler(context)],
    [`${base}.routes.ts`, renderRoutes(context)],
  ];

  for (const [name, content] of resourceFiles) {
    const file = path.join(naming.dir, name);
    const exists = fs.existsSync(file);
    if (exists && !force) {
      throw new Error(`${relative(cwd, file)} already exists. Use --force to overwrite it.`);
    }
    files.push({ path: file, content, action: exists ? "overwrite" : "create" });
  }

  files.push(...planMissingSharedFiles(cwd));

  if (!context.isPublic && !fs.existsSync(path.join(cwd, "src", "middleware", "auth.middleware.ts"))) {
    if (!fs.existsSync(path.join(cwd, "src", "shared", "jwt.utils.ts"))) {
      throw new Error(
        "This project has no auth (src/shared/jwt.utils.ts not found), so private endpoints can't be protected. " +
          "Use --public, or create the project with JWT authentication.",
      );
    }
    files.push({
      path: path.join(cwd, "src", "middleware", "auth.middleware.ts"),
      content: readProjectTemplate("middleware/auth.middleware.ts"),
      action: "create",
    });
  }

  if (context.withRepository) {
    const rowType = planRowType(cwd, `${naming.singular.pascal}Row`, renderRowType(context));
    if ("skipped" in rowType) warnings.push(rowType.skipped);
    else files.push(rowType);
  }

  const routes = planRoutesRegistration(cwd, naming, context.isPublic);
  warnings.push(...routes.warnings);
  if (routes.file) files.push(routes.file);

  const missingExports = missingApiUtilsExports(cwd);
  if (missingExports.length > 0) {
    warnings.push(
      `src/shared/api.utils.ts is missing ${missingExports.join(", ")} (older template). ` +
        "Update it from a new project (katax init) or the generated code won't compile.",
    );
  }

  const migration = context.withRepository ? planMigration(cwd, naming.table, renderMigration(context)) : undefined;
  if (migration) files.push(migration);

  return { naming, context, files, warnings, migration };
}

const RUNTIME_DEPENDENCIES: Array<{ name: string; dev?: boolean; when: (ctx: ResourceContext) => boolean }> = [
  { name: "katax-core", when: () => true },
  { name: "katax-service-manager", when: () => true },
  { name: "swagger-ui-express", when: () => true },
  { name: "@types/swagger-ui-express", dev: true, when: () => true },
  { name: "pg", when: (ctx) => ctx.withRepository },
  { name: "@types/pg", dev: true, when: (ctx) => ctx.withRepository },
];

export async function addEndpointCommand(input: string, options: AddEndpointOptions = {}): Promise<void> {
  const cwd = process.cwd();
  try {
    const pkg = readPackageJson(cwd);
    if (!pkg) throw new Error("No package.json here. Run this command from your project root.");

    const naming = resolveResourceNaming(input, { singular: options.singular, table: options.table, cwd });
    title(`🎯 katax add endpoint ${input}`);

    const interactive = options.interactive !== false && Boolean(process.stdin.isTTY);
    const methods =
      options.methods === undefined && interactive ? await promptMethods() : parseMethods(options.methods);
    const idType = parseIdType(options.id);
    const isPublic = Boolean(options.public);
    const withRepository = options.repository !== false;
    const needsFields = methods.has("create") || methods.has("update");
    const reserved = naming.parents.map((p) => p.column);

    let fields: FieldSpec[] = [];
    if (options.fields !== undefined) {
      fields = parseFieldsSpec(options.fields, reserved);
    } else if (needsFields && interactive) {
      fields = await promptFields(reserved);
    }
    if (fields.length === 0 && needsFields) {
      fields = [{ name: "name", type: "string", optional: false }];
      info('No fields given: using "name:string". Pass --fields "name:string, price:number?" to choose.');
    }

    const parentIdTypes: Record<string, IdType> = {};
    for (const parent of naming.parents) {
      const detected = detectRowIdType(cwd, `${parent.pascal}Row`);
      if (detected) parentIdTypes[parent.param] = detected;
    }

    const context: ResourceContext = { naming, fields, methods, idType, isPublic, withRepository, parentIdTypes };
    const plan = planResource(cwd, naming, context, Boolean(options.force));

    console.log("");
    for (const file of plan.files) {
      const verb = file.action === "create" ? "CREATE" : file.action === "update" ? "UPDATE" : "OVERWRITE";
      gray(`  ${verb.padEnd(9)} ${relative(cwd, file.path)}`);
    }

    if (options.dryRun) {
      console.log("");
      info("Dry run: nothing was written.");
      for (const w of plan.warnings) warning(w);
      return;
    }

    for (const file of plan.files) {
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      fs.writeFileSync(file.path, file.content, "utf-8");
    }

    console.log("");
    success(`${naming.plural.pascal} endpoint created`);
    const api = `/api/${naming.mountPath}`;
    const routes: string[] = [];
    if (methods.has("list")) routes.push(`GET    ${api}`);
    if (methods.has("create")) routes.push(`POST   ${api}`);
    if (methods.has("get")) routes.push(`GET    ${api}/:id`);
    if (methods.has("update")) routes.push(`PATCH  ${api}/:id`);
    if (methods.has("delete")) routes.push(`DELETE ${api}/:id`);
    for (const r of routes) gray(`  ${r}${isPublic ? "" : "  🔒"}`);

    for (const w of plan.warnings) warning(w);

    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const missing = RUNTIME_DEPENDENCIES.filter((d) => d.when(context) && !deps[d.name]);
    const runtime = missing.filter((d) => !d.dev).map((d) => d.name);
    const dev = missing.filter((d) => d.dev).map((d) => d.name);
    if (runtime.length > 0 || dev.length > 0) {
      warning("Missing dependencies:");
      if (runtime.length > 0) gray(`  npm install ${runtime.join(" ")}`);
      if (dev.length > 0) gray(`  npm install -D ${dev.join(" ")}`);
    }

    console.log("");
    info("Next steps:");
    let step = 1;
    if (plan.migration) gray(`  ${step++}. Review and run ${relative(cwd, plan.migration.path)} on your database`);
    gray(`  ${step++}. Adjust the .describe() texts and rules in ${naming.fileBase}.validator.ts`);
    gray(`  ${step++}. npx tsc --noEmit`);
    console.log("");

    await checkAndNotifyProjectDependencyUpdates(cwd);
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
