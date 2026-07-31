import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";

const CACHE_PATH = path.join(os.tmpdir(), "katax-cli-version-check-cache.json");

describe("version-check", () => {
  beforeEach(async () => {
    await fs.remove(CACHE_PATH);
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await fs.remove(CACHE_PATH);
  });

  it("detects a newer patch/minor/major version is available", async () => {
    const { checkForUpdates } = await import("../src/utils/version-check.js");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const version = url.includes("katax-core") ? "1.7.0" : "0.5.8";
        return {
          ok: true,
          json: async () => ({ version }),
        } as Response;
      }),
    );

    const results = await checkForUpdates([
      { name: "katax-core", current: "^1.6.5" },
      { name: "katax-service-manager", current: "^0.5.8" },
    ]);

    const core = results.find((r) => r.name === "katax-core")!;
    const svc = results.find((r) => r.name === "katax-service-manager")!;

    expect(core.hasUpdate).toBe(true);
    expect(core.latest).toBe("1.7.0");
    expect(svc.hasUpdate).toBe(false);
  });

  it("does not throw and reports latest: null when the registry is unreachable", async () => {
    const { checkForUpdates } = await import("../src/utils/version-check.js");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const results = await checkForUpdates([{ name: "katax-core", current: "^1.6.5" }]);

    expect(results[0].latest).toBeNull();
    expect(results[0].hasUpdate).toBe(false);
  });

  it("caches the registry response instead of refetching on every call", async () => {
    const { checkForUpdates } = await import("../src/utils/version-check.js");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: "9.9.9" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await checkForUpdates([{ name: "katax-core", current: "^1.6.5" }]);
    await checkForUpdates([{ name: "katax-core", current: "^1.6.5" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
