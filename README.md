# Katax CLI

[![npm version](https://img.shields.io/npm/v/katax-cli.svg)](https://www.npmjs.com/package/katax-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CLI tool to generate Express REST APIs with TypeScript, [katax-core](https://github.com/LOPIN6FARRIER/katax-core) validation and (optionally) [katax-service-manager](https://github.com/LOPIN6FARRIER/katax-service-manager).

**Version**: 1.6.2 | **Node**: >= 18

## Installation

```bash
npm install -g katax-cli

# or use with npx
npx katax-cli init my-api
```

### AI Agent Skill

Install the [katax-cli AI agent skill](https://skills.sh/LOPIN6FARRIER/katax-cli) for enhanced IDE assistance:

[![skills.sh](https://skills.sh/b/LOPIN6FARRIER/katax-cli)](https://skills.sh/LOPIN6FARRIER/katax-cli)

```bash
npx skills add LOPIN6FARRIER/katax-cli
```

Compatible with Claude Code, Cursor, Windsurf, GitHub Copilot, and other AI coding agents.

## Quick Start

```bash
# Create a new project (interactive, installs dependencies)
katax init my-api
cd my-api
npm run dev

# Add an endpoint
katax add endpoint users

# Generate a CRUD resource
katax generate crud products

# View project info, routes and available updates
katax info
```

All generator commands are **interactive** (they ask questions with prompts). Run them from the project root.

## Commands

| Command | Aliases | What it does |
|---|---|---|
| `katax init [name]` | | Create a new project |
| `katax add endpoint <name>` | | Add one resource with the HTTP methods you choose |
| `katax generate crud <name>` | `gen`, `g` | Add a CRUD resource (list, get, create, update, delete) |
| `katax generate repository <name>` | `gen`, `g` | Add a data-access class backed by katax-service-manager |
| `katax generate docs` | `gen`, `g` | Generate `src/openapi.json` + Swagger UI setup |
| `katax info` | `status`, `ls` | Show project info, routes and available updates |
| `katax deploy init/update/rollback/logs/status` | | PM2 deployment on an Ubuntu VPS |
| `katax fix docs/all/list` | | Patch existing projects |

### `katax init [project-name]`

Initialize a new Express API project with TypeScript and install its dependencies.

**Options:**
- `-f, --force` - Allow using an existing directory (files are overwritten, not deleted)
- `--pm <npm|pnpm>` - Default answer for the package-manager prompt (default: `pnpm`)
- `--ignore-scripts` - Default answer for "install with `--ignore-scripts`"
- `--write-npmrc` - Default answer for "write `.npmrc` with `ignore-scripts=true`"

The project name may only contain letters, numbers, `-` and `_`.

**Prompts:** description, database (PostgreSQL / MySQL / MongoDB / none) and its credentials, authentication (JWT / none), katax-core validation, Swagger/OpenAPI, katax-service-manager (if enabled: singleton or instance mode, registry by URL or callback, lifecycle hooks, Redis cache + credentials, WebSocket on a shared or separate port, peer dependencies to install), server port, git init, package manager, ignore scripts, auto-generated JWT secrets.

Generated projects pin the versions this CLI was tested with: `katax-core ^1.6.5` and `katax-service-manager ^0.6.0`. After creating the project the CLI tells you if newer versions are available.

```bash
katax init my-awesome-api
katax init my-awesome-api --pm npm --ignore-scripts --write-npmrc
```

### `katax add endpoint <name>`

Add a resource with validator, controller, handler and routes. Requires `katax-core` (offers to install it if missing).

**Prompts:** HTTP methods (all, or pick GET/POST/PUT/PATCH/DELETE), per-route rate limiter, and the body fields for POST/PUT/PATCH (name, type, required).

Generates `src/api/<name>/<name>.{validator,controller,handler,routes}.ts`, registers the router in `src/api/routes.ts` and regenerates `src/openapi.json`. Nested names create nested folders and routes: `admin/users` → `src/api/admin/users/` mounted at `/api/admin/users`. Names may only contain letters, numbers, `-`, `_` and `/`.

```bash
katax add endpoint users
katax add endpoint admin/users
```

> `-m, --method` and `-p, --path` are accepted but currently ignored: methods are chosen in the prompt and the route path comes from the name.

### `katax generate crud <resource-name>`

Same files as `add endpoint`, with the CRUD routes you select:

| Route | Action |
|---|---|
| `GET /api/<name>` | list (query: `page`, `limit`, `search`) |
| `GET /api/<name>/:id` | get by id |
| `POST /api/<name>` | create |
| `PUT` / `PATCH /api/<name>/:id` | update |
| `DELETE /api/<name>/:id` | delete |

**Options:**
- `--no-auth` - Default answer "no" for the authentication prompt

Authentication uses `authenticateToken` from `src/shared/jwt.utils.ts`, which exists only if the project was created with JWT. Without it, the routes are generated without authentication and the CLI warns you.

The generated controllers return **sample data with `TODO` comments**: connect them to your database (for example with `katax generate repository`).

```bash
katax generate crud products
katax g crud admin/products --no-auth
```

### `katax generate repository <name>`

Generate `src/api/<name>/<name>.repository.ts`, a class that uses a connection created with `katax.database()` (katax-service-manager).

**Prompts:** database type (detected from `package.json`), id type (`string` / `number`), katax connection name (default `main`), table or collection name.

Methods: `findAll()`, `findById()`, `exists()`, `create()`, `update()`, `delete()` (parameterized SQL for PostgreSQL/MySQL, driver calls for MongoDB).

```bash
katax generate repository products
```

### `katax generate docs`

Scan `src/api/` and write an OpenAPI **3.0** spec to `src/openapi.json`, plus `src/config/swagger.config.ts` (Swagger UI at `/docs` and `/api-docs`, raw spec at `/openapi.json`). `add endpoint` and `generate crud` already regenerate the spec automatically.

**Options:**
- `-f, --force` - Overwrite an existing Swagger setup
- `-o, --output <path>` - Output path (default: `src/openapi.json`)
- `-p, --port <port>` - Port for the local server URL (default: `PORT` from `.env`, then `3000`)
- `-u, --url <url>` - Production server URL (default: `API_URL` or `PRODUCTION_URL` from `.env`)

Request schemas are read from the `katax-core` validators by static analysis, so they include field types and basic rules (`min`, `max`, `minLength`, `maxLength`). Route descriptions come from the `@desc` comments in `*.routes.ts`.

```bash
katax generate docs
katax generate docs -f -p 4000 -u https://api.example.com
```

> **Production:** the default `build` script (`tsc`) does not copy `src/openapi.json` to `dist/`, so `/docs` is empty in production. Run `katax fix docs` once in the project to add the copy step.

### `katax info`

Show the project name and version, the installed `katax-core` / `katax-service-manager` versions (and whether updates exist), and the routes found in `src/api/`.

### `katax deploy ...`

Deploy and manage the API with [PM2](https://pm2.keymetrics.io/) on an Ubuntu VPS. Requires PM2 installed globally (`npm install -g pm2`). The app name is stored in `.katax-deploy.json`; `-a, --app-name` overrides it.

| Command | What it does | Options |
|---|---|---|
| `katax deploy init` | Asks for app name, repo URL (HTTPS/SSH), branch, install path, instances, max memory and env vars; clones, runs `npm install`, builds, writes `ecosystem.config.cjs` and starts with PM2 | |
| `katax deploy update` | `git fetch` + `pull` (or `reset --hard` with `--hard`), `npm install`, build, `pm2 restart` | `-b, --branch`, `--hard`, `-a, --app-name` |
| `katax deploy rollback` | `git reset --hard HEAD~N`, reinstall, rebuild, restart | `-c, --commits <n>` (default 1), `-a` |
| `katax deploy logs` | `pm2 logs` | `-l, --lines <n>`, `-f, --follow`, `-a` |
| `katax deploy status` | `pm2 list` | |

Run `update`, `rollback` and `logs` from inside the deployed project folder.

- Environment variables entered in `deploy init` are written to `ecosystem.config.cjs` (`env_production`) in the deployed folder.
- `deploy init` defaults to cluster mode with `max` instances. With WebSockets (Socket.IO needs sticky sessions) or the in-memory rate limiter, choose `1 instance`.

```bash
katax deploy init
katax deploy update --hard -b main
katax deploy logs -f
katax deploy rollback -c 2
```

### `katax fix ...`

| Command | What it does |
|---|---|
| `katax fix docs` | Makes `npm run build` copy `src/openapi.json` to `dist/` (adds `copyfiles`) so `/docs` works in production |
| `katax fix all` | Applies every available fix |
| `katax fix list` | Lists available fixes |

`--skip-install` skips the `npm install` after patching.

## Global Options

- `--no-color` - Disable colored output
- `--verbose` - Enable verbose logging
- `-v, --version` - Show version

## Generated Project

```
my-api/
├── src/
│   ├── index.ts                  # Entry point (katax.init() or dotenv + app.listen)
│   ├── app.ts                    # Express: helmet, cors, cookie-parser, rate limit, 1mb JSON limit
│   ├── api/
│   │   ├── routes.ts             # Main router, mounted at /api
│   │   ├── health/health.handler.ts   # GET /api/health
│   │   └── hello/                # Example endpoint: GET /api/hello?name=
│   ├── config/
│   │   ├── cors.config.ts        # ALLOWED_ORIGINS
│   │   ├── env.validator.ts
│   │   ├── swagger.config.ts     # If Swagger enabled
│   │   └── katax.instance.ts     # If katax-service-manager in "instance" mode
│   ├── middleware/
│   │   ├── error.middleware.ts
│   │   ├── logger.middleware.ts
│   │   ├── api-key.middleware.ts
│   │   └── rate-limit.middleware.ts   # Added when you enable a per-route limiter
│   ├── shared/
│   │   ├── api.utils.ts          # If katax-core: responses, validation, cookies
│   │   ├── stream.utils.ts       # SSE and streaming helpers
│   │   ├── auth.utils.ts         # If JWT: hashing, tokens, crypto helpers
│   │   ├── jwt.utils.ts          # If JWT: tokens + authenticateToken / requireRole middleware
│   │   └── logger.utils.ts       # Pino logger (only without katax-service-manager)
│   ├── database/connection.ts    # Only with a database and without katax-service-manager
│   └── openapi.json              # If Swagger enabled
├── ecosystem.config.cjs          # PM2
├── .env / .env.example
├── .gitignore / .gitattributes   # LF line endings for Linux deploys
├── package.json / tsconfig.json
└── README.md
```

With katax-service-manager, the logger and the database, Redis and WebSocket connections are created in `src/index.ts` through `katax` instead of `logger.utils.ts` / `database/connection.ts`.

> Review `.env.example` before committing: it is generated with the same values as `.env`, including database passwords and generated JWT secrets.

### Files for each endpoint

```
src/api/<name>/
├── <name>.validator.ts     # katax-core schemas + validate* functions
├── <name>.controller.ts    # Business logic (returns ControllerResult)
├── <name>.handler.ts       # Express handlers (sendResponse)
├── <name>.routes.ts        # Express router
└── <name>.repository.ts    # Only with `katax generate repository`
```

## Shared Utilities

### `shared/api.utils.ts`

```typescript
interface ControllerResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  details?: unknown;
  statusCode?: number;
  cookies?: ResponseCookie[];
  // pagination (copied to the response when present)
  currentPage?: number; totalPages?: number; totalItems?: number; totalCount?: number; hasMorePages?: boolean;
}

createResponse.success(message, data?, statusCode = 200, pagination?, cookies?)
createResponse.error(message, error?, statusCode?, details?)
createResponse.unauthorized(...), createResponse.forbidden(...)
createResponse.validation(errors, message?)
createResponse.custom(result)
createSuccessResult(...), createErrorResult(...)

validateSchema<T>(schema, data): Promise<ValidationResult<T>>   // works with sync and async schemas
sendResponse(req, res, validator, controller, options?)          // validate -> controller -> JSON response
setCookie(res, name, value, options?), clearCookie(res, name, options?)
```

Responses have the shape `{ success, message, error?, data?, ...pagination }`. Validation errors return **422** with a list of `{ field, message }`.

### `shared/stream.utils.ts`

```typescript
initSSE(res)
sendSSEEvent(res, event, data)
sendSSEComment(res, comment = 'ping')
closeSSE(res)

class SSEStream {             // keep-alive and cleanup when the client disconnects
  constructor(res, ...)
  send(data, event?, id?)
  sendError(error)
  close()
  isClosed()
}

sendChunked(res, data)
streamAsyncIterator(res, iterable, event?)
streamArray(res, array, event?)
```

### `shared/jwt.utils.ts` (JWT enabled)

- `generateAccessToken(payload)` / `generateRefreshToken(payload)` / `generateTokens(payload)` - use `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- `verifyAccessToken(token)` / `verifyRefreshToken(token)` - payload or `null`
- `decodeToken(token)` - decode without verifying
- `authenticateToken` - Express middleware (`Authorization: Bearer <token>`)
- `requireRole(...roles)` - Express middleware

### `shared/auth.utils.ts` (JWT enabled)

- `hashPassword(password, saltRounds = 12)` / `verifyPassword(password, hash)` - bcryptjs
- `hashPasswordArgon2(password)` / `verifyPasswordArgon2(password, hash)` - requires `npm install argon2`
- `generateToken(payload, secret, options?)`, `verifyToken<T>(token, secret)`, `decodeToken<T>(token)`, `generateRefreshToken(payload, secret, expiresIn = '30d')`
- `generateRandomToken(length?)`, `generateNumericCode(digits?)`
- `sha256(data)`, `md5(data)`
- `encrypt(text, secretKey)` / `decrypt(encryptedData, secretKey)` - AES-256-GCM
- `secureCompare(a, b)` - constant-time comparison

## Generated Code Examples

### Validator

```typescript
import { k, kataxInfer } from 'katax-core';
import { validateSchema, ValidationResult } from '../../shared/api.utils.js';

export const createProductsSchema = k.object({
  title: k.string().minLength(2),
  price: k.number().optional(),
  email: k.string().email()
});

export type CreateProductsData = kataxInfer<typeof createProductsSchema>;

export async function validateProductsCreate(data: unknown): Promise<ValidationResult<CreateProductsData>> {
  return validateSchema(createProductsSchema, data);
}
```

### Handler

```typescript
import { Request, Response } from 'express';
import { sendResponse } from '../../shared/api.utils.js';
import { createProducts } from './products.controller.js';
import { validateProductsCreate } from './products.validator.js';

export async function createProductsHandler(req: Request, res: Response): Promise<void> {
  await sendResponse(
    req,
    res,
    () => validateProductsCreate(req.body),
    (validData) => createProducts(validData)
  );
}
```

### Routes

```typescript
import { Router } from 'express';
import { createProductsHandler } from './products.handler.js';
import { authenticateToken } from '../../shared/jwt.utils.js';

const router = Router();

/**
 * @route POST /api/products
 * @desc Create new products
 */
router.post('/', authenticateToken, createProductsHandler);

export default router;
```

## Scripts in the Generated Project

```bash
npm run dev     # nodemon + tsx (hot reload)
npm run build   # tsc
npm start       # node dist/index.js
```

## Katax Ecosystem

| Package | npm | GitHub |
|---------|-----|--------|
| **katax-core** | [npm](https://www.npmjs.com/package/katax-core) | [GitHub](https://github.com/LOPIN6FARRIER/katax-core) |
| **katax-service-manager** | [npm](https://www.npmjs.com/package/katax-service-manager) | [GitHub](https://github.com/LOPIN6FARRIER/katax-service-manager) |
| **katax-cli** | [npm](https://www.npmjs.com/package/katax-cli) | [GitHub](https://github.com/LOPIN6FARRIER/katax-cli) |

## License

MIT © Vinicio Esparza
