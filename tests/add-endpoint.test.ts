import { describe, expect, it } from "vitest";
import { __endpointTestUtils } from "../src/commands/add-endpoint.ts";

describe("add-endpoint nested resources", () => {
  it("resolves nested naming correctly", () => {
    const resource =
      __endpointTestUtils.resolveResourceNaming("admin/audit/logs");

    expect(resource.segments).toEqual(["admin", "audit", "logs"]);
    expect(resource.lowerName).toBe("logs");
    expect(resource.routePath).toBe("admin/audit/logs");
  });

  it("builds correct shared import depth", () => {
    const resource =
      __endpointTestUtils.resolveResourceNaming("admin/audit/logs");
    expect(__endpointTestUtils.getSharedImportPath(resource)).toBe(
      "../../../../shared/api.utils.js",
    );
  });

  it("uses lowerName validator file and nested route comments", () => {
    const resource = __endpointTestUtils.resolveResourceNaming("admin/users");

    const controller = __endpointTestUtils.generateController(
      resource.pascalName,
      resource.camelName,
      resource.lowerName,
      ["GET", "PATCH"],
      [{ name: "name", type: "string", required: true, rules: [] }],
      resource,
    );

    const routes = __endpointTestUtils.generateRoutes(
      resource.pascalName,
      resource.camelName,
      resource.lowerName,
      resource.routePath,
      ["GET", "PATCH"],
      true,
      resource,
    );

    expect(controller).toContain("from './users.validator.js';");
    expect(routes).toContain("@route GET /api/admin/users");
    expect(routes).toContain("@route PATCH /api/admin/users/:id");
  });
});
