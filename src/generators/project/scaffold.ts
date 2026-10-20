import crypto from "crypto";
import path from "path";
import type { ProjectConfig } from "../../types/index.js";
import type { PlannedFile } from "../resource/project-files.js";
import { readProjectTemplate } from "../resource/project-files.js";

/**
 * Everything `katax init` writes, as a list of files. Static files are
 * copied from templates/project/src; the rest depends on the answers.
 */

export const KATAX_CORE_VERSION = "^1.6.6";
export const KATAX_SERVICE_MANAGER_VERSION = "^0.6.1";

/** Static files every project gets (relative to src/). */
const BASE_FILES = [
  "shared/api.utils.ts",
  "shared/errors.utils.ts",
  "shared/sanitize.utils.ts",
  "shared/null.utils.ts",
  "shared/validation.utils.ts",
  "shared/pagination.utils.ts",
  "shared/openapi.utils.ts",
  "shared/route-map.utils.ts",
  "shared/startup-routes.utils.ts",
  "shared/async-errors.ts",
  "shared/stream.utils.ts",
  "types/api.types.ts",
  "types/db.types.ts",
  "middleware/error.middleware.ts",
  "middleware/logger.middleware.ts",
  "middleware/api-key.middleware.ts",
  "config/cors.config.ts",
  "api/health/health.handler.ts",
];

const DATABASE_FILES = ["shared/db.ts"];
const JWT_FILES = ["shared/jwt.utils.ts", "shared/password.utils.ts", "middleware/auth.middleware.ts"];

export function staticFiles(config: ProjectConfig): string[] {
  return [
    ...BASE_FILES,
    ...(config.database === "postgresql" ? DATABASE_FILES : []),
    ...(config.authentication === "jwt" ? JWT_FILES : []),
  ];
}

// ==================== package.json ====================

export function renderPackageJson(config: ProjectConfig): string {
  const pg = config.database === "postgresql";
  const jwt = config.authentication === "jwt";
  const pkg = {
    name: config.name,
    version: "1.0.0",
    description: config.description,
    type: "module",
    main: "dist/index.js",
    scripts: {
      dev: "nodemon --watch src --ext ts --exec tsx src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
      typecheck: "tsc --noEmit",
      lint: "eslint . --ext .ts",
      format: 'prettier --write "src/**/*.ts"',
    },
    keywords: ["api", "express", "typescript", "katax"],
    author: "",
    license: "MIT",
    dependencies: sortKeys({
      express: "^4.21.2",
      cors: "^2.8.5",
      helmet: "^8.1.0",
      "cookie-parser": "^1.4.7",
      "express-rate-limit": "^8.3.2",
      "katax-core": KATAX_CORE_VERSION,
      "katax-service-manager": KATAX_SERVICE_MANAGER_VERSION,
      // optional peers of katax-service-manager used by this project
      dotenv: "^16.4.7",
      "pino-pretty": "^13.0.0",
      "swagger-ui-express": "^5.0.1",
      ...(pg ? { pg: "^8.13.1" } : {}),
      ...(config.useRedis ? { redis: "^4.7.0" } : {}),
      ...(config.useWebSocket ? { "socket.io": "^4.8.1" } : {}),
      ...(jwt ? { jsonwebtoken: "^9.0.2", bcryptjs: "^3.0.2" } : {}),
    }),
    devDependencies: sortKeys({
      "@types/express": "^4.17.21",
      "@types/cors": "^2.8.17",
      "@types/cookie-parser": "^1.4.8",
      "@types/node": "^22.10.0",
      "@types/swagger-ui-express": "^4.1.7",
      ...(pg ? { "@types/pg": "^8.11.10" } : {}),
      ...(jwt ? { "@types/jsonwebtoken": "^9.0.7" } : {}),
      typescript: "^5.9.3",
      tsx: "^4.19.2",
      nodemon: "^3.1.9",
      eslint: "^8.57.1",
      "@typescript-eslint/eslint-plugin": "^6.21.0",
      "@typescript-eslint/parser": "^6.21.0",
      prettier: "^3.4.2",
    }),
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

export function renderTsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          lib: ["ES2022"],
          moduleResolution: "bundler",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          forceConsistentCasingInFileNames: true,
          strict: true,
          noUncheckedIndexedAccess: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          sourceMap: true,
          removeComments: true,
          outDir: "./dist",
          rootDir: "./src",
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist"],
      },
      null,
      2,
    ) + "\n"
  );
}

