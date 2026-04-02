import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import crypto from "crypto";
import { execa } from "execa";
import { success, error, warning, gray, title, info } from "../utils/logger.js";
import {
  directoryExists,
  ensureDir,
  writeFile,
  copyTemplate,
} from "../utils/file-utils.js";
import { ProjectConfig } from "../types/index.js";
import { generateSwaggerSetup } from "../templates/generators/swagger-template.js";
import { generateStreamUtils } from "../templates/generators/stream-utils-template.js";
import { generateAuthUtils } from "../templates/generators/auth-utils-template.js";

interface InitOptions {
  force?: boolean;
}

export async function initCommand(
  projectName?: string,
  options: InitOptions = {},
) {
  title("🚀 Katax CLI - Initialize API Project");

  // Determine project name
  let finalProjectName: string = projectName || "";
  if (!finalProjectName) {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "projectName",
        message: "Project name:",
        default: "my-api",
        validate: (input) => {
          if (!/^[a-z0-9-_]+$/i.test(input)) {
            return "Project name can only contain letters, numbers, hyphens, and underscores";
          }
          return true;
        },
      },
    ]);
    finalProjectName = answer.projectName;
  }

  const projectPath = path.join(process.cwd(), finalProjectName);

  // Check if directory exists
  if (directoryExists(projectPath) && !options.force) {
    error(`Directory "${finalProjectName}" already exists!`);
    gray("Use --force to overwrite\n");
    process.exit(1);
  }

  // Interactive configuration
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "description",
      message: "Project description:",
      default: "REST API built with Express and TypeScript",
    },
    {
      type: "list",
      name: "database",
      message: "Select database:",
      choices: [
        { name: "PostgreSQL", value: "postgresql" },
        { name: "MySQL", value: "mysql" },
        { name: "MongoDB", value: "mongodb" },
        { name: "None (no database)", value: "none" },
      ],
      default: "postgresql",
    },
    {
      type: "list",
      name: "authentication",
      message: "Add authentication?",
      choices: [
        { name: "JWT Authentication", value: "jwt" },
        { name: "None", value: "none" },
      ],
      default: "jwt",
    },
    {
      type: "confirm",
      name: "validation",
      message: "Use katax-core for validation?",
      default: true,
    },
    {
      type: "confirm",
      name: "swagger",
      message: "Install Swagger/OpenAPI documentation?",
      default: true,
    },
    {
      type: "confirm",
      name: "useKataxServiceManager",
      message:
        "Use katax-service-manager for services? (logger, database, etc.)",
      default: true,
    },
    {
      type: "list",
      name: "kataxMode",
      message: "Katax mode:",
      choices: [
        { name: "Singleton (shared katax instance)", value: "singleton" },
        { name: "Instance (new Katax())", value: "instance" },
      ],
      default: "singleton",
      when: (answers) => answers.useKataxServiceManager,
    },
    {
      type: "confirm",
      name: "useRegistry",
      message: "Enable Katax registry integration?",
      default: false,
      when: (answers) => answers.useKataxServiceManager,
    },
    {
      type: "list",
      name: "registryMode",
      message: "Registry integration mode:",
      choices: [
        { name: "HTTP URL registry", value: "url" },
        { name: "Callback handler (custom integration)", value: "handler" },
      ],
      default: "url",
      when: (answers) => answers.useKataxServiceManager && answers.useRegistry,
    },
    {
      type: "input",
      name: "registryUrl",
      message:
        "Registry URL (e.g. https://dashboard.example.com/api/services):",
      default: "http://localhost:4000/api/services",
      when: (answers) =>
        answers.useKataxServiceManager &&
        answers.useRegistry &&
        answers.registryMode === "url",
      validate: (input) => {
        if (!input?.trim()) {
          return "Registry URL is required";
        }
        return true;
      },
    },
    {
      type: "confirm",
      name: "useLifecycleHooks",
      message: "Generate Katax lifecycle hooks scaffold?",
      default: false,
      when: (answers) => answers.useKataxServiceManager,
    },
    {
      type: "confirm",
      name: "useRedis",
      message: "Add Redis cache support?",
      default: false,
      when: (answers) => answers.useKataxServiceManager,
    },
    {
      type: "confirm",
      name: "useWebSocket",
      message: "Add WebSocket support (Socket.IO)?",
      default: false,
      when: (answers) => answers.useKataxServiceManager,
    },
    {
      type: "confirm",
      name: "useSeparateSocketPort",
      message: "Use separate port for WebSocket? (No = share Express port)",
      default: false,
      when: (answers) => answers.useWebSocket,
    },
    {
      type: "input",
      name: "socketPort",
      message: "WebSocket port:",
      default: "3001",
      when: (answers) => answers.useWebSocket && answers.useSeparateSocketPort,
      validate: (input) => {
        const port = parseInt(input);
        if (isNaN(port) || port < 1 || port > 65535) {
          return "Port must be a number between 1 and 65535";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "port",
      message: "Server port:",
      default: "3000",
      validate: (input) => {
        const port = parseInt(input);
        if (isNaN(port) || port < 1 || port > 65535) {
          return "Port must be a number between 1 and 65535";
        }
        return true;
      },
    },
    {
      type: "confirm",
      name: "initGit",
      message: "Initialize git repository?",
      default: true,
    },
  ]);

  // Ask for database credentials if database is selected
  let dbConfig: any = {};
  if (answers.database !== "none") {
    const dbQuestions: any[] = [];

    if (answers.database === "postgresql" || answers.database === "mysql") {
      dbQuestions.push(
        {
          type: "input",
          name: "host",
          message: `${answers.database === "postgresql" ? "PostgreSQL" : "MySQL"} host:`,
          default: "localhost",
        },
        {
          type: "input",
          name: "port",
          message: `${answers.database === "postgresql" ? "PostgreSQL" : "MySQL"} port:`,
          default: answers.database === "postgresql" ? "5432" : "3306",
        },
        {
          type: "input",
          name: "user",
          message: "Database user:",
          default: "postgres",
        },
        {
          type: "password",
          name: "password",
          message: "Database password:",
          default: "password",
        },
        {
          type: "input",
          name: "database",
          message: "Database name:",
          default: finalProjectName.toLowerCase().replace(/-/g, "_"),
        },
      );
    } else if (answers.database === "mongodb") {
      dbQuestions.push(
        {
          type: "input",
          name: "host",
          message: "MongoDB host:",
          default: "localhost",
        },
        {
          type: "input",
          name: "port",
          message: "MongoDB port:",
          default: "27017",
        },
        {
          type: "input",
          name: "database",
          message: "Database name:",
          default: finalProjectName.toLowerCase().replace(/-/g, "_"),
        },
        {
          type: "confirm",
          name: "useAuth",
          message: "Use authentication?",
          default: false,
        },
      );
    }

    dbConfig = await inquirer.prompt(dbQuestions);

    // Ask for MongoDB credentials if authentication is enabled
    if (answers.database === "mongodb" && dbConfig.useAuth) {
      const authConfig = await inquirer.prompt([
        {
          type: "input",
          name: "user",
          message: "MongoDB user:",
          default: "admin",
        },
        {
          type: "password",
          name: "password",
          message: "MongoDB password:",
          default: "password",
        },
      ]);
      dbConfig.user = authConfig.user;
      dbConfig.password = authConfig.password;
    }
  }

  // Ask for Redis configuration if Redis is selected
  let redisConfig: any = {};
  if (answers.useRedis) {
    redisConfig = await inquirer.prompt([
      {
        type: "input",
        name: "host",
        message: "Redis host:",
        default: "localhost",
      },
      {
        type: "input",
        name: "port",
        message: "Redis port:",
        default: "6379",
      },
      {
        type: "password",
        name: "password",
        message: "Redis password (leave empty for no password):",
        default: "",
      },
      {
        type: "input",
        name: "db",
        message: "Redis database number:",
        default: "0",
      },
    ]);
  }

  const config: ProjectConfig = {
    name: finalProjectName,
    description: answers.description,
    type: "rest-api",
    typescript: true,
    database: answers.database,
    authentication: answers.authentication,
    validation: answers.validation ? "katax-core" : "none",
    swagger: answers.swagger,
    orm: "none",
    port: parseInt(answers.port),
    useKataxServiceManager: answers.useKataxServiceManager,
    kataxMode: answers.kataxMode || "singleton",
    useRedis: answers.useRedis || false,
    useWebSocket: answers.useWebSocket || false,
    useSeparateSocketPort: answers.useSeparateSocketPort || false,
    socketPort: answers.socketPort ? parseInt(answers.socketPort) : 3001,
    useRegistry: answers.useRegistry || false,
    registryMode: answers.useRegistry ? answers.registryMode || "url" : "none",
    registryUrl: answers.registryUrl,
    useLifecycleHooks: answers.useLifecycleHooks || false,
    initGit: answers.initGit,
    redisConfig,
    dbConfig,
  };

  // Ask for JWT secret generation if JWT is enabled
  let generateJwtSecrets = false;
  if (config.authentication === "jwt") {
    const jwtAnswer = await inquirer.prompt([
      {
        type: "confirm",
        name: "generate",
        message: "Generate JWT secrets automatically?",
        default: true,
      },
    ]);
    generateJwtSecrets = jwtAnswer.generate;
  }

  // Display configuration
  gray("\n📋 Project Configuration:");
  gray(`  Name: ${config.name}`);
  gray(`  Database: ${config.database}`);
  gray(`  Auth: ${config.authentication}`);
  gray(`  Validation: ${config.validation}`);
  gray(`  Swagger: ${config.swagger ? "Yes" : "No"}`);
  gray(
    `  Service Manager: ${config.useKataxServiceManager ? "katax-service-manager" : "manual"}`,
  );
  if (config.useKataxServiceManager) {
    gray(
      `  Katax Mode: ${config.kataxMode === "instance" ? "Instance (new Katax())" : "Singleton"}`,
    );
    gray(
      `  Registry: ${config.useRegistry ? (config.registryMode === "url" ? `URL (${config.registryUrl})` : "Callback handler") : "No"}`,
    );
    gray(`  Lifecycle Hooks: ${config.useLifecycleHooks ? "Yes" : "No"}`);
    gray(`  Redis Cache: ${config.useRedis ? "Yes" : "No"}`);
    gray(
      `  WebSocket: ${config.useWebSocket ? (config.useSeparateSocketPort ? `Yes (port ${config.socketPort})` : "Yes (shared port)") : "No"}`,
    );
  }
  gray(`  Git: ${config.initGit ? "Yes" : "No"}`);
  gray(`  Port: ${config.port}\n`);

  const spinner = ora("Creating project structure...").start();

  try {
    // Create project structure
    await createProjectStructure(projectPath, config, generateJwtSecrets);
    spinner.succeed("Project structure created");

    // Install dependencies
    spinner.start("Installing dependencies...");
    await installDependencies(projectPath);
    spinner.succeed("Dependencies installed");

    // Initialize git repository if requested
    if (config.initGit) {
      spinner.start("Initializing git repository...");
      await initGitRepository(projectPath);
      spinner.succeed("Git repository initialized");
    }

    success(`\n✨ Project "${finalProjectName}" created successfully!\n`);

    info("Next steps:");
    gray(`  cd ${finalProjectName}`);
    gray(`  npm run dev\n`);

    info("Available commands:");
    gray(`  katax add endpoint <name>    - Add a new endpoint`);
    gray(`  katax generate crud <name>   - Generate CRUD resource`);
    gray(`  katax info                   - Show project structure\n`);

    if (config.swagger) {
      info("📖 API Documentation:");
      gray(
        `  Open http://localhost:${config.port}/docs after starting the server`,
      );
      gray(`  Swagger UI is pre-configured and ready to use!\n`);
    }
  } catch (err) {
    spinner.fail("Failed to create project");
    error(err instanceof Error ? err.message : "Unknown error");
    process.exit(1);
  }
}

