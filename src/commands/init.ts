import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import ora from "ora";
import { execa } from "execa";
import { error, gray, info, success, title } from "../utils/logger.js";
import { directoryExists, writeFile } from "../utils/file-utils.js";
import { checkForUpdates, cliVersion, printUpdateNotices } from "../utils/version-check.js";
import type { ProjectConfig } from "../types/index.js";
import {
  KATAX_CORE_VERSION,
  KATAX_SERVICE_MANAGER_VERSION,
  scaffoldProject,
} from "../generators/project/scaffold.js";

interface InitOptions {
  force?: boolean;
  pm?: "npm" | "pnpm";
  ignoreScripts?: boolean;
  writeNpmrc?: boolean;
  /** commander sets false with --no-install */
  install?: boolean;
}

type PackageManager = "npm" | "pnpm";

function getPackageManager(pm?: string): PackageManager {
  return pm === "npm" ? "npm" : "pnpm";
}

export function getInstallCommand(
  packageManager: PackageManager,
  ignoreScripts = false,
): { cmd: PackageManager; args: string[] } {
  return { cmd: packageManager, args: ["install", ...(ignoreScripts ? ["--ignore-scripts"] : [])] };
}

export function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-_]+$/i.test(name);
}

const portValidator = (input: string): true | string => {
  const port = parseInt(input, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? true : "Port must be a number between 1 and 65535";
};

export async function initCommand(projectName?: string, options: InitOptions = {}): Promise<void> {
  title("🚀 Katax CLI - Initialize API Project");

  let name = projectName ?? "";
  if (!name) {
    const answer = await inquirer.prompt<{ projectName: string }>([
      {
        type: "input",
        name: "projectName",
        message: "Project name:",
        default: "my-api",
        validate: (input: string) =>
          isValidProjectName(input) || "Project name can only contain letters, numbers, hyphens, and underscores",
      },
    ]);
    name = answer.projectName;
  }

  // Also validates names passed as an argument (`katax init ../../x` must not escape the cwd).
  if (!isValidProjectName(name)) {
    error(`Invalid project name "${name}": only letters, numbers, hyphens, and underscores are allowed.`);
    process.exit(1);
  }

  const projectPath = path.join(process.cwd(), name);
  if (directoryExists(projectPath) && !options.force) {
    error(`Directory "${name}" already exists!`);
    gray("Use --force to overwrite\n");
    process.exit(1);
  }

  const answers = await inquirer.prompt([
    { type: "input", name: "description", message: "Project description:", default: "REST API built with Express and TypeScript" },
    {
      type: "list",
      name: "database",
      message: "Database:",
      choices: [
        { name: "PostgreSQL", value: "postgresql" },
        { name: "None", value: "none" },
      ],
      default: "postgresql",
    },
    { type: "confirm", name: "useRedis", message: "Add Redis (cache, log streams)?", default: false },
    {
      type: "list",
      name: "authentication",
      message: "Authentication:",
      choices: [
        { name: "JWT (requireAuth middleware, private routes)", value: "jwt" },
        { name: "None (public API)", value: "none" },
      ],
      default: "jwt",
    },
    { type: "confirm", name: "useWebSocket", message: "Add WebSocket (Socket.IO)?", default: false },
    {
      type: "confirm",
      name: "useSeparateSocketPort",
      message: "Separate port for WebSocket? (No = same port as Express)",
      default: false,
      when: (a: { useWebSocket?: boolean }) => Boolean(a.useWebSocket),
    },
    {
      type: "input",
      name: "socketPort",
      message: "WebSocket port:",
      default: "3001",
      when: (a: { useSeparateSocketPort?: boolean }) => Boolean(a.useSeparateSocketPort),
      validate: portValidator,
    },
    { type: "confirm", name: "useRegistry", message: "Register in a Katax service registry?", default: false },
    {
      type: "list",
      name: "registryMode",
      message: "Registry integration:",
      choices: [
        { name: "HTTP URL registry", value: "url" },
        { name: "Callback handler (custom)", value: "handler" },
      ],
      default: "url",
      when: (a: { useRegistry?: boolean }) => Boolean(a.useRegistry),
    },
    {
      type: "input",
      name: "registryUrl",
      message: "Registry URL:",
      default: "http://localhost:4000/api/services",
      when: (a: { useRegistry?: boolean; registryMode?: string }) => Boolean(a.useRegistry) && a.registryMode === "url",
    },
    { type: "confirm", name: "useLifecycleHooks", message: "Add katax lifecycle hooks scaffold?", default: false },
    { type: "confirm", name: "listRoutes", message: "Print the endpoint map when the server starts?", default: true },
    { type: "input", name: "port", message: "Server port:", default: "3000", validate: portValidator },
    { type: "confirm", name: "initGit", message: "Initialize a git repository?", default: true },
    {
      type: "list",
      name: "packageManager",
      message: "Package manager:",
      choices: [
        { name: "pnpm", value: "pnpm" },
        { name: "npm", value: "npm" },
      ],
      default: getPackageManager(options.pm),
    },
    {
      type: "confirm",
      name: "ignoreScripts",
      message: "Install dependencies with --ignore-scripts?",
      default: options.ignoreScripts ?? false,
    },
    {
      type: "confirm",
      name: "writeNpmrc",
      message: "Create .npmrc with ignore-scripts=true?",
      default: options.writeNpmrc ?? true,
      when: (a: { ignoreScripts?: boolean }) => Boolean(a.ignoreScripts),
    },
  ]);

  let dbConfig: ProjectConfig["dbConfig"];
  if (answers.database === "postgresql") {
    dbConfig = await inquirer.prompt([
      { type: "input", name: "host", message: "PostgreSQL host:", default: "localhost" },
      { type: "input", name: "port", message: "PostgreSQL port:", default: "5432" },
      { type: "input", name: "user", message: "Database user:", default: "postgres" },
      { type: "password", name: "password", message: "Database password:", mask: "*" },
      { type: "input", name: "database", message: "Database name:", default: name.toLowerCase().replace(/-/g, "_") },
    ]);
  }

  let redisConfig: ProjectConfig["redisConfig"];
  if (answers.useRedis) {
    redisConfig = await inquirer.prompt([
      { type: "input", name: "host", message: "Redis host:", default: "localhost" },
      { type: "input", name: "port", message: "Redis port:", default: "6379" },
      { type: "password", name: "password", message: "Redis password (empty = none):", mask: "*" },
      { type: "input", name: "db", message: "Redis database number:", default: "0" },
    ]);
  }

  const config: ProjectConfig = {
    name,
    description: answers.description,
    port: parseInt(answers.port, 10),
    database: answers.database,
    dbConfig,
    useRedis: Boolean(answers.useRedis),
    redisConfig,
    authentication: answers.authentication,
    useWebSocket: Boolean(answers.useWebSocket),
    useSeparateSocketPort: Boolean(answers.useSeparateSocketPort),
    socketPort: answers.socketPort ? parseInt(answers.socketPort, 10) : 3001,
    useRegistry: Boolean(answers.useRegistry),
    registryMode: answers.useRegistry ? (answers.registryMode ?? "url") : "none",
    registryUrl: answers.registryUrl,
    useLifecycleHooks: Boolean(answers.useLifecycleHooks),
    listRoutes: Boolean(answers.listRoutes),
    packageManager: getPackageManager(answers.packageManager),
    ignoreInstallScripts: Boolean(answers.ignoreScripts),
    createNpmrcForIgnoreScripts: answers.ignoreScripts ? (answers.writeNpmrc ?? true) : false,
    initGit: Boolean(answers.initGit),
  };

  gray("\n📋 Project:");
  gray(`  Name: ${config.name}`);
  gray(`  Database: ${config.database}${config.useRedis ? " + Redis" : ""}`);
  gray(`  Auth: ${config.authentication}`);
  gray(
    `  WebSocket: ${config.useWebSocket ? (config.useSeparateSocketPort ? `port ${config.socketPort}` : "same port") : "no"}`,
  );
  gray(`  Registry: ${config.useRegistry ? config.registryMode : "no"}`);
  gray(`  Endpoint map at startup: ${config.listRoutes ? "yes" : "no"}`);
  gray(`  Port: ${config.port}\n`);

  const spinner = ora("Creating project...").start();
  try {
    const { files } = scaffoldProject(projectPath, config);
    for (const file of files) await writeFile(file.path, file.content);
    if (config.createNpmrcForIgnoreScripts) {
      await writeFile(path.join(projectPath, ".npmrc"), "# Generated by katax-cli\nignore-scripts=true\n");
    }
    spinner.succeed("Project created");

    if (options.install !== false) {
      spinner.start("Installing dependencies...");
      const install = getInstallCommand(config.packageManager, config.ignoreInstallScripts);
      await execa(install.cmd, install.args, { cwd: projectPath, stdio: "ignore" });
      spinner.succeed("Dependencies installed");
    }

    if (config.initGit) {
      spinner.start("Initializing git repository...");
      await execa("git", ["init"], { cwd: projectPath, stdio: "ignore" });
      await execa("git", ["add", "."], { cwd: projectPath, stdio: "ignore" });
      await execa("git", ["commit", "-m", "Initial commit - created with katax-cli"], { cwd: projectPath, stdio: "ignore" });
      spinner.succeed("Git repository initialized");
    }

    success(`\n✨ Project "${name}" created\n`);
    info("Next steps:");
    gray(`  cd ${name}`);
    if (options.install === false) gray(`  ${config.packageManager} install`);
    gray(`  ${config.packageManager === "pnpm" ? "pnpm dev" : "npm run dev"}`);
    gray(`  katax add endpoint <resource> --fields "name:string, note:text?"\n`);
    info(`Docs: http://localhost:${config.port}/docs (OpenAPI 3.1 built from your validators)`);
    if (fs.existsSync(path.join(projectPath, ".env"))) {
      gray("  .env has real values (JWT secrets generated); .env.example has placeholders and is the one to commit.\n");
    }

    await checkAndNotifyUpdates();
  } catch (err) {
    spinner.fail("Failed to create project");
    error(err instanceof Error ? err.message : "Unknown error");
    process.exit(1);
  }
}

/** Non-blocking, cached check for newer katax releases. Never throws. */
async function checkAndNotifyUpdates(): Promise<void> {
  try {
    const results = await checkForUpdates([
      { name: "katax-cli", current: cliVersion() },
      { name: "katax-core", current: KATAX_CORE_VERSION },
      { name: "katax-service-manager", current: KATAX_SERVICE_MANAGER_VERSION },
    ]);
    printUpdateNotices(results);
  } catch {
    // A version check must never fail project creation.
  }
}
