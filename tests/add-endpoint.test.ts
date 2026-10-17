import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveResourceNaming, singularizeWord } from "../src/generators/resource/naming.ts";
import { parseFieldsSpec } from "../src/generators/resource/fields.ts";
import {
  ALL_METHODS,
  renderController,
  renderHandler,
  renderMigration,
  renderRepository,
  renderRoutes,
  renderValidator,
} from "../src/generators/resource/templates.ts";
import type { ResourceContext } from "../src/generators/resource/templates.ts";
import { planRoutesRegistration, planMigration } from "../src/generators/resource/project-files.ts";
import { parseIdType, parseMethods, planResource } from "../src/commands/add-endpoint.ts";

const tmpDirs: string[] = [];
function tmpProject(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "katax-endpoint-"));
  tmpDirs.push(dir);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function context(input: string, overrides: Partial<ResourceContext> = {}): ResourceContext {
  return {
    naming: resolveResourceNaming(input, { cwd: "/project" }),
    fields: parseFieldsSpec("name:string, note:text?, starts_on:date"),
    methods: new Set(ALL_METHODS),
    idType: "uuid",
    isPublic: false,
    withRepository: true,
    ...overrides,
  };
}

describe("naming", () => {
  it("singularizes common English plurals", () => {
    expect(singularizeWord("habits")).toBe("habit");
    expect(singularizeWord("categories")).toBe("category");
    expect(singularizeWord("addresses")).toBe("address");
    expect(singularizeWord("boxes")).toBe("box");
    expect(singularizeWord("statuses")).toBe("status");
    expect(singularizeWord("people")).toBe("person");
    expect(singularizeWord("news")).toBe("news");
    expect(singularizeWord("status")).toBe("status");
  });

  it("uses only the last segment for identifiers", () => {
    const n = resolveResourceNaming("admin/user-roles", { cwd: "/project" });
    expect(n.plural.pascal).toBe("UserRoles");
    expect(n.singular.pascal).toBe("UserRole");
    expect(n.table).toBe("user_roles");
    expect(n.routerIdentifier).toBe("adminUserRolesRouter");
    expect(n.dir).toBe(path.resolve("/project", "src", "api", "admin", "user-roles"));
    expect(n.srcRelative).toBe("../../../");
  });

  it("supports parent params (sub-resources)", () => {
    const n = resolveResourceNaming("habits/:habitId/reminders", { cwd: "/project" });
    expect(n.folderSegments).toEqual(["habits", "reminders"]);
    expect(n.mountPath).toBe("habits/:habitId/reminders");
    expect(n.parents).toEqual([{ param: "habitId", column: "habit_id", table: "habits", pascal: "Habit" }]);
  });

  it("accepts --singular and --table overrides", () => {
    const n = resolveResourceNaming("staff", { cwd: "/project", singular: "staff-member", table: "team_staff" });
    expect(n.singular.pascal).toBe("StaffMember");
    expect(n.table).toBe("team_staff");
  });

  it("rejects traversal, special characters and bad params", () => {
    expect(() => resolveResourceNaming("../../etc", { cwd: "/project" })).toThrow();
    expect(() => resolveResourceNaming("admin/$(rm -rf)", { cwd: "/project" })).toThrow();
    expect(() => resolveResourceNaming("Habits", { cwd: "/project" })).toThrow(/kebab-case/);
    expect(() => resolveResourceNaming(":id/things", { cwd: "/project" })).toThrow(/must follow/);
    expect(() => resolveResourceNaming("habits/:habitId", { cwd: "/project" })).toThrow(/end with the resource/);
    expect(() => resolveResourceNaming("   ", { cwd: "/project" })).toThrow(/required/);
  });
});

describe("options", () => {
  it("parses methods and id types", () => {
    expect([...parseMethods(undefined)]).toEqual(ALL_METHODS);
    expect([...parseMethods("list, post,patch")]).toEqual(["list", "create", "update"]);
    expect(() => parseMethods("fly")).toThrow(/Unknown method/);
    expect(parseIdType(undefined)).toBe("uuid");
    expect(parseIdType("int")).toBe("number");
    expect(() => parseIdType("bigint")).toThrow();
  });

  it("parses field specs", () => {
    const fields = parseFieldsSpec("name:string, price:number?, status:enum(draft|done), at:timestamp");
    expect(fields).toEqual([
      { name: "name", type: "string", optional: false },
      { name: "price", type: "number", optional: true },
      { name: "status", type: "enum", optional: false, enumValues: ["draft", "done"] },
      { name: "at", type: "datetime", optional: false },
    ]);
    expect(() => parseFieldsSpec("id:string")).toThrow(/generated automatically/);
    expect(() => parseFieldsSpec("Name:string")).toThrow(/snake_case/);
    expect(() => parseFieldsSpec("a:money")).toThrow(/Unknown field type/);
    expect(() => parseFieldsSpec("a:string, a:int")).toThrow(/twice/);
  });
});