async function installDependencies(projectPath: string): Promise<void> {
  await execa("npm", ["install"], {
    cwd: projectPath,
    stdio: "ignore",
  });
}

async function initGitRepository(projectPath: string): Promise<void> {
  // Initialize git repository
  await execa("git", ["init"], {
    cwd: projectPath,
    stdio: "ignore",
  });

  // Add all files
  await execa("git", ["add", "."], {
    cwd: projectPath,
    stdio: "ignore",
  });

  // Create initial commit
  await execa(
    "git",
    ["commit", "-m", "Initial commit - Project created with Katax CLI"],
    {
      cwd: projectPath,
      stdio: "ignore",
    },
  );
}

async function createDatabaseConnection(
  projectPath: string,
  config: ProjectConfig,
): Promise<void> {
  const destPath = path.join(projectPath, "src/database/connection.ts");

  let content = "";

  if (config.database === "postgresql") {
    content = [
      "import { Pool } from 'pg';",
      "import dotenv from 'dotenv';",
      "dotenv.config();",
      "",
      "const pool = new Pool({",
      "  host: process.env.DB_HOST,",
      "  port: Number(process.env.DB_PORT),",
      "  database: process.env.DB_NAME,",
      "  user: process.env.DB_USER,",
      "  password: process.env.DB_PASSWORD,",
      "});",
      "",
      "pool.on('connect', () => {",
      "  console.log('✅ Connected to PostgreSQL database');",
      "});",
      "",
      "pool.on('error', (err: Error) => {",
      "  console.error('❌ PostgreSQL connection error:', err);",
      "  process.exit(-1);",
      "});",
      "",
      "export default pool;",
      "",
      "export async function query(text: string, params?: any[]) {",
      "  const start = Date.now();",
      "  const res = await pool.query(text, params);",
      "  const duration = Date.now() - start;",
      "  console.log('Executed query', { text, duration, rows: res.rowCount });",
      "  return res;",
      "}",
      "",
      "export async function getClient() {",
      "  const client = await pool.connect();",
      "  const originalQuery = client.query;",
      "  const originalRelease = client.release;",
      "  ",
      "  const timeout = setTimeout(() => {",
      "    console.error('A client has been checked out for more than 5 seconds!');",
      "  }, 5000);",
      "  ",
      "  // Override query method to add logging/monitoring",
      "  client.query = (originalQuery as any).bind(client);",
      "  ",
      "  client.release = () => {",
      "    clearTimeout(timeout);",
      "    client.query = originalQuery;",
      "    client.release = originalRelease;",
      "    return originalRelease.apply(client);",
      "  };",
      "  ",
      "  return client;",
      "}",
    ].join("\n");
  } else if (config.database === "mysql") {
    content = [
      "import mysql from 'mysql2/promise';",
      "",
      "const pool = mysql.createPool({",
      "  uri: process.env.DATABASE_URL,",
      "  waitForConnections: true,",
      "  connectionLimit: 10,",
      "  queueLimit: 0",
      "});",
      "",
      "export default pool;",
      "",
      "export async function query(sql: string, params?: any[]) {",
      "  const start = Date.now();",
      "  const [rows] = await pool.execute(sql, params);",
      "  const duration = Date.now() - start;",
      "  console.log('Executed query', { sql, duration, rows: Array.isArray(rows) ? rows.length : 0 });",
      "  return rows;",
      "}",
      "",
      "export async function getConnection() {",
      "  return await pool.getConnection();",
      "}",
    ].join("\n");
  } else if (config.database === "mongodb") {
    content = [
      "import { MongoClient, Db } from 'mongodb';",
      "",
      "let client: MongoClient;",
      "let db: Db;",
      "",
      "export async function connect(): Promise<Db> {",
      "  if (db) {",
      "    return db;",
      "  }",
      "",
      "  const uri = process.env.DATABASE_URL;",
      "  if (!uri) {",
      "    throw new Error('DATABASE_URL is not defined in environment variables');",
      "  }",
      "",
      "  client = new MongoClient(uri);",
      "  ",
      "  try {",
      "    await client.connect();",
      "    console.log('✅ Connected to MongoDB database');",
      "    ",
      "    const dbName = uri.split('/').pop()?.split('?')[0];",
      "    db = client.db(dbName);",
      "    ",
      "    return db;",
      "  } catch (error) {",
      "    console.error('❌ MongoDB connection error:', error);",
      "    throw error;",
      "  }",
      "}",
      "",
      "export async function disconnect(): Promise<void> {",
      "  if (client) {",
      "    await client.close();",
      "    console.log('Disconnected from MongoDB');",
      "  }",
      "}",
      "",
      "export function getDb(): Db {",
      "  if (!db) {",
      "    throw new Error('Database not initialized. Call connect() first.');",
      "  }",
      "  return db;",
      "}",
      "",
      "export default { connect, disconnect, getDb };",
    ].join("\n");
  }

  await writeFile(destPath, content);
}

