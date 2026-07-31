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

  it("rejects path traversal attempts (audit regression)", () => {
    expect(() =>
      __endpointTestUtils.resolveResourceNaming("../../../../etc/foo"),
    ).toThrow(/only contain letters, numbers/);
    expect(() =>
      __endpointTestUtils.resolveResourceNaming("admin/../../etc"),
    ).toThrow(/only contain letters, numbers/);
  });

  it("rejects empty and whitespace-only names", () => {
    expect(() => __endpointTestUtils.resolveResourceNaming("")).toThrow(
      /Endpoint name is required/,
    );
    expect(() => __endpointTestUtils.resolveResourceNaming("   ")).toThrow(
      /Endpoint name is required/,
    );
  });

  it("rejects segments with spaces or special characters", () => {
    expect(() =>
      __endpointTestUtils.resolveResourceNaming("admin users"),
    ).toThrow(/only contain letters, numbers/);
    expect(() =>
      __endpointTestUtils.resolveResourceNaming("admin/$(rm -rf)"),
    ).toThrow(/only contain letters, numbers/);
  });

  it("keeps the resolved basePath inside the project's src/api directory", () => {
    const resource = __endpointTestUtils.resolveResourceNaming("admin/users");
    expect(resource.basePath.startsWith(process.cwd())).toBe(true);
  });
});
