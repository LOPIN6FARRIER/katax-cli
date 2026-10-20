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
katax init my-api                      # Express + TypeScript + katax-core + katax-service-manager
cd my-api && pnpm dev                  # prints the endpoint map; docs at /docs

katax add endpoint habits --fields "name:string, note:text?, starts_on:date"
katax add endpoint habits/:habitId/reminders --fields "remind_at:string"
katax add endpoint news --public --methods list,get
```

## Commands

### `katax init [project-name]`

Creates the project and installs dependencies. Options: `-f/--force`, `--pm npm|pnpm`, `--ignore-scripts`,
`--write-npmrc`, `--no-install`.

Prompts: description, database (PostgreSQL or none), Redis, authentication (JWT or none), WebSocket (same port
or a separate one), Katax registry, lifecycle hooks, **print the endpoint map at startup**, port, git, package
manager.

Always included (no prompt): katax-core validation, katax-service-manager (singleton), OpenAPI 3.1 docs at
`/docs`, the shared utilities every resource uses, and the public error contract.

- `.env` gets real values (generated JWT secrets); `.env.example` only placeholders (commit this one).
- `index.ts` loads `.env` first (`import 'dotenv/config'`), connects PostgreSQL/Redis/Socket.IO as chosen and,
  if you said yes, prints the endpoint map with `printStartupRoutes()` (otherwise the helper is generated but
  not called).
- `app.ts`: async-errors patch, `trust proxy`, Helmet, CORS from `ALLOWED_ORIGINS`, `/api` rate limit,
  `mountApiDocs()`, `/api` 404 and the error middleware.
- `api/routes.ts`: public routes, then `router.use(requireAuth)` (JWT projects); private routers go after it.

### `katax add endpoint <path>`

Same command: `katax gen endpoint <path>` (also `katax gen crud`). In a terminal, it asks what you didn't pass:
a checklist of operations (all selected) when `--methods` is missing, and the fields when `--fields` is missing.
`--no-interactive` skips the questions (all operations, `name:string`).

```bash
katax add endpoint habits                                   # /api/habits
katax add endpoint admin/users --id number                  # /api/admin/users
katax add endpoint habits/:habitId/reminders                # sub-resource (mergeParams)
katax add endpoint products --fields "name:string, price:number?, status:enum(draft|active)" --methods list,get,create
katax add endpoint health-check --public --no-repository --dry-run
```

**Naming.** The last segment is the resource in plural; the singular is computed (`habits` → `listHabits`,
`getHabit`, `createHabit`, `updateHabit`, `deleteHabit`, `HabitRow`, `habitsRouter`). The prefix (`admin/`) only
changes the folder and URL. Fix a wrong singular with `--singular`.

| Option | Default | |
|---|---|---|
| `--methods <list>` | `list,get,create,update,delete` | `update` is PATCH |
| `--id <type>` | `uuid` | `uuid`, `number` (coerced from the URL) or `string` |
| `--fields <spec>` | asks (TTY) or `name:string` | `name:type`, `?` = optional (`.nullish()`, nullable column, clearable on update) |
| `--table <name>` | snake_case of the resource | SQL table |
| `--singular <name>` | computed | e.g. `--singular person` |
| `--public` | private | mounted before `requireAuth`; no `userId`, no ownership checks |
| `--no-repository` | | no repository/table; controllers return 501 until you implement them |
| `--no-interactive` | | never prompt |
| `-d, --dry-run` | | print what would change |
| `-f, --force` | | overwrite existing resource files |

Field types: `string`, `text`, `int`, `number`, `boolean`, `date` (`YYYY-MM-DD` string), `datetime`, `email`,
`uuid`, `enum(a|b)`.

**What it writes**

```
src/api/<path>/
├── <r>.validator.ts    # schemas with .describe(), k.coerce query, .nullish() + *_CLEARABLE, inferred types, validate*
├── <r>.types.ts        # view, list result, repository params and filters
├── <r>.repository.ts   # the only file with SQL: column list, ::text dates, only-defined-keys UPDATE
├── <r>.controller.ts   # (userId, input) -> ControllerResult; ownership check (404), toSafeErrorResult
├── <r>.handler.ts      # one sendResponse() per route
└── <r>.routes.ts       # routes with docs({ summary, params, query, body }) for OpenAPI
src/types/db.types.ts   # + <Singular>Row
src/api/routes.ts       # import + mount (after requireAuth, or before it with --public)
migrations/NNNN_create_<table>.sql
```

Sub-resources (`habits/:habitId/reminders`) validate the parent id, check that the parent belongs to the user,
use `Router({ mergeParams: true })` and reference the parent table in the migration (the parent's id type is
read from its row type). Missing shared files (`api.utils`, `errors.utils`, `null.utils`, `db.ts`,
`openapi.utils`...) and `auth.middleware.ts` are created; existing ones are never overwritten.

The generated SQL targets PostgreSQL.

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

## API docs (OpenAPI 3.1)

There is no generation step. Each route declares its docs next to the handler:

```ts
router.post('/', docs({ summary: 'Create a habit', body: createHabitSchema }), createHabitHandler);
```

At runtime `mountApiDocs()` walks the router (the same walker that prints the endpoint map), turns the
katax-core schemas into JSON Schema with `toJsonSchema()` and serves `/openapi.json` + Swagger UI at `/docs`.
Private routes (after `requireAuth`) get `bearerAuth`; error responses follow the public error contract.

## Errors

Every error response has the same shape (`shared/errors.utils.ts`):

```json
{ "success": false, "message": "Status must be one of: draft, active, done.", "error": "VALIDATION_ERROR",
  "details": [{ "field": "status", "message": "Status must be one of: draft, active, done." }] }
```

Controllers `throw notFoundError('Habit')` / `conflictError(...)` for expected errors and end with
`catch (error) { return toSafeErrorResult(error, { context }) }`: database errors and bugs are logged and the
client gets a generic 500. A validator that fails (DB down) answers 500, not 422.

## Upgrading from 1.6

- `katax generate repository`, `katax generate docs` and `katax fix` were removed (repositories come with
  `add endpoint`; docs are built at runtime).
- `add endpoint` no longer prompts for auth: private by default, `--public` to opt out.
- Older projects: `add endpoint` creates the missing shared files, but an old `shared/api.utils.ts` must be
  updated by hand (it warns which exports are missing: `toSafeErrorResult`, `validateComposed`).

## Global Options

- `--no-color` - Disable colored output
- `--verbose` - Verbose logging
- `-v, --version` - Show version

## Development (this repo)

```bash
npm run dev        # tsx watch
npm test           # vitest
npm run typecheck
npm run build
```

## Katax Ecosystem

| Package | npm | GitHub |
|---------|-----|--------|
| **katax-core** | [npm](https://www.npmjs.com/package/katax-core) | [GitHub](https://github.com/LOPIN6FARRIER/katax-core) |
| **katax-service-manager** | [npm](https://www.npmjs.com/package/katax-service-manager) | [GitHub](https://github.com/LOPIN6FARRIER/katax-service-manager) |
| **katax-cli** | [npm](https://www.npmjs.com/package/katax-cli) | [GitHub](https://github.com/LOPIN6FARRIER/katax-cli) |

## License

MIT © Vinicio Esparza
