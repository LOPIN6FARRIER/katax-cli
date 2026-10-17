import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  renderApp,
  renderEnv,
  renderIndex,
  renderPackageJson,
  renderRoutes,
  scaffoldProject,
  staticFiles,
} from "../src/generators/project/scaffold.ts";
import { getTemplatesDir } from "../src/utils/file-utils.ts";
import { isValidProjectName } from "../src/commands/init.ts";
import type { ProjectConfig } from "../src/types/index.ts";

const base: ProjectConfig = {
  name: "my-api",
  description: "Test API",
  port: 3000,
  database: "postgresql",
  dbConfig: { host: "localhost", port: "5432", user: "postgres", password: "secret", database: "my_api" },
  useRedis: false,
  authentication: "jwt",
  useWebSocket: false,
  useSeparateSocketPort: false,
  socketPort: 3001,
  useRegistry: false,
  registryMode: "none",
  useLifecycleHooks: false,
  listRoutes: true,
  packageManager: "pnpm",
  ignoreInstallScripts: false,
  createNpmrcForIgnoreScripts: false,
  initGit: false,
};

describe("katax init scaffold", () => {
  it("every static template exists", () => {
    const all = staticFiles({ ...base, useRedis: true });
    for (const file of all) {
      expect(fs.existsSync(path.join(getTemplatesDir(), "project", "src", file)), file).toBe(true);
    }
  });

  it("pins current katax versions and bcryptjs 3, only the needed peers", () => {
    const pkg = JSON.parse(renderPackageJson(base));
    expect(pkg.dependencies["katax-core"]).toBe("^1.6.6");
    expect(pkg.dependencies["katax-service-manager"]).toBe("^0.6.1");
    expect(pkg.dependencies.bcryptjs).toMatch(/^\^3/);
    expect(pkg.dependencies.pg).toBeDefined();
    expect(pkg.dependencies["swagger-ui-express"]).toBeDefined();
    expect(pkg.dependencies.redis).toBeUndefined();
    expect(pkg.dependencies.ioredis).toBeUndefined();

    const none = JSON.parse(renderPackageJson({ ...base, database: "none", authentication: "none", useRedis: true }));
    expect(none.dependencies.pg).toBeUndefined();
    expect(none.dependencies.jsonwebtoken).toBeUndefined();
    expect(none.dependencies.redis).toBeDefined();
  });

  it(".env has real secrets, .env.example only placeholders", () => {
    const real = renderEnv(base, true);
    const example = renderEnv(base, false);
    expect(real).toMatch(/JWT_SECRET=[0-9a-f]{128}/);
    expect(real).toContain("DB_PASSWORD=secret");
    expect(example).toContain("JWT_SECRET=change-me");
    expect(example).toContain("DB_PASSWORD=your_password");
    expect(example).not.toContain("secret\n");
  });

  it("index.ts loads .env first, connects what was chosen and prints the route map", () => {
    const index = renderIndex(base);
    expect(index.split("\n").find((l) => l.startsWith("import"))).toBe("import 'dotenv/config';");
    expect(index).toContain("type: 'postgresql'");
    expect(index).not.toContain("type: 'redis'");
    expect(index).toContain("printStartupRoutes(app, 'my-api'");
    expect(renderIndex({ ...base, listRoutes: false })).not.toContain("printStartupRoutes");

    const ws = renderIndex({ ...base, useWebSocket: true, useRedis: true });
    expect(ws).toContain("createServer(app)");
    expect(ws).toContain("katax.socket({ name: 'main', httpServer })");
    expect(ws).toContain("type: 'redis'");

    const separate = renderIndex({ ...base, useWebSocket: true, useSeparateSocketPort: true, socketPort: 3101 });
    expect(separate).toContain("katax.socket({ name: 'main', port: 3101 })");
    expect(separate).not.toContain("createServer");

    const hooks = renderIndex({ ...base, useRegistry: true, registryMode: "url", useLifecycleHooks: true });
    expect(hooks).toMatch(/prettyPrint: katax\.isDev\n {6}\},\n {6}registry: \{/);
    expect(hooks).toMatch(/\n {6}\},\n {6}hooks: \{/);
  });

  it("app.ts mounts docs, the API router, 404 and the error middleware in order", () => {
    const app = renderApp(base);
    const order = ["import './shared/async-errors.js';", "mountApiDocs(app", "app.use('/api', router);", "notFoundHandler", "app.use(errorMiddleware);"];
    const positions = order.map((s) => app.lastIndexOf(s));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(app).toContain("app.set('trust proxy', 1);");
  });

  it("routes.ts: requireAuth only with JWT", () => {
    expect(renderRoutes(base)).toContain("router.use(requireAuth);");
    expect(renderRoutes({ ...base, authentication: "none" })).not.toContain("requireAuth");
  });

  it("no swagger file generation, no hello example, no database/connection.ts", () => {
    const files = scaffoldProject("/p", base).files.map((f) => f.path);
    expect(files.some((f) => /openapi\.json|swagger|hello|connection\.ts/.test(f))).toBe(false);
  });

  it("validates project names", () => {
    expect(isValidProjectName("my-api_2")).toBe(true);
    expect(isValidProjectName("../x")).toBe(false);
    expect(isValidProjectName("a b")).toBe(false);
  });
});