async function createProjectStructure(
  projectPath: string,
  config: ProjectConfig,
  generateJwtSecrets: boolean,
): Promise<void> {
  // Create directories
  const dirs = [
    "src",
    "src/api",
    "src/config",
    "src/middleware",
    "src/shared",
    "src/types",
  ];

  if (config.database !== "none") {
    dirs.push("src/database");
  }

  // Add default hello endpoint
  dirs.push("src/api/hello");

  for (const dir of dirs) {
    await ensureDir(path.join(projectPath, dir));
  }

  // Create package.json
  const packageJson = {
    name: config.name,
    version: "1.0.0",
    description: config.description,
    type: "module",
    main: "dist/index.js",
    scripts: {
      dev: "nodemon --watch src --exec tsx src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
      lint: "eslint . --ext .ts",
      format: 'prettier --write "src/**/*.ts"',
    },
    keywords: ["api", "express", "typescript"],
    author: "",
    license: "MIT",
    dependencies: {
      express: "^4.18.2",
      cors: "^2.8.5",
      dotenv: "^16.3.1",
      ...(config.useKataxServiceManager
        ? { "katax-service-manager": "^0.3.3", "pino-pretty": "^10.3.1" }
        : { pino: "^8.17.2", "pino-pretty": "^10.3.1" }),
      ...(config.validation === "katax-core" && { "katax-core": "latest" }),
      ...(config.authentication === "jwt" && {
        jsonwebtoken: "^9.0.2",
        bcrypt: "^5.1.1",
      }),
      ...(config.swagger && { "swagger-ui-express": "^5.0.0" }),
      ...(config.database === "postgresql" && { pg: "^8.11.3" }),
      ...(config.database === "mysql" && { mysql2: "^3.6.5" }),
      ...(config.database === "mongodb" && { mongodb: "^6.3.0" }),
      ...(config.useRedis && { ioredis: "^5.3.2" }),
    },
    devDependencies: {
      "@types/express": "^4.17.21",
      "@types/cors": "^2.8.17",
      "@types/node": "^22.10.5",
      ...(config.authentication === "jwt" && {
        "@types/jsonwebtoken": "^9.0.5",
        "@types/bcrypt": "^5.0.2",
      }),
      ...(config.swagger && { "@types/swagger-ui-express": "^4.1.6" }),
      ...(config.database === "postgresql" && { "@types/pg": "^8.10.9" }),
      typescript: "^5.3.3",
      tsx: "^4.7.0",
      nodemon: "^3.0.2",
      eslint: "^8.56.0",
      "@typescript-eslint/eslint-plugin": "^6.19.0",
      "@typescript-eslint/parser": "^6.19.0",
      prettier: "^3.2.4",
    },
  };

  await writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );

  // Create tsconfig.json - ESM optimized for Linux/Ubuntu deployment
  const tsConfig = {
    compilerOptions: {
      // Target ES2022 - Compatible with Node.js 18+ (Ubuntu LTS)
      target: "ES2022",
      module: "ESNext",
      lib: ["ES2022"],

      // Use Node.js module resolution for VPS deployment
      moduleResolution: "node",

      // ES Module support (no require, pure import/export)
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,

      // Strict type checking
      strict: true,
      skipLibCheck: true,

      // Module options
      resolveJsonModule: true,

      // Emit options - Optimized for production
      sourceMap: true,
      removeComments: true,
      outDir: "./dist",
      rootDir: "./src",
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };

  await writeFile(
    path.join(projectPath, "tsconfig.json"),
    JSON.stringify(tsConfig, null, 2),
  );

  // Create .env.example and .env
  let databaseUrl = "";
  let dbEnvVars = "";
  if (config.database === "postgresql" && config.dbConfig) {
    const { host, port, user, password, database } = config.dbConfig;
    databaseUrl = `DATABASE_URL=postgresql://${user}:${password}@${host}:${port}/${database}`;
    dbEnvVars = `DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}
DB_USER=${user}
DB_PASSWORD=${password}`;
  } else if (config.database === "mysql" && config.dbConfig) {
    const { host, port, user, password, database } = config.dbConfig;
    databaseUrl = `DATABASE_URL=mysql://${user}:${password}@${host}:${port}/${database}`;
    dbEnvVars = `DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}
DB_USER=${user}
DB_PASSWORD=${password}`;
  } else if (config.database === "mongodb" && config.dbConfig) {
    const { host, port, database, user, password } = config.dbConfig;
    if (user && password) {
      databaseUrl = `DATABASE_URL=mongodb://${user}:${password}@${host}:${port}/${database}`;
      dbEnvVars = `DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}
DB_USER=${user}
DB_PASSWORD=${password}`;
    } else {
      databaseUrl = `DATABASE_URL=mongodb://${host}:${port}/${database}`;
      dbEnvVars = `DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}`;
    }
  }

  // Generate JWT secrets if needed
  let jwtConfig = "";
  if (config.authentication === "jwt") {
    if (generateJwtSecrets) {
      const jwtSecret = crypto.randomBytes(64).toString("hex");
      const jwtRefreshSecret = crypto.randomBytes(64).toString("hex");
      jwtConfig = `JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=${jwtRefreshSecret}
JWT_REFRESH_EXPIRES_IN=7d`;
    } else {
      jwtConfig = `JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_REFRESH_EXPIRES_IN=7d`;
    }
  }

  // Generate Redis config if needed
  let redisEnvVars = "";
  if (config.useRedis && config.redisConfig) {
    const { host, port, password, db } = config.redisConfig;
    redisEnvVars = `
# Redis Configuration
REDIS_HOST=${host || "localhost"}
REDIS_PORT=${port || "6379"}
REDIS_PASSWORD=${password || ""}
REDIS_DB=${db || "0"}`;
  }

  let registryEnvVars = "";
  if (
    config.useKataxServiceManager &&
    config.useRegistry &&
    config.registryMode === "url"
  ) {
    registryEnvVars = `
# Katax Registry Configuration
REGISTRY_URL=${config.registryUrl || "http://localhost:4000/api/services"}
REGISTRY_API_KEY=
REGISTRY_HEARTBEAT_MS=30000
REGISTRY_TIMEOUT_MS=5000
REGISTRY_RETRY_ATTEMPTS=2
REGISTRY_RETRY_BASE_DELAY_MS=300`;
  }

  const envContent = `# Server Configuration
PORT=${config.port}
NODE_ENV=development
LOG_LEVEL=info

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
${
  config.database !== "none"
    ? `
# Database Configuration
${databaseUrl}
${dbEnvVars ? "\n# DB connection variables for pool\n" + dbEnvVars : ""}`
    : ""
}
${redisEnvVars}
${registryEnvVars}
${config.authentication === "jwt" ? `\n# JWT Configuration\n${jwtConfig}` : ""}
`;

  await writeFile(path.join(projectPath, ".env.example"), envContent);
  await writeFile(path.join(projectPath, ".env"), envContent);

  // Create .gitignore
  const gitignoreContent = `node_modules/
dist/
.env
.DS_Store
*.log
coverage/
.vscode/
`;

  await writeFile(path.join(projectPath, ".gitignore"), gitignoreContent);

  // Create .gitattributes for consistent line endings across Windows/Linux
  const gitattributesContent = `# Auto normalize line endings to LF on checkout (critical for Ubuntu deployment)
* text=auto eol=lf

# Explicit file types
*.ts text eol=lf
*.js text eol=lf
*.json text eol=lf
*.md text eol=lf
*.yml text eol=lf
*.yaml text eol=lf

# Binaries
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
`;

  await writeFile(
    path.join(projectPath, ".gitattributes"),
    gitattributesContent,
  );

  // Create index.ts
  let indexContent: string;
  const kataxImportSourceRoot =
    config.useKataxServiceManager && config.kataxMode === "instance"
      ? "./config/katax.instance.js"
      : "katax-service-manager";
  const kataxImportSourceShared =
    config.useKataxServiceManager && config.kataxMode === "instance"
      ? "../config/katax.instance.js"
      : "katax-service-manager";
  const kataxImportSourceApi =
    config.useKataxServiceManager && config.kataxMode === "instance"
      ? "../../config/katax.instance.js"
      : "katax-service-manager";

  if (config.useKataxServiceManager) {
    // Version with katax-service-manager
    const dbInitCode =
      config.database === "postgresql" || config.database === "mysql"
        ? `
  // Initialize database
  await katax.database({
    name: 'main',
    type: '${config.database}',
    connection: {
      host: katax.envRequired('DB_HOST'),
      port: parseInt(katax.env('DB_PORT', '${config.database === "postgresql" ? "5432" : config.database === "mysql" ? "3306" : "27017"}')),
      database: katax.envRequired('DB_NAME'),
      user: katax.envRequired('DB_USER'),
      password: katax.envRequired('DB_PASSWORD'),
    }
  });
`
        : config.database === "mongodb"
          ? `
  // Initialize MongoDB
  await katax.database({
    name: 'main',
    type: 'mongodb',
    connection: {
      host: katax.envRequired('DB_HOST'),
      port: parseInt(katax.env('DB_PORT', '27017')),
      database: katax.envRequired('DB_NAME'),
      user: katax.env('DB_USER') || undefined,
      password: katax.env('DB_PASSWORD') || undefined,
      authSource: katax.env('DB_AUTH_SOURCE') || undefined,
    }
  });
`
          : "";

    const cacheInitCode = config.useRedis
      ? `
  // Initialize Redis cache connection
  await katax.database({
    name: 'redis',
    type: 'redis',
    connection: {
      host: katax.env('REDIS_HOST', 'localhost'),
      port: parseInt(katax.env('REDIS_PORT', '6379')),
      password: katax.env('REDIS_PASSWORD'),
      db: parseInt(katax.env('REDIS_DB', '0')),
    }
  });
`
      : "";

    const registryInitCode =
      config.useRegistry && config.registryMode === "url"
        ? `
      registry: {
        url: katax.envRequired('REGISTRY_URL'),
        apiKey: katax.env('REGISTRY_API_KEY') || undefined,
        heartbeatInterval: parseInt(katax.env('REGISTRY_HEARTBEAT_MS', '30000')),
        requestTimeoutMs: parseInt(katax.env('REGISTRY_TIMEOUT_MS', '5000')),
        retryAttempts: parseInt(katax.env('REGISTRY_RETRY_ATTEMPTS', '2')),
        retryBaseDelayMs: parseInt(katax.env('REGISTRY_RETRY_BASE_DELAY_MS', '300')),
      },`
        : config.useRegistry && config.registryMode === "handler"
          ? `
      registry: {
        handler: {
          register: async (serviceInfo) => {
            katax.logger.info({ message: 'Registry register callback', serviceInfo });
          },
          heartbeat: async (serviceInfo) => {
            katax.logger.debug({ message: 'Registry heartbeat callback', serviceInfo });
          },
          unregister: async (payload) => {
            katax.logger.info({ message: 'Registry unregister callback', payload });
          },
        },
      },`
          : "";

    const hooksInitCode = config.useLifecycleHooks
      ? `
      hooks: {
        beforeInit: async () => {
          console.log('Katax beforeInit hook');
        },
        afterInit: async () => {
          katax.logger.info({ message: 'Katax afterInit hook' });
        },
        beforeShutdown: async () => {
          katax.logger.info({ message: 'Katax beforeShutdown hook' });
        },
        afterShutdown: async () => {
          console.log('Katax afterShutdown hook');
        },
        onError: async (err) => {
          console.error('Katax lifecycle error:', err);
        },
      },`
      : "";

    // WebSocket initialization code
    let socketInitCode = "";
    let httpImport = "";
    let serverSetup = "";
    let listenCode = "";

    if (config.useWebSocket) {
      if (config.useSeparateSocketPort) {
        // Separate port mode
        socketInitCode = `
  // Initialize WebSocket (separate port)
  await katax.socket({
    name: 'main',
    port: ${config.socketPort}
  });
`;
        listenCode = `  const PORT = katax.env('PORT', '${config.port}');

  app.listen(PORT, () => {
    katax.logger.info({ message: \`Server running on http://localhost:\${PORT}\` });
    katax.logger.info({ message: \`WebSocket running on port ${config.socketPort}\` });
    katax.logger.info({ message: \`API endpoints available at http://localhost:\${PORT}/api\` });
    katax.logger.info({ message: \`Health check: http://localhost:\${PORT}/api/health\` });
  });`;
      } else {
        // Shared port mode
        httpImport = "\nimport { createServer } from 'http';";
        serverSetup = `
  const PORT = katax.env('PORT', '${config.port}');
  const httpServer = createServer(app);

  // Initialize WebSocket (same port as Express)
  await katax.socket({
    name: 'main',
    httpServer
  });
`;
        listenCode = `  httpServer.listen(PORT, () => {
    katax.logger.info({ message: \`Server + WebSocket running on http://localhost:\${PORT}\` });
    katax.logger.info({ message: \`API endpoints available at http://localhost:\${PORT}/api\` });
    katax.logger.info({ message: \`Health check: http://localhost:\${PORT}/api/health\` });
  });`;
      }
    } else {
      // No WebSocket
      listenCode = `  const PORT = katax.env('PORT', '${config.port}');

  app.listen(PORT, () => {
    katax.logger.info({ message: \`Server running on http://localhost:\${PORT}\` });
    katax.logger.info({ message: \`API endpoints available at http://localhost:\${PORT}/api\` });
    katax.logger.info({ message: \`Health check: http://localhost:\${PORT}/api/health\` });
  });`;
    }

    indexContent = `import { katax } from '${kataxImportSourceRoot}';
import app from './app.js';${httpImport}

// Initialize katax and start server
async function bootstrap(): Promise<void> {
  try {
    await katax.init({
      loadEnv: true, // Loads .env automatically
      logger: {
        level: katax.env('LOG_LEVEL', 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
        prettyPrint: katax.isDev,
      },${registryInitCode}${hooksInitCode}
    });

${dbInitCode}${cacheInitCode}${serverSetup}${socketInitCode}
${listenCode}

    // Register custom shutdown hooks (optional)
    katax.onShutdown(async () => {
      katax.logger.info('Running custom cleanup...');
      // Add your custom cleanup logic here
    });

    // Note: SIGTERM/SIGINT handlers are registered automatically by katax
  } catch (err) {
    console.error('Failed to start application:', err);
    process.exit(1);
  }
}

void bootstrap();
`;
  } else {
    // Manual version (original)
    indexContent = `import app from './app.js';
import dotenv from 'dotenv';
import { logger } from './shared/logger.utils.js';
import { validateEnvironment } from './config/env.validator.js';

dotenv.config();

// Validate required environment variables
validateEnvironment();

const PORT = process.env.PORT || ${config.port};

app.listen(PORT, () => {
  logger.info(\`Server running on http://localhost:\${PORT}\`);
  logger.info(\`API endpoints available at http://localhost:\${PORT}/api\`);
  logger.info(\`Health check: http://localhost:\${PORT}/api/health\`);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  process.exit(0);
});
`;
  }

  await writeFile(path.join(projectPath, "src/index.ts"), indexContent);

  if (config.useKataxServiceManager && config.kataxMode === "instance") {
    const kataxInstanceContent = `import { Katax } from 'katax-service-manager';

export const katax = new Katax();
`;

    await writeFile(
      path.join(projectPath, "src/config/katax.instance.ts"),
      kataxInstanceContent,
    );
  }

  // Create app.ts
  const appContent = `import express from 'express';
import cors from 'cors';
import router from './api/routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { corsOptions } from './config/cors.config.js';${config.swagger ? "\nimport { setupSwagger } from './config/swagger.config.js';" : ""}

const app = express();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

${config.swagger ? "// API Documentation\nsetupSwagger(app);\n\n" : ""}// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to ${config.name} API',
    version: '1.0.0',
    endpoints: '/api',
    health: '/api/health'${config.swagger ? ",\n    docs: '/docs'" : ""}
  });
});

app.use('/api', router);

// Error handling
app.use(errorMiddleware);

export default app;
`;

  await writeFile(path.join(projectPath, "src/app.ts"), appContent);

  // Create routes.ts
  const routesContent = `import { Router } from 'express';
import helloRouter from './hello/hello.routes.js';
import { healthCheckHandler } from './health/health.handler.js';

const router = Router();

// Health check
router.get('/health', healthCheckHandler);

// Example endpoint
router.use('/hello', helloRouter);

export default router;
`;

  await writeFile(path.join(projectPath, "src/api/routes.ts"), routesContent);

  // Create error middleware
  const errorMiddlewareContent = `import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/logger.utils.js';

export interface ApiError extends Error {
  statusCode?: number;
}

export function errorMiddleware(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({
    err,
    req: {
      method: req.method,
      url: req.url,
      headers: req.headers
    },
    statusCode,
    message
    });

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
`;

  await writeFile(
    path.join(projectPath, "src/middleware/error.middleware.ts"),
    errorMiddlewareContent,
  );

  // Create database connection if database is selected (only for manual mode)
  if (config.database !== "none" && !config.useKataxServiceManager) {
    await createDatabaseConnection(projectPath, config);
  }

  // Create shared utilities
  if (config.validation === "katax-core") {
    const apiUtilsContent = `import { Request, Response } from 'express';
import { logger } from './logger.utils.js';

export interface ControllerResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  statusCode?: number;
}

export function createSuccessResult<T>(
  message: string,
  data?: T,
  error?: string,
  statusCode = 200
): ControllerResult<T> {
  return { success: true, message, data, error, statusCode };
}

export function createErrorResult(
  message: string,
  error?: string,
  statusCode = 400
): ControllerResult {
  return { success: false, message, error, statusCode };
}

export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors?: any[];
}

export async function sendResponse<TValidation = any, TResponse = any>(
  req: Request,
  res: Response,
  validator: () => Promise<ValidationResult<TValidation>>,
  controller: (validData: TValidation) => Promise<ControllerResult<TResponse>>
): Promise<void> {
  try {
    // 1. Execute validation
    const validationResult = await validator();
    
    if (!validationResult.isValid) {
      // Validation error
      logger.warn({
        method: req.method,
        path: req.path,
        errors: validationResult.errors, 
        message:'Validation failed'}
      );
      
      res.status(400).json({
        success: false,
        message: 'Invalid data',
        error: 'Validation failed',
        details: validationResult.errors
      });
      return;
    }

    // 2. Execute controller if validation passes
    const controllerResult = await controller(validationResult.data as TValidation);

    // 3. Build HTTP response
    const statusCode = controllerResult.statusCode || (controllerResult.success ? 200 : 400);

    const response: any = {
      success: controllerResult.success,
      message: controllerResult.message
    };

    if (controllerResult.data !== undefined) {
      response.data = controllerResult.data;
    }

    if (controllerResult.error) {
      response.error = controllerResult.error;
    }

    res.status(statusCode).json(response);

  } catch (error) {
    // Internal server error
    logger.error({
      err: error,
      method: req.method,
      path: req.path, 
      message: 'Internal server error'
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
`;

    await writeFile(
      path.join(projectPath, "src/shared/api.utils.ts"),
      apiUtilsContent,
    );
  }

  // Create JWT utilities if JWT authentication is selected
  if (config.authentication === "jwt") {
    const jwtUtilsContent = `import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';

const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';  // 7 days

// ==================== INTERFACES ====================

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// ==================== TOKEN GENERATION ====================

/**
 * Generate Access Token
 * @param payload - JWT payload containing user information
 * @returns JWT access token string
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY
  });
}

/**
 * Generate Refresh Token
 * @param payload - JWT payload containing user information
 * @returns JWT refresh token string
 */
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY
  });
}

/**
 * Generate both access and refresh tokens
 * @param payload - JWT payload containing user information
 * @returns Object with both tokens
 */
export function generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload)
  };
}

// ==================== TOKEN VERIFICATION ====================

/**
 * Verify Access Token
 * @param token - JWT token to verify
 * @returns Decoded JWT payload or null if invalid
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    console.error('[JWT] Error verifying access token:', error);
    return null;
  }
}

/**
 * Verify Refresh Token
 * @param token - JWT token to verify
 * @returns Decoded JWT payload or null if invalid
 */
export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
  } catch (error) {
    console.error('[JWT] Error verifying refresh token:', error);
    return null;
  }
}

/**
 * Decode token without verifying (useful for debugging)
 * @param token - JWT token to decode
 * @returns Decoded token data
 */
export function decodeToken(token: string): any {
  return jwt.decode(token);
}

// ==================== MIDDLEWARE ====================

/**
 * Express middleware to authenticate requests using JWT
 * Expects Bearer token in Authorization header
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
    return;
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
    return;
  }

  // Attach user info to request
  (req as any).user = payload;
  next();
}

/**
 * Middleware to check if user has specific role
 * @param roles - Array of allowed roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
}
`;

    await writeFile(
      path.join(projectPath, "src/shared/jwt.utils.ts"),
      jwtUtilsContent,
    );

    // Create auth utilities (password hashing, JWT, crypto)
    await writeFile(
      path.join(projectPath, "src/shared/auth.utils.ts"),
      generateAuthUtils(),
    );
  }

  // Create logger utility
  let loggerUtilsContent: string;

  if (config.useKataxServiceManager) {
    // Version using katax-service-manager
    // katax.logger is always available (lazy initialization)
    loggerUtilsContent = `import { katax } from '${kataxImportSourceShared}';

/**
 * Re-export logger for convenience
 * katax.logger is always available (creates a default logger if not initialized)
 * Advanced features (broadcast, transports) require katax.init()
 */
export const logger = katax.logger;

/**
 * Log HTTP request helper
 */
export function logRequest(method: string, url: string, statusCode: number, duration: number): void {
  logger.info({
    message: \`\${method} \${url} - \${statusCode} (\${duration}ms)\`,
    method,
    url,
    statusCode,
    duration: \`\${duration}ms\`
  });
}
`;
  } else {
    // Manual pino version
    loggerUtilsContent = `import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Pino logger configuration
 * - Pretty printing in development
 * - JSON logs in production
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  }
});

/**
 * Log HTTP request
 */
export function logRequest(method: string, url: string, statusCode: number, duration: number): void {
  logger.info({
    method,
    url,
    statusCode,
    duration: \`\${duration}ms\`
  }, \`\${method} \${url} - \${statusCode} (\${duration}ms)\`);
}

/**
 * Log error with context
 */
export function logError(error: Error, context?: Record<string, any>): void {
  logger.error({
    err: error,
    ...context
  }, error.message);
}

/**
 * Log info message
 */
export function logInfo(message: string, data?: Record<string, any>): void {
  logger.info(data, message);
}

/**
 * Log warning message
 */
export function logWarning(message: string, data?: Record<string, any>): void {
  logger.warn(data, message);
}

/**
 * Log debug message (only in development)
 */
export function logDebug(message: string, data?: Record<string, any>): void {
  logger.debug(data, message);
}
`;
  }

  await writeFile(
    path.join(projectPath, "src/shared/logger.utils.ts"),
    loggerUtilsContent,
  );

  // Create stream utilities (SSE, chunked transfer)
  await writeFile(
    path.join(projectPath, "src/shared/stream.utils.ts"),
    generateStreamUtils(),
  );

  // Create logger middleware
  const loggerMiddlewareContent = `import { Request, Response, NextFunction } from 'express';
import { logRequest } from '../shared/logger.utils.js';

/**
 * Express middleware to log all HTTP requests
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logRequest(req.method, req.url, res.statusCode, duration);
  });

  next();
}
`;

  await writeFile(
    path.join(projectPath, "src/middleware/logger.middleware.ts"),
    loggerMiddlewareContent,
  );

  // Create CORS configuration
  const corsConfigContent = `import { CorsOptions } from 'cors';

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Read allowed origins dynamically to ensure env vars are loaded
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:5173'];

    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
`;

  await writeFile(
    path.join(projectPath, "src/config/cors.config.ts"),
    corsConfigContent,
  );

  // Create environment validator
  const envValidatorContent = `import { logger } from '../shared/logger.utils.js';

interface RequiredEnvVars {
  [key: string]: string;
}

/**
 * Validate that all required environment variables are present
 */
export function validateEnvironment(): void {
  const required: RequiredEnvVars = {
    PORT: process.env.PORT || '',
    NODE_ENV: process.env.NODE_ENV || ''
  };

${config.database !== "none" ? `  // Database variables\n  required.DATABASE_URL = process.env.DATABASE_URL || '';\n` : ""}${config.authentication === "jwt" ? `  // JWT variables\n  required.JWT_SECRET = process.env.JWT_SECRET || '';\n  required.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || '';\n` : ""}
  const missing: string[] = [];

  for (const [key, value] of Object.entries(required)) {
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    logger.error({message:\`Missing required environment variables: \${missing.join(', ')}\`});
    logger.error({message:'Please check your .env file'});
  }

  logger.info({message:'Environment variables validated successfully'});
}
`;

  await writeFile(
    path.join(projectPath, "src/config/env.validator.ts"),
    envValidatorContent,
  );

  // Create Swagger configuration if enabled
  if (config.swagger) {
    await writeFile(
      path.join(projectPath, "src/config/swagger.config.ts"),
      generateSwaggerSetup(String(config.port)),
    );

    // Create initial OpenAPI spec
    const initialOpenAPISpec = {
      openapi: "3.0.0",
      info: {
        title: config.name,
        version: "1.0.0",
        description: config.description || "API Documentation",
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: "Development server",
        },
      ],
      paths: {
        "/": {
          get: {
            tags: ["General"],
            summary: "Welcome endpoint",
            responses: {
              "200": {
                description: "Welcome message",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        message: { type: "string" },
                        version: { type: "string" },
                        endpoints: { type: "string" },
                        health: { type: "string" },
                        docs: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/api/health": {
          get: {
            tags: ["Health"],
            summary: "Health check endpoint",
            responses: {
              "200": {
                description: "Health status",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        status: { type: "string" },
                        timestamp: { type: "string" },
                        uptime: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {},
      },
    };

    await writeFile(
      path.join(projectPath, "src/openapi.json"),
      JSON.stringify(initialOpenAPISpec, null, 2),
    );
  }

  // Create health check handler
  const healthHandlerContent = config.useKataxServiceManager
    ? `import { Request, Response } from 'express';
import { katax } from '${kataxImportSourceApi}';

/**
 * Health check endpoint handler
 * Returns Katax service status and app metadata
 */
export async function healthCheckHandler(req: Request, res: Response): Promise<void> {
  try {
    const health = await katax.healthCheck();

    const statusCode =
      health.status === 'healthy'
        ? 200
        : health.status === 'degraded'
          ? 503
          : 500;

    res.status(statusCode).json({
      ...health,
      environment: katax.nodeEnv,
      app: {
        name: katax.appName,
        version: katax.version,
        registered: katax.isRegistered,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'unhealthy',
      message: 'Failed to evaluate health status',
      error: err instanceof Error ? err.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
}
`
    : `import { Request, Response } from 'express';
import os from 'os';

/**
 * Health check endpoint handler
 * Returns system information and service status
 */
export function healthCheckHandler(req: Request, res: Response): void {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime)
    },
    memory: {
      rss: formatBytes(memoryUsage.rss),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      external: formatBytes(memoryUsage.external)
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpus: os.cpus().length,
      totalMemory: formatBytes(os.totalmem()),
      freeMemory: formatBytes(os.freemem())
    },
    environment: process.env.NODE_ENV || 'development'
  };

  res.json(healthData);
}

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(\`\${days}d\`);
  if (hours > 0) parts.push(\`\${hours}h\`);
  if (minutes > 0) parts.push(\`\${minutes}m\`);
  parts.push(\`\${secs}s\`);

  return parts.join(' ');
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return \`\${size.toFixed(2)} \${units[unitIndex]}\`;
}
`;

  await ensureDir(path.join(projectPath, "src/api/health"));
  await writeFile(
    path.join(projectPath, "src/api/health/health.handler.ts"),
    healthHandlerContent,
  );

  // Create README.md
  const readmeContent = `# ${config.name}

${config.description}

## 🚀 Quick Start

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
\`\`\`

## 📁 Project Structure

\`\`\`
src/
├── api/              # API routes and endpoints
├── config/           # Configuration files
├── middleware/       # Express middleware
├── shared/           # Shared utilities
└── index.ts          # Entry point
\`\`\`

## 🛠️ Technologies

- **Express** - Web framework
- **TypeScript** - Type safety
${config.validation === "katax-core" ? "- **katax-core** - Schema validation\n" : ""}${config.authentication === "jwt" ? "- **JWT** - Authentication\n" : ""}${config.swagger ? "- **Swagger** - API Documentation\n" : ""}${config.database !== "none" ? `- **${config.database}** - Database\n` : ""}
## 📚 API Documentation

Server runs on \`http://localhost:${config.port}\`
${config.swagger ? `\n### Interactive Documentation\n\nSwagger UI is available at: **http://localhost:${config.port}/docs**\n\n- View all endpoints\n- Test API calls directly\n- See request/response schemas\n- Auto-updated when you add endpoints\n\n` : ""}
### Endpoints

- \`GET /\` - Welcome message
- \`GET /api/health\` - Health check${config.swagger ? "\n- `GET /docs` - Swagger UI\n- `GET /openapi.json` - OpenAPI Specification" : ""}

## 🔧 Development

Add new endpoints using Katax CLI:

\`\`\`bash
# Add a single endpoint
katax add endpoint users

# Generate CRUD resource
katax generate crud products
\`\`\`

## 📝 License

MIT
`;

  await writeFile(path.join(projectPath, "README.md"), readmeContent);

  // Create default hello endpoint
  await createHelloEndpoint(projectPath, config);
}

async function createHelloEndpoint(
  projectPath: string,
  config: ProjectConfig,
): Promise<void> {
  const helloPath = path.join(projectPath, "src/api/hello");

  // hello.controller.ts
  const controllerContent = [
    "import { ControllerResult, createSuccessResult, createErrorResult } from '../../shared/api.utils.js';",
    "import { HelloQuery } from './hello.validator.js';",
    "import { logger } from '../../shared/logger.utils.js';",
    "",
    "/**",
    " * Get hello message",
    " */",
    "export async function getHello(queryData: HelloQuery): Promise<ControllerResult<{ message: string; timestamp: string }>> {",
    "  try {",
    "    const name = queryData.name || 'World';",
    "    logger.debug({ name, message: 'Processing hello request' });",
    "    ",
    "    return createSuccessResult(",
    "      'Hello endpoint working!',",
    "      {",
    "        message: `Hello ${name}! Welcome to your API 🚀`,",
    "        timestamp: new Date().toISOString()",
    "      }",
    "    );",
    "  } catch (error) {",
    "    logger.error({ err: error, message: 'Error in getHello controller' });",
    "    return createErrorResult(",
    "      'Failed to get hello message',",
    "      error instanceof Error ? error.message : 'Unknown error',",
    "      500",
    "    );",
    "  }",
    "}",
  ].join("\n");

  await writeFile(
    path.join(helloPath, "hello.controller.ts"),
    controllerContent,
  );

  // hello.handler.ts
  const handlerContent = [
    "import { Request, Response } from 'express';",
    "import { getHello } from './hello.controller.js';",
    "import { validateHelloQuery } from './hello.validator.js';",
    "import { sendResponse } from '../../shared/api.utils.js';",
    "",
    "// ==================== HANDLERS ====================",
    "",
    "/**",
    " * Handler for GET /api/hello",
    " * Uses sendResponse utility for automatic validation and response handling",
    " */",
    "export async function getHelloHandler(req: Request, res: Response): Promise<void> {",
    "  await sendResponse(",
    "    req,",
    "    res,",
    "    // Validator returns Promise<ValidationResult<HelloQuery>>",
    "    () => validateHelloQuery(req.query),",
    "    // validData is automatically: HelloQuery (not any)",
    "    (validData) => getHello(validData)",
    "  );",
    "}",
  ].join("\n");

  await writeFile(path.join(helloPath, "hello.handler.ts"), handlerContent);

  // hello.routes.ts
  const routesContent = [
    "import { Router } from 'express';",
    "import { getHelloHandler } from './hello.handler.js';",
    "",
    "const router = Router();",
    "",
    "// ==================== ROUTES ====================",
    "",
    "/**",
    " * @route GET /api/hello",
    " * @desc Example endpoint - returns a greeting message",
    " */",
    "router.get('/', getHelloHandler);",
    "",
    "export default router;",
  ].join("\n");

  await writeFile(path.join(helloPath, "hello.routes.ts"), routesContent);

  // Only create validator if katax-core is enabled
  if (config.validation === "katax-core") {
    const validatorContent = [
      "import { k, kataxInfer } from 'katax-core';",
      "import type { ValidationResult } from '../../shared/api.utils.js';",
      "",
      "// ==================== SCHEMAS ====================",
      "",
      "/**",
      " * Schema for hello query params",
      " */",
      "export const helloQuerySchema = k.object({",
      "  name: k.string().minLength(2).optional()",
      "});",
      "",
      "/**",
      " * Inferred TypeScript type from schema",
      " */",
      "export type HelloQuery = kataxInfer<typeof helloQuerySchema>;",
      "",
      "/**",
      " * Validate hello query params",
      " */",
      "export async function validateHelloQuery(data: unknown): Promise<ValidationResult<HelloQuery>> {",
      "  const result = helloQuerySchema.safeParse(data);",
      "",
      "  if (!result.success) {",
      "    const errors = result.issues.map(issue => ({",
      "      field: issue.path.join('.'),",
      "      message: issue.message",
      "    }));",
      "",
      "    return {",
      "      isValid: false,",
      "      errors",
      "    };",
      "  }",
      "",
      "  return {",
      "    isValid: true,",
      "    data: result.data",
      "  };",
      "}",
    ].join("\n");

    await writeFile(
      path.join(helloPath, "hello.validator.ts"),
      validatorContent,
    );
  }
}
