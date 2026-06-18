---
name: katax-cli
description: 'CLI tool to generate Express APIs with TypeScript and katax-core validation. Use when: scaffolding new API projects, generating CRUD endpoints, adding validators/controllers/handlers/routes, deploying to VPS with PM2, managing katax-based project structure.'
argument-hint: 'What katax-cli task? (init/add/generate/deploy/fix/info)'
---

# katax-cli — Project & Endpoint Generator

CLI tool for scaffolding Express + TypeScript REST APIs with katax-core validation, and managing VPS deployments via PM2.

**Version: 1.4.4** | `npm install -g katax-cli`

## Commands

### `katax init [project-name]`

Scaffolds a complete Express + TypeScript + katax-core API project.

| Flag | Description |
|------|-------------|
| `-f, --force` | Overwrite existing directory |
| `--pm <npm\|pnpm>` | Package manager (default: pnpm) |
| `--ignore-scripts` | Disable lifecycle scripts |
| `--write-npmrc` | Write `.npmrc` |

Interactive prompts: project name/description, database (PostgreSQL/MySQL/MongoDB/None), auth (JWT/None), validation (katax-core/None), Swagger/OpenAPI, katax-service-manager mode (singleton/instance), registry, hooks, Redis, WebSocket, port, git init.

### `katax add endpoint <name>`

Scaffolds validator, controller, handler, routes.

| Flag | Description |
|------|-------------|
| `-m, --method <method>` | HTTP method (GET, POST, PUT, PATCH, DELETE) |
| `-p, --path <path>` | Custom route path |

Auto-updates main router + regenerates OpenAPI docs.

### `katax generate crud <resource-name>`

Full CRUD (list, get, create, update, delete).

| Flag | Description |
|------|-------------|
| `--no-auth` | Skip auth middleware |

### `katax generate repository <name>`

Typed data access layer: `findAll()`, `findById()`, `create()`, `update()`, `delete()`. Uses `ISqlDatabase` / `IMongoDatabase`.

### `katax generate docs`

| Flag | Description |
|------|-------------|
| `-f, --force` | Force regenerate |
| `-o, --output <path>` | Custom output path |
| `-p, --port <port>` | Server port |
| `-u, --url <url>` | Production URL |

Generates OpenAPI 3.0 + Swagger UI at `/docs` and `/api-docs`.

### `katax info`

Aliases: `status`, `ls`. Shows project structure and routes.

## Deploy (PM2 on Ubuntu VPS)

```bash
katax deploy init      # First-time setup
katax deploy update    # Pull + rebuild + restart
  -b, --branch <b>     --hard           -a, --app-name <n>
katax deploy rollback  # Revert commits
  -c, --commits <n>    -a, --app-name <n>
katax deploy logs      # View logs
  -l, --lines <n>      -f, --follow     -a, --app-name <n>
katax deploy status    # PM2 apps status
```

## Fix

```bash
katax fix docs  --skip-install    # Copy openapi.json on build
katax fix all   --skip-install    # All available fixes
katax fix list                    # List patches
```

## Global Options

`--no-color` `--verbose` `-v, --version`

## Code Generators

| Generator | Output |
|-----------|--------|
| **Validator** | `k.object()` schemas, async validators, inference |
| **Controller** | `ControllerResult<T>`, success/error results |
| **Handler** | Express middleware, validator + controller chain |
| **Route** | Express Router with JSDoc |
| **Router Updater** | AST-based, no duplicates |
| **OpenAPI** | Scans validators/routes → OpenAPI 3.0 |

## Templates

| Template | Features |
|----------|----------|
| **Auth** | bcrypt/argon2, JWT, refresh tokens, crypto |
| **Stream** | SSE: `initSSE()`, `sendSSEEvent()`, `SSEStream` |
| **Response** | `sendSuccess<T>()`, `sendError()`, `sendResult()` |
| **Test** | Repository/controller stubs with mocks |
| **Controller** | Class-based, DI, `Result<T,E>` |

## Utilities

| Utility | Methods |
|---------|---------|
| **CodeBuilder** | `line()`, `raw()`, `import()`, `export()`, `comment()`, `section()`, `openBlock()`, `closeBlock()`, `build()` |
| **File Utils** | `renderTemplate()`, `copyTemplate()`, `writeFile()`, `ensureDir()`, `toPascalCase()`, `toCamelCase()`, `toKebabCase()` |
| **Logger** | `success()`, `error()`, `warning()`, `info()`, `gray()`, `title()` |

## Generated Architecture

```
src/
├── api/               # validators/ controllers/ handlers/ routes/
├── config/            # env config
├── middleware/        # auth, errors, logging
├── shared/            # response utils, stream utils
├── database/          # migrations, repositories
├── core/              # Result<T,E>, errors
├── app.ts
└── index.ts
```

## Common Patterns

- Nested resources (`admin/users`) keep relative imports correct
- `init` defaults to pnpm
- Architecture: `validator → controller → handler → routes`
- Repositories use typed `ISqlDatabase` / `IMongoDatabase`
- OpenAPI auto-generated from validators
- Deploy uses `.katax-deploy.json` for persistent config