// ==================== .env ====================

export function renderEnv(config: ProjectConfig, real: boolean): string {
  const lines: string[] = [
    "# Server",
    `PORT=${config.port}`,
    "NODE_ENV=development",
    "LOG_LEVEL=info",
    "",
    "# CORS (comma separated)",
    "ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173",
  ];

  if (config.database === "postgresql") {
    const db = config.dbConfig ?? {};
    lines.push(
      "",
      "# PostgreSQL",
      `DB_HOST=${real ? (db.host ?? "localhost") : "localhost"}`,
      `DB_PORT=${real ? (db.port ?? "5432") : "5432"}`,
      `DB_NAME=${real ? (db.database ?? config.name.replace(/-/g, "_")) : "your_database"}`,
      `DB_USER=${real ? (db.user ?? "postgres") : "your_user"}`,
      `DB_PASSWORD=${real ? (db.password ?? "") : "your_password"}`,
    );
  }

  if (config.useRedis) {
    const redis = config.redisConfig ?? {};
    lines.push(
      "",
      "# Redis",
      `REDIS_HOST=${real ? (redis.host ?? "localhost") : "localhost"}`,
      `REDIS_PORT=${real ? (redis.port ?? "6379") : "6379"}`,
      `REDIS_PASSWORD=${real ? (redis.password ?? "") : ""}`,
      `REDIS_DB=${real ? (redis.db ?? "0") : "0"}`,
    );
  }

  if (config.useRegistry && config.registryMode === "url") {
    lines.push(
      "",
      "# Katax registry",
      `REGISTRY_URL=${config.registryUrl ?? "http://localhost:4000/api/services"}`,
      "REGISTRY_API_KEY=",
    );
  }

  if (config.authentication === "jwt") {
    lines.push(
      "",
      "# JWT (generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\")",
      `JWT_SECRET=${real ? crypto.randomBytes(64).toString("hex") : "change-me"}`,
      "JWT_EXPIRES_IN=15m",
      `JWT_REFRESH_SECRET=${real ? crypto.randomBytes(64).toString("hex") : "change-me-too"}`,
      "JWT_REFRESH_EXPIRES_IN=7d",
    );
  }

  return lines.join("\n") + "\n";
}

// ==================== src/index.ts ====================