describe("templates", () => {
  it("validator: coerced query, nullish optionals, clearable list, uuid ids", () => {
    const out = renderValidator(context("habits"));
    expect(out).toContain("export const HABIT_CLEARABLE = ['note'] as const;");
    expect(out).toContain("id: k.string().uuid('Invalid habit id')");
    expect(out).toContain("page: pageField");
    expect(out).toContain("note: k.string().nullish().describe('Note. Optional.')");
    expect(out).toContain("starts_on: dateSchema.describe('Starts on.')");
    expect(out).toContain("validateNormalized(updateHabitSchema, data, HABIT_CLEARABLE)");
    expect(out).not.toMatch(/k\.number\(\)\.optional\(\)/);
  });

  it("number ids are coerced from the URL", () => {
    expect(renderValidator(context("habits", { idType: "number" }))).toContain("id: k.coerce.number().integer().min(1)");
  });

  it("repository: explicit columns, ::text dates, parameterized SQL, only-defined UPDATE", () => {
    const out = renderRepository(context("habits"));
    expect(out).toContain("starts_on::text AS starts_on");
    expect(out).not.toMatch(/SELECT \*\s+FROM/);
    expect(out).toContain("WHERE user_id = $1");
    expect(out).toContain("value !== undefined");
  });

  it("controller: ownership 404, toSafeErrorResult, undefined -> null at the boundary", () => {
    const out = renderController(context("habits"));
    expect(out).toContain("row.user_id !== userId");
    expect(out).toContain("throw notFoundError('Habit')");
    expect(out).toContain("note: input.note ?? null");
    expect(out).toContain("toSafeErrorResult(error, { context: 'habits.create', userId })");
    expect(out).not.toContain("error.message");
    expect(out).not.toMatch(/\bany\b/);
  });

  it("sub-resources check the parent belongs to the user", () => {
    const ctx = context("habits/:habitId/reminders");
    expect(renderController(ctx)).toContain("await requireHabit(userId, parent.habitId);");
    expect(renderRepository(ctx)).toContain("SELECT 1 FROM habits WHERE id = $1 AND user_id = $2");
    expect(renderRoutes(ctx)).toContain("Router({ mergeParams: true })");
    expect(renderHandler(ctx)).toContain("validateComposed(");
    expect(renderMigration(ctx)).toContain("habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE");
  });

  it("uses the parent's own id type when it is known", () => {
    const ctx = context("habits/:habitId/check-ins", { idType: "number", parentIdTypes: { habitId: "uuid" } });
    expect(renderValidator(ctx)).toContain("habitId: k.string().uuid(");
    expect(renderValidator(ctx)).toContain("id: k.coerce.number()");
    expect(renderMigration(ctx)).toContain("habit_id uuid NOT NULL");
  });

  it("public resources have no userId and no user_id column", () => {
    const ctx = context("news", { isPublic: true });
    expect(renderController(ctx)).not.toContain("userId");
    expect(renderRepository(ctx)).not.toContain("user_id");
    expect(renderHandler(ctx)).not.toContain("req.user");
  });

  it("routes carry OpenAPI docs()", () => {
    const out = renderRoutes(context("habits"));
    expect(out).toContain(
      "router.get('/', docs({ summary: 'List habits', query: listHabitsQuerySchema }), listHabitsHandler);",
    );
    expect(out).toContain("body: updateHabitSchema");
  });

  it("only the requested methods are generated", () => {
    const ctx = context("habits", { methods: parseMethods("list,get") });
    expect(renderController(ctx)).not.toContain("createHabit");
    expect(renderValidator(ctx)).not.toContain("HABIT_CLEARABLE");
  });
});

