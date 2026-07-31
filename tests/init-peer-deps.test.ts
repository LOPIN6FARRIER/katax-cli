import { describe, expect, it } from "vitest";
import { __initTestUtils } from "../src/commands/init.ts";

describe("init peer dependency resolver", () => {
  it("returns empty when katax-service-manager is disabled", () => {
    const deps = __initTestUtils.resolvePeerDependencies({
      useKataxServiceManager: false,
      peerDependenciesMode: "all",
    } as any);

    expect(deps).toEqual([]);
  });

  it("returns selected feature peers only in selected mode", () => {
    const deps = __initTestUtils.resolvePeerDependencies({
      useKataxServiceManager: true,
      peerDependenciesMode: "selected",
      useRedis: true,
      useWebSocket: true,
    } as any);

    expect(deps.sort()).toEqual(["redis", "socket.io"]);
  });

  it("returns all peers in all mode", () => {
    const deps = __initTestUtils.resolvePeerDependencies({
      useKataxServiceManager: true,
      peerDependenciesMode: "all",
    } as any);

    expect(deps).toEqual([...__initTestUtils.KATAX_SERVICE_MANAGER_PEERS]);
    expect(deps.length).toBeGreaterThan(5);
  });
});

describe("init package manager helpers", () => {
  it("defaults to pnpm unless npm is explicitly selected", () => {
    expect(__initTestUtils.getPackageManager(undefined)).toBe("pnpm");
    expect(__initTestUtils.getPackageManager("npm")).toBe("npm");
    expect(__initTestUtils.getPackageManager("pnpm")).toBe("pnpm");
  });

  it("builds install command for npm with ignore scripts", () => {
    const command = __initTestUtils.getInstallCommand("npm", ["redis"], true);

    expect(command).toEqual({
      cmd: "npm",
      args: ["install", "redis", "--ignore-scripts"],
    });
  });

  it("builds install command for pnpm add/install", () => {
    const baseInstall = __initTestUtils.getInstallCommand("pnpm", [], false);
    const addDeps = __initTestUtils.getInstallCommand(
      "pnpm",
      ["redis", "socket.io"],
      true,
    );

    expect(baseInstall).toEqual({ cmd: "pnpm", args: ["install"] });
    expect(addDeps).toEqual({
      cmd: "pnpm",
      args: ["add", "redis", "socket.io", "--ignore-scripts"],
    });
  });
});

describe("init project name validation (audit regression)", () => {
  it("accepts letters, numbers, hyphens and underscores", () => {
    expect(__initTestUtils.isValidProjectName("my-api")).toBe(true);
    expect(__initTestUtils.isValidProjectName("my_api_2")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(__initTestUtils.isValidProjectName("../../../tmp/pwn")).toBe(false);
    expect(__initTestUtils.isValidProjectName("../pwn")).toBe(false);
  });

  it("rejects absolute paths and separators", () => {
    expect(__initTestUtils.isValidProjectName("/etc/pwn")).toBe(false);
    expect(__initTestUtils.isValidProjectName("a/b")).toBe(false);
  });

  it("rejects empty strings and names with spaces", () => {
    expect(__initTestUtils.isValidProjectName("")).toBe(false);
    expect(__initTestUtils.isValidProjectName("my api")).toBe(false);
  });
});

describe("pinned katax-core/katax-service-manager versions (audit regression)", () => {
  it("does not use an unpinned 'latest' version", () => {
    expect(__initTestUtils.KATAX_CORE_VERSION).not.toBe("latest");
    expect(__initTestUtils.KATAX_SERVICE_MANAGER_VERSION).not.toBe("latest");
  });

  it("pins to a concrete semver range", () => {
    expect(__initTestUtils.KATAX_CORE_VERSION).toMatch(/^\^?\d+\.\d+\.\d+$/);
    expect(__initTestUtils.KATAX_SERVICE_MANAGER_VERSION).toMatch(/^\^?\d+\.\d+\.\d+$/);
  });
});