export function renderIndex(config: ProjectConfig): string {
  const sharedSocket = config.useWebSocket && !config.useSeparateSocketPort;
  const imports = [
    "// Load .env before anything reads process.env (the logger config below reads LOG_LEVEL/NODE_ENV",
    "// while building the init() options, before katax could load it with loadEnv).",
    "import 'dotenv/config';",
    "import { katax } from 'katax-service-manager';",
  ];
  if (sharedSocket) imports.push("import { createServer } from 'http';");
  imports.push("import app from './app.js';");
  if (config.listRoutes) imports.push("import { printStartupRoutes } from './shared/startup-routes.utils.js';");

  const initOptions: string[] = [
    "      logger: {",
    "        level: katax.env('LOG_LEVEL', 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',",
    "        prettyPrint: katax.isDev",
    "      }",
  ];
  if (config.useRegistry && config.registryMode === "url") {
    initOptions.push(
      "      registry: {",
      "        url: katax.envRequired('REGISTRY_URL'),",
      "        apiKey: katax.env('REGISTRY_API_KEY') || undefined",
      "      }",
    );
  } else if (config.useRegistry && config.registryMode === "handler") {
    initOptions.push(
      "      registry: {",
      "        handler: {",
      "          register: async (serviceInfo) => katax.logger.info({ message: 'Registry register', serviceInfo }),",
      "          heartbeat: async (serviceInfo) => katax.logger.debug({ message: 'Registry heartbeat', serviceInfo }),",
      "          unregister: async (payload) => katax.logger.info({ message: 'Registry unregister', payload })",
      "        }",
      "      }",
    );
  }
  if (config.useLifecycleHooks) {
    initOptions.push(
      "      hooks: {",
      "        afterInit: () => katax.logger.info({ message: 'Katax ready' }),",
      "        beforeShutdown: () => katax.logger.info({ message: 'Shutting down...' }),",
      "        onError: (context, error) => katax.logger.error({ message: `Katax lifecycle error (${context})`, err: error })",
      "      }",
    );
  }
  // join option blocks with commas between top-level entries
  const initBlock = joinTopLevel(initOptions);

  const body: string[] = [];
  body.push("    await katax.init({", initBlock, "    });");

  if (config.database === "postgresql") {
    body.push(
      "",
      "    await katax.database({",
      "      name: 'main',",
      "      type: 'postgresql',",
      "      connection: {",
      "        host: katax.envRequired('DB_HOST'),",
      "        port: katax.env('DB_PORT', 5432),",
      "        database: katax.envRequired('DB_NAME'),",
      "        user: katax.envRequired('DB_USER'),",
      "        password: katax.envRequired('DB_PASSWORD')",
      "      }",
      "    });",
    );
  }
  if (config.useRedis) {
    body.push(
      "",
      "    await katax.database({",
      "      name: 'redis',",
      "      type: 'redis',",
      "      connection: {",
      "        host: katax.env('REDIS_HOST', 'localhost'),",
      "        port: katax.env('REDIS_PORT', 6379),",
      "        password: katax.env('REDIS_PASSWORD') || undefined,",
      "        db: katax.env('REDIS_DB', 0)",
      "      }",
      "    });",
    );
  }

  body.push("", `    const PORT = katax.env('PORT', ${config.port});`);
  const listenCallback: string[] = [
    "      katax.logger.info({ message: `Server running on http://localhost:${PORT}` });",
  ];
  if (config.useWebSocket && config.useSeparateSocketPort) {
    listenCallback.push(`      katax.logger.info({ message: 'WebSocket running on port ${config.socketPort}' });`);
  }
  if (config.listRoutes) {
    listenCallback.push(`      printStartupRoutes(app, '${config.name}', \`http://localhost:\${PORT}\`);`);
  }

  if (sharedSocket) {
    body.push(
      "    const httpServer = createServer(app);",
      "    await katax.socket({ name: 'main', httpServer }); // Socket.IO on the same port as Express",
      "",
      "    httpServer.listen(PORT, () => {",
      ...listenCallback,
      "    });",
    );
  } else {
    if (config.useWebSocket) {
      body.push(`    await katax.socket({ name: 'main', port: ${config.socketPort} });`);
    }
    body.push("    app.listen(PORT, () => {", ...listenCallback, "    });");
  }

  body.push(
    "",
    "    katax.onShutdown(async () => {",
    "      // close your own resources here (katax closes databases, sockets and cron itself)",
    "    });",
    "    // SIGTERM/SIGINT -> katax.shutdown() are registered by katax.init()",
  );

  return [
    ...imports,
    "",
    "async function bootstrap(): Promise<void> {",
    "  try {",
    ...body,
    "  } catch (error) {",
    "    console.error('Failed to start application:', error);",
    "    process.exit(1);",
    "  }",
    "}",
    "",
    "void bootstrap();",
    "",
  ].join("\n");
}

/** Adds the commas between `key: {...}` blocks of an object literal written line by line. */
function joinTopLevel(lines: string[]): string {
  const out: string[] = [];
  lines.forEach((line, i) => {
    const next = lines[i + 1];
    const isTopLevelEnd = /^ {6}\S/.test(line) && !line.trimEnd().endsWith(",") && !line.trimEnd().endsWith("{");
    const nextStartsTopLevel = next !== undefined && /^ {6}\S/.test(next);
    out.push(isTopLevelEnd && nextStartsTopLevel ? `${line},` : line);
  });
  return out.join("\n");
}

// ==================== src/app.ts ====================

export function renderApp(config: ProjectConfig): string {
  return `// Must be the first import: forwards rejected promises from async handlers to errorMiddleware.
import './shared/async-errors.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import router from './api/routes.js';
import { corsOptions } from './config/cors.config.js';
import { errorMiddleware, notFoundHandler } from './middleware/error.middleware.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { ERROR_CODES, defaultMessageFor } from './shared/errors.utils.js';
import { mountApiDocs } from './shared/openapi.utils.js';

const app = express();

// Real client IP behind nginx/PM2 - required for per-client rate limiting.
app.set('trust proxy', 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: defaultMessageFor(429), error: ERROR_CODES.RATE_LIMITED }
});

app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestLogger);

// OpenAPI 3.1 built from the routes + katax-core validators: /openapi.json and /docs
mountApiDocs(app, {
  title: '${config.name}',
  version: process.env.npm_package_version ?? '1.0.0',
  description: ${JSON.stringify(config.description)},
  serverUrl: process.env.PUBLIC_URL
});

app.get('/', (_req, res) => {
  res.json({ name: '${config.name}', api: '/api', health: '/api/health', docs: '/docs' });
});

app.use('/api', apiLimiter);
app.use('/api', router);
app.use('/api', notFoundHandler);

app.use(errorMiddleware);

export default app;
`;
}

