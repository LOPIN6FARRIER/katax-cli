import { describe, expect, it } from "vitest";
import { __crudTestUtils } from "../src/commands/generate-crud.ts";

describe("generate-crud nested resources", () => {
  it("resolves nested naming correctly", () => {
    const resource = __crudTestUtils.resolveResourceNaming("admin/users");

    expect(resource.segments).toEqual(["admin", "users"]);
    expect(resource.lowerName).toBe("users");
    expect(resource.routePath).toBe("admin/users");
  });

  it("generates shared and middleware imports with correct depth", () => {
    const resource = __crudTestUtils.resolveResourceNaming("admin/users");

    expect(__crudTestUtils.getSharedImportPath(resource)).toBe(
      "../../../shared/api.utils.js",
    );
    expect(__crudTestUtils.getMiddlewareImportPath(resource)).toBe(
      "../../../middleware/rate-limit.middleware.js",
    );
  });

  it("uses generated filename for validator imports and nested route docs", () => {
    const resource = __crudTestUtils.resolveResourceNaming("admin/users");

    const controller = __crudTestUtils.generateController(
      resource.pascalName,
      resource.camelName,
      resource.lowerName,
      ["GET", "POST"],
      [{ name: "name", type: "string", required: true, rules: [] }],
      resource,
    );

    const routes = __crudTestUtils.generateRoutes(
      resource.pascalName,
      resource.camelName,
      resource.lowerName,
      resource.routePath,
      ["GET", "POST"],
      true,
      true,
      resource,
    );

    expect(controller).toContain("from './users.validator.js';");
    expect(routes).toContain("@route GET /api/admin/users");
    expect(routes).toContain("@route GET /api/admin/users/:id");
    expect(routes).toContain(
      "from '../../../middleware/rate-limit.middleware.js';",
    );
  });
});