describe("project files", () => {
  const routes = [
    "import { Router } from 'express';",
    "import { healthCheckHandler } from './health/health.handler.js';",
    "import { requireAuth } from '../middleware/auth.middleware.js';",
    "",
    "const router = Router();",
    "",
    "router.get('/health', healthCheckHandler);",
    "",
    "// Everything below requires a valid access token",
    "router.use(requireAuth);",
    "router.use('/habits', habitsRouter);",
    "",
    "export default router;",
    "",
  ].join("\n");

  it("mounts private routers after requireAuth and public ones before it", () => {
    const cwd = tmpProject({ "src/api/routes.ts": routes });
    const priv = planRoutesRegistration(cwd, resolveResourceNaming("goals", { cwd }), false).file!.content;
    expect(priv).toContain("import goalsRouter from './goals/goals.routes.js';");
    expect(priv.indexOf("router.use('/goals', goalsRouter);")).toBeGreaterThan(priv.indexOf("router.use(requireAuth);"));
    expect(priv).toMatch(/router\.use\('\/goals', goalsRouter\);\n\nexport default router;/);

    const pub = planRoutesRegistration(cwd, resolveResourceNaming("news", { cwd }), true).file!.content;
    expect(pub.indexOf("router.use('/news', newsRouter);")).toBeLessThan(pub.indexOf("// Everything below"));
  });

  it("adds requireAuth to an older routes.ts that has none", () => {
    const cwd = tmpProject({
      "src/api/routes.ts": "import { Router } from 'express';\n\nconst router = Router();\n\nexport default router;\n",
    });
    const out = planRoutesRegistration(cwd, resolveResourceNaming("goals", { cwd }), false);
    expect(out.file!.content).toContain("import { requireAuth } from '../middleware/auth.middleware.js';");
    expect(out.file!.content).toContain("router.use(requireAuth);\nrouter.use('/goals', goalsRouter);");
    expect(out.warnings[0]).toMatch(/requireAuth/);
  });

  it("keeps CRLF line endings", () => {
    const cwd = tmpProject({ "src/api/routes.ts": routes.replace(/\n/g, "\r\n") });
    const out = planRoutesRegistration(cwd, resolveResourceNaming("goals", { cwd }), false).file!.content;
    expect(out.split("\r\n").length).toBeGreaterThan(5);
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("numbers migrations after the existing ones", () => {
    const cwd = tmpProject({ "migrations/0007_min_per_day.sql": "" });
    expect(path.basename(planMigration(cwd, "goals", "").path)).toBe("0008_create_goals.sql");
    expect(path.basename(planMigration(tmpProject(), "goals", "").path)).toBe("0001_create_goals.sql");
  });

  it("plans the full resource, shared files and auth middleware", () => {
    const cwd = tmpProject({ "src/api/routes.ts": routes, "src/shared/jwt.utils.ts": "export {}" });
    const naming = resolveResourceNaming("goals", { cwd });
    const plan = planResource(cwd, naming, { ...context("goals"), naming });
    const rel = plan.files.map((f) => path.relative(cwd, f.path).split(path.sep).join("/"));
    expect(rel).toEqual(
      expect.arrayContaining([
        "src/api/goals/goals.validator.ts",
        "src/api/goals/goals.types.ts",
        "src/api/goals/goals.repository.ts",
        "src/api/goals/goals.controller.ts",
        "src/api/goals/goals.handler.ts",
        "src/api/goals/goals.routes.ts",
        "src/shared/api.utils.ts",
        "src/shared/openapi.utils.ts",
        "src/middleware/auth.middleware.ts",
        "src/types/db.types.ts",
        "src/api/routes.ts",
        "migrations/0001_create_goals.sql",
      ]),
    );
  });

  it("refuses private endpoints in projects without auth, and existing files without --force", () => {
    const cwd = tmpProject({ "src/api/routes.ts": routes });
    const naming = resolveResourceNaming("goals", { cwd });
    expect(() => planResource(cwd, naming, { ...context("goals"), naming })).toThrow(/--public/);

    const withFile = tmpProject({ "src/api/goals/goals.routes.ts": "x", "src/shared/jwt.utils.ts": "" });
    const naming2 = resolveResourceNaming("goals", { cwd: withFile });
    expect(() => planResource(withFile, naming2, { ...context("goals"), naming: naming2 })).toThrow(/--force/);
  });
});
