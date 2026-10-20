import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  detectPackageManager,
  findPm2AppForDir,
  installArgs,
  isValidGitRepoUrl,
  parseCommitCount,
  parseEnvFile,
  productionDefault,
  readEcosystemAppName,
  renderDeployEcosystem,
} from "../src/commands/deploy.ts";
import { renderEcosystem } from "../src/generators/project/scaffold.ts";

function tempDir(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "katax-deploy-"));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

describe("katax deploy helpers", () => {
  it("rejects option-like and non-git URLs", () => {
    expect(isValidGitRepoUrl("git@github.com:me/api.git")).toBe(true);
    expect(isValidGitRepoUrl("https://github.com/me/api.git")).toBe(true);
    expect(isValidGitRepoUrl("--upload-pack=touch /tmp/x")).toBe(false);
    expect(isValidGitRepoUrl("/srv/repo")).toBe(false);
  });

  it("uses the lockfile's package manager and installs devDependencies to build", () => {
    expect(detectPackageManager(tempDir({ "pnpm-lock.yaml": "" }))).toBe("pnpm");
    expect(detectPackageManager(tempDir({ "yarn.lock": "" }))).toBe("yarn");
    const npmDir = tempDir({ "package-lock.json": "{}" });
    expect(detectPackageManager(npmDir)).toBe("npm");
    expect(installArgs("npm", npmDir)).toEqual(["ci", "--include=dev"]);
    expect(installArgs("npm", tempDir())).toEqual(["install", "--include=dev"]);
    expect(installArgs("pnpm", tempDir())).toContain("--prod=false");
  });

  it("reads the app name from the repo's ecosystem file (the one katax init writes)", () => {
    const ecosystem = renderEcosystem({ name: "my-api", useWebSocket: false } as never);
    expect(readEcosystemAppName(ecosystem)).toBe("my-api");
    expect(readEcosystemAppName("module.exports = { apps: [] }")).toBeNull();
  });

  it("generated ecosystem: fork for 1 instance, cluster only when asked", () => {
    const one = renderDeployEcosystem("api", 1, "512M");
    expect(one).toContain("exec_mode: 'fork'");
    expect(one).toContain("instances: 1,");
    expect(renderDeployEcosystem("api", 2, "1G")).toContain("exec_mode: 'cluster'");
  });

  it(".env from .env.example: production mode, random secrets, values kept", () => {
    const entries = parseEnvFile("# c\nNODE_ENV=development\nPORT=3000\n\nJWT_SECRET=change-me\nDB_HOST=\"localhost\"\nbad line\n");
    expect(entries.map((e) => e.key)).toEqual(["NODE_ENV", "PORT", "JWT_SECRET", "DB_HOST"]);
    expect(entries[3]!.value).toBe("localhost");
    expect(productionDefault(entries[0]!)).toBe("production");
    expect(productionDefault(entries[1]!)).toBe("3000");
    expect(productionDefault(entries[2]!)).toMatch(/^[0-9a-f]{128}$/);
    expect(productionDefault({ key: "JWT_SECRET", value: "already-set" })).toBe("already-set");
  });

  it("finds the PM2 app by exact folder, never by prefix", () => {
    const procs = [
      { name: "api-v2", pm2_env: { pm_cwd: "/apps/api-v2", pm_exec_path: "/apps/api-v2/dist/index.js" } },
      { name: "api", pm2_env: { pm_cwd: "/somewhere", pm_exec_path: "/apps/api/dist/index.js" } },
    ];
    expect(findPm2AppForDir(procs, "/apps/api")).toBe("api");
    expect(findPm2AppForDir(procs, "/apps/api-v2")).toBe("api-v2");
    expect(findPm2AppForDir(procs, "/apps")).toBeNull();
  });

  it("validates rollback commit counts", () => {
    expect(parseCommitCount(undefined)).toBe(1);
    expect(parseCommitCount("3")).toBe(3);
    expect(() => parseCommitCount("abc")).toThrow();
    expect(() => parseCommitCount("0")).toThrow();
  });
});