// ==================== src/api/routes.ts ====================

export function renderRoutes(config: ProjectConfig): string {
  const lines = [
    "import { Router } from 'express';",
    "import { healthCheckHandler } from './health/health.handler.js';",
  ];
  if (config.authentication === "jwt") lines.push("import { requireAuth } from '../middleware/auth.middleware.js';");
  lines.push("", "const router = Router();", "", "// Public", "router.get('/health', healthCheckHandler);");
  if (config.authentication === "jwt") {
    lines.push(
      "",
      "// Everything below requires a valid access token (req.user = { id, email, role })",
      "router.use(requireAuth);",
    );
  }
  lines.push("", "export default router;", "");
  return lines.join("\n");
}

// ==================== misc ====================

export const GITIGNORE = `node_modules/
dist/
.env
.DS_Store
*.log
logs/
coverage/
.katax-deploy.json
`;

export const GITATTRIBUTES = `# LF everywhere (the API is deployed on Linux)
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
`;

export function renderEcosystem(config: ProjectConfig): string {
  return `// PM2: one instance (in-memory rate limits${config.useWebSocket ? " and Socket.IO" : ""} need it). pm2 reload ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: '${config.name}',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' }
    }
  ]
};
`;
}

export function renderReadme(config: ProjectConfig): string {
  return `# ${config.name}

${config.description}

## Development

\`\`\`bash
${config.packageManager} install
${config.packageManager === "pnpm" ? "pnpm dev" : "npm run dev"}
\`\`\`

- API: http://localhost:${config.port}/api
- Health: http://localhost:${config.port}/api/health
- Docs (OpenAPI 3.1, built from the validators): http://localhost:${config.port}/docs

## Adding a resource

\`\`\`bash
katax add endpoint habits --fields "name:string, note:text?, starts_on:date"
katax add endpoint habits/:habitId/reminders --fields "remind_at:string"
katax add endpoint news --public --methods list,get
\`\`\`

Each resource lives in \`src/api/<resource>/\`: validator, types, repository (the only file with SQL),
controller, handler and routes. Migrations are written to \`migrations/\`.

## Structure

\`\`\`
src/
├── api/            # one folder per resource + routes.ts
├── config/         # cors
├── middleware/     # auth, errors, logging, api keys
├── shared/         # api/errors/null/validation/pagination/db/openapi utils
├── types/          # db.types.ts (row types), api.types.ts
├── app.ts          # express app
└── index.ts        # katax bootstrap
\`\`\`
`;
}

export interface ScaffoldResult {
  files: PlannedFile[];
}

/** All files of a new project (paths absolute under projectPath). */
export function scaffoldProject(projectPath: string, config: ProjectConfig): ScaffoldResult {
  const file = (relative: string, content: string): PlannedFile => ({
    path: path.join(projectPath, relative),
    content,
    action: "create",
  });

  const files: PlannedFile[] = [
    file("package.json", renderPackageJson(config)),
    file("tsconfig.json", renderTsconfig()),
    file(".env", renderEnv(config, true)),
    file(".env.example", renderEnv(config, false)),
    file(".gitignore", GITIGNORE),
    file(".gitattributes", GITATTRIBUTES),
    file("ecosystem.config.cjs", renderEcosystem(config)),
    file("README.md", renderReadme(config)),
    file("src/index.ts", renderIndex(config)),
    file("src/app.ts", renderApp(config)),
    file("src/api/routes.ts", renderRoutes(config)),
    ...staticFiles(config).map((relative) => file(`src/${relative}`, readProjectTemplate(relative))),
  ];
  if (config.database === "postgresql") files.push(file("migrations/.gitkeep", ""));
  return { files };
}
