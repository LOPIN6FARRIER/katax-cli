# Katax CLI

[![npm version](https://img.shields.io/npm/v/katax-cli.svg)](https://www.npmjs.com/package/katax-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CLI tool to generate Express REST APIs with TypeScript and [katax-core](https://github.com/LOPIN6FARRIER/katax-core) validation.

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
# Create a new project
katax init my-api
cd my-api

# Add an endpoint
katax add endpoint users

# Generate CRUD
katax generate crud products

# View project structure
katax info
```

## Commands

### `katax init [project-name]`

Initialize a new Express API project with TypeScript.

**Options:**
- `-f, --force` - Overwrite existing directory
- `--pm <npm|pnpm>` - Package manager (default: pnpm)
- `--ignore-scripts` - Install with lifecycle scripts disabled
- `--write-npmrc` - Write `.npmrc` with `ignore-scripts=true`

Interactive prompts for: project description, database (PostgreSQL/MySQL/MongoDB/None), auth (JWT/None), katax-core validation, Swagger/OpenAPI, katax-service-manager, katax mode (Singleton/Instance), registry integration, registry mode (HTTP URL/Callback), lifecycle hooks, Redis cache, WebSocket, peer deps mode, WebSocket port, server port, git init, package manager, ignore scripts, DB credentials, Redis config, JWT secrets.

**Example:**
```bash
katax init my-awesome-api
katax init my-awesome-api --pm npm --ignore-scripts --write-npmrc
```

### `katax add endpoint <name>`

Add a new endpoint with validator, controller, handler, and routes.

**Options:**
- `-m, --method <method>` - HTTP method (GET, POST, PUT, PATCH, DELETE)
- `-p, --path <path>` - Route path

Interactive: choose methods (all or select), rate limiter, define fields (name, type, required).

Generates: `<name>.validator.ts`, `<name>.controller.ts`, `<name>.handler.ts`, `<name>.routes.ts`. Auto-updates main router and regenerates OpenAPI docs. Supports nested paths (e.g., `admin/users`).

**Example:**
```bash
katax add endpoint users -m POST -p /api/users
katax add endpoint admin/users
```

### `katax generate crud <resource-name>`

Aliases: `gen`, `g`

Generate complete CRUD (5 endpoints): list, get by ID, create, update, delete (plus PATCH if selected).

**Options:**
- `--no-auth` - Skip authentication middleware

**Example:**
```bash
katax generate crud products
```

### `katax generate repository <name>`

Aliases: `gen`, `g`

Generate data access layer. Detects DB type interactively.

Typed methods: `findAll()`, `findById()`, `exists()`, `create()`, `update()`, `delete()`. Uses `katax.db()` from katax-service-manager.

**Example:**
```bash
katax generate repository products
```

### `katax generate docs`

Aliases: `gen`, `g`

Generate OpenAPI 3.0 documentation.

**Options:**
- `-f, --force` - Force regenerate
- `-o, --output <path>` - Output path (default: src/openapi.json)
- `-p, --port <port>` - Server port
- `-u, --url <url>` - Production URL

Scans `src/api/`, generates OpenAPI JSON + Swagger UI config.

**Example:**
```bash
katax generate docs
katax generate docs -f -p 4000 -u https://api.example.com
```

### `katax info`

Aliases: `status`, `ls`

Show project structure, dependencies, and routes.

**Example:**
```bash
katax info
```

### `katax deploy init`

Initial PM2 deployment to Ubuntu VPS.

Interactive prompts: app name, repo (HTTPS/SSH), repo URL, branch, install path, instances, max memory, environment variables.

Clones repo, installs deps, builds, creates PM2 ecosystem config, starts with PM2.

**Example:**
```bash
katax deploy init
```

### `katax deploy update`

Pull changes and restart.

**Options:**
- `-b, --branch <branch>` - Branch to deploy
- `--hard` - Hard reset (discard local changes)
- `-a, --app-name <name>` - PM2 app name

**Example:**
```bash
katax deploy update
katax deploy update --hard -b main
```

### `katax deploy rollback`

Rollback to previous version.

**Options:**
- `-c, --commits <number>` - Number of commits (default: 1)
- `-a, --app-name <name>` - PM2 app name

**Example:**
```bash
katax deploy rollback -c 2
```

### `katax deploy logs`

View PM2 logs.

**Options:**
- `-l, --lines <number>` - Number of lines
- `-f, --follow` - Follow mode
- `-a, --app-name <name>` - PM2 app name

**Example:**
```bash
katax deploy logs -f
```

### `katax deploy status`

Show PM2 apps status.

**Example:**
```bash
katax deploy status
```

### `katax fix docs`

Fix API documentation for production (copy openapi.json during build).

**Options:**
- `--skip-install` - Skip npm install

### `katax fix all`

Apply all available fixes.

### `katax fix list`

List available fixes.

## Global Options

- `--no-color` - Disable colored output
- `--verbose` - Enable verbose logging
- `-v, --version` - Show version

## Generated Project Structure

```
my-api/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Express app with middleware
│   ├── api/
│   │   ├── routes.ts         # Main router
│   │   ├── hello/            # Example hello endpoint
│   │   └── health/           # Health check
│   ├── config/
│   │   ├── cors.config.ts
│   │   ├── env.validator.ts
│   │   └── swagger.config.ts # If Swagger enabled
│   ├── middleware/
│   │   ├── error.middleware.ts
│   │   └── logger.middleware.ts
│   ├── shared/
│   │   ├── api.utils.ts
│   │   ├── response.utils.ts
│   │   ├── stream.utils.ts
│   │   ├── auth.utils.ts     # If JWT: password hashing, JWT, crypto
│   │   └── jwt.utils.ts      # If JWT: token generation/verification
│   ├── database/
│   │   └── connection.ts     # If DB selected
│   └── core/
│       ├── result.ts         # Result<T, E> pattern
│       └── errors.ts         # AppError hierarchy
├── package.json
├── tsconfig.json
├── .env / .env.example
└── openapi.json              # If Swagger enabled
```

## Generated Files for Each Endpoint

```
src/api/<resource>/
├── <name>.validator.ts     # katax-core schemas
├── <name>.controller.ts    # Business logic
├── <name>.handler.ts       # Express handlers
└── <name>.routes.ts        # Express router
```

## Shared Utilities

### response.utils.ts

```typescript
sendSuccess<T>(res, data, status?)
sendError(res, message, status?)
sendValidationError(res, issues)
sendResult<T, E>(res, result, successStatus?)
sendResponse(req, res, { validator, controller, dataSource, successStatus })
```

### stream.utils.ts

```typescript
initSSE(res)
sendSSEEvent(res, event, data)
sendSSEComment(res, comment)
closeSSE(res)

class SSEStream {
  constructor(res)
  send(event, data)
  comment(msg)
  close()
}

sendChunked(res, data)
streamAsyncIterator(res, iterable, event?)
streamArray(res, array, event?)
```

### api.utils.ts

```typescript
type ControllerResult<T> = { success: true; message: string; data: T; statusCode: number }
  | { success: false; error: string; statusCode: number; details?: unknown }

createSuccessResult(message, data?, extra?, statusCode?)
createErrorResult(error, statusCode?, details?)
validateSchema(schema, data)
sendResponse(req, res, { validator, controller, dataSource })
```

### core/result.ts - Result Pattern

```typescript
ok<T, E>(value): Result<T, E>
err<T, E>(error): Result<T, E>
isOk(result), isErr(result)
map(result, fn), mapErr(result, fn), flatMap(result, fn)
unwrap(result), unwrapOr(result, default), unwrapOrElse(result, fn)
tryCatch(fn), tryCatchAsync(fn)
combine(results)
match(result, onOk, onErr)
```

### core/errors.ts - Error Hierarchy

```typescript
AppError (base)
  ValidationError (400)
  AuthenticationError (401)
  AuthorizationError (403)
  NotFoundError (404)
  ConflictError (409)
  DatabaseError (500)
  ExternalServiceError (503)
  InternalServerError (500)
  BadRequestError (400)

isAppError(error): boolean
toAppError(error, defaultStatus?): AppError
```

### JWT Auth Utilities (when auth enabled)

- `hashPassword(password)` - Hash with bcrypt
- `hashPasswordArgon2(password)` - Hash with argon2
- `verifyPassword(password, hash)` - Verify password
- `generateAccessToken(payload)` - Generate JWT access token
- `generateRefreshToken(payload)` - Generate JWT refresh token
- `verifyAccessToken(token)` - Verify and decode access token
- `authenticateToken` - Express middleware for auth
- `requireRole(...roles)` - Express middleware for role-based access

## Examples

### Initialize and deploy a complete API

```bash
# Create project
katax init my-api
cd my-api

# Add resources
katax add endpoint users
katax generate crud products
katax generate repository products

# Generate API docs
katax generate docs

# View project info
katax info

# Deploy to production
katax deploy init

# Update deployment
katax deploy update

# View logs
katax deploy logs -f

# Rollback if needed
katax deploy rollback -c 1
```

### Generated handler example

```typescript
import { Request, Response } from 'express';
import { validateUser } from './users.validator.js';
import { createUser } from './users.controller.js';
import { sendResponse } from '../../shared/response.utils.js';

export async function createUserHandler(req: Request, res: Response): Promise<void> {
  await sendResponse(req, res, {
    validator: validateUser,
    controller: (data) => createUser(data),
    dataSource: 'body',
    successStatus: 201
  });
}
```

### Generated validator example

```typescript
import { k, kataxInfer } from 'katax-core';

export const userSchema = k.object({
  username: k.string()
    .minLength(3, 'Username must be at least 3 characters')
    .maxLength(50, 'Username cannot exceed 50 characters'),
  email: k.string().email('Must be a valid email'),
  age: k.number().min(0, 'Age must be positive').optional()
});

export type UserData = kataxInfer<typeof userSchema>;

export async function validateUser(data: unknown) {
  return await userSchema.safeParse(data);
}
```

## Development

```bash
npm run dev    # Development server with hot reload
npm run build  # Build for production
npm start      # Start production server
```

## Katax Ecosystem

| Package | npm | GitHub |
|---------|-----|--------|
| **katax-core** | [npm](https://www.npmjs.com/package/katax-core) | [GitHub](https://github.com/LOPIN6FARRIER/katax-core) |
| **katax-service-manager** | [npm](https://www.npmjs.com/package/katax-service-manager) | [GitHub](https://github.com/LOPIN6FARRIER/katax-service-manager) |
| **katax-cli** | [npm](https://www.npmjs.com/package/katax-cli) | [GitHub](https://github.com/LOPIN6FARRIER/katax-cli) |

## License

MIT © Vinicio Esparza
