# Katax CLI

[![npm version](https://img.shields.io/npm/v/katax-cli.svg)](https://www.npmjs.com/package/katax-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🚀 CLI tool to generate Express REST APIs with TypeScript and [katax-core](https://github.com/LOPIN6FARRIER/katax-core) validation.

## ✨ Features

- 🎯 **Quick API Setup** - Initialize Express + TypeScript projects in seconds
- ✅ **Built-in Validation** - Integrates katax-core for type-safe schema validation
- 🔧 **Code Generation** - Generate endpoints, CRUD operations, and routes
- 📦 **Database Support** - PostgreSQL, MySQL, MongoDB, or none
- 🔐 **JWT Authentication** - Optional JWT auth scaffolding
- 🚀 **PM2 Deployment** - Deploy to Ubuntu VPS with PM2 integration
- 📝 **TypeScript First** - Full type safety and IntelliSense support
- 🎨 **Interactive CLI** - Beautiful prompts and feedback

## 📦 Installation

```bash
# Global installation
npm install -g katax-cli

# Or use with npx (no installation needed)
npx katax-cli init my-api
```

## 🚀 Quick Start

### 1. Create a New API Project

```bash
katax init my-api
```

This will:
- Create project structure
- Setup TypeScript + Express
- Install dependencies
- Configure katax-core validation
- Add database connection (optional)
- Setup JWT authentication (optional)

### 2. Add an Endpoint

```bash
cd my-api
katax add endpoint users
```

Interactive prompts will guide you through:
- HTTP method (GET, POST, PUT, DELETE)
- Route path
- Request fields and validation rules
- Async validators (unique checks, etc.)

This generates:
- `users.validator.ts` - katax-core validation schemas
- `users.controller.ts` - Business logic
- `users.handler.ts` - Express handlers with sendResponse
- `users.routes.ts` - Express routes
- Updates main router automatically

### 3. Generate CRUD Resource

```bash
katax generate crud products
```

Creates a complete CRUD API with 5 endpoints:
- `GET /api/products` - List all
- `GET /api/products/:id` - Get one
- `POST /api/products` - Create
- `PUT /api/products/:id` - Update
- `DELETE /api/products/:id` - Delete

### 4. Deploy to Ubuntu VPS with PM2

```bash
# On your Ubuntu VPS
katax deploy init

# When you have updates
katax deploy update

# Monitor your app
katax deploy status
katax deploy logs -f
```

See [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) for complete deployment documentation.

## 📖 Commands

### `katax init [project-name]`

Initialize a new Express API project.

**Options:**
- `-f, --force` - Overwrite existing directory

**Example:**
```bash
katax init my-awesome-api
```

### `katax add endpoint <name>`

Add a new endpoint with validation.

**Options:**
- `-m, --method <method>` - HTTP method (GET, POST, PUT, DELETE)
- `-p, --path <path>` - Route path

**Example:**
```bash
katax add endpoint users -m POST -p /api/users
```

### `katax generate crud <resource-name>`

Generate a complete CRUD resource.

**Options:**
- `--no-auth` - Skip authentication middleware

**Example:**
```bash
katax generate crud products
```

### `katax info`

Show current project structure and routes.

**Aliases:** `status`, `ls`

**Example:**
```bash
katax info
```

### `katax deploy init`

Initial deployment to Ubuntu VPS - Clone repo and setup PM2.

**Example:**
```bash
katax deploy init
```

### `katax deploy update`

Update existing deployment - Pull changes and restart.

**Options:**
- `-b, --branch <branch>` - Branch to deploy
- `--hard` - Hard reset (discard local changes)

**Example:**
```bash
katax deploy update --hard
```

### `katax deploy rollback`

Rollback to previous version.

**Options:**
- `-c, --commits <number>` - Number of commits to rollback

**Example:**
```bash
katax deploy rollback -c 2
```

### `katax deploy logs`

View PM2 application logs.

**Options:**
- `-l, --lines <number>` - Number of lines to display
- `-f, --follow` - Follow log output

**Example:**
```bash
katax deploy logs -f
```

### `katax deploy status`

Show PM2 applications status.

**Example:**
```bash
katax deploy status
```

## 🎯 Generated Code Example

When you run `katax add endpoint users`, it generates:

**users.validator.ts:**
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

**users.handler.ts:**
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

## 🗂️ Project Structure

```
my-api/
├── src/
│   ├── index.ts              # Entry point
│   ├── routes/
│   │   ├── index.ts          # Main router
│   │   └── users/
│   │       ├── users.validator.ts
│   │       ├── users.controller.ts
│   │       ├── users.handler.ts
│   │       └── users.routes.ts
│   ├── shared/
│   │   ├── response.utils.ts  # sendResponse utilities
│   │   ├── api.utils.ts       # API utilities
│   │   └── jwt.utils.ts       # JWT utilities (optional)
│   ├── database/
│   │   └── connection.ts      # Database connection
│   └── config/
│       └── di-container.ts    # Dependency injection
├── package.json
├── tsconfig.json
├── ecosystem.config.cjs       # PM2 configuration (after deploy)
└── .env
```

## 🔧 Development

Run development server:

```bash
npm run dev
```

Build and start:

```bash
npm run build
npm start
```

## 🚀 Deployment Workflow

1. **Develop locally** - `katax init` + `katax add endpoint`
2. **Push to GitHub** - Commit and push your code
3. **SSH to VPS** - `ssh ubuntu@your-vps-ip`
4. **Initial deploy** - `katax deploy init`
5. **Make changes** - Update code, commit, push
6. **Redeploy** - `katax deploy update`

See [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) for detailed deployment instructions.

## 📚 Documentation

- [Deployment Guide](./DEPLOY_GUIDE.md) - Complete PM2 deployment workflow
- [katax-core](https://github.com/LOPIN6FARRIER/katax-core) - Validation library

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT © Vinicio Esparza

## 🔗 Links

- Repository: https://github.com/LOPIN6FARRIER/katax-cli
- katax-core: https://github.com/LOPIN6FARRIER/katax-core
- Issues: https://github.com/LOPIN6FARRIER/katax-cli/issues


Interactive prompts will guide you through:
- HTTP method (GET, POST, PUT, DELETE)
- Route path
- Request fields and validation rules
- Async validators (unique checks, etc.)

This generates:
- `users.validator.ts` - katax-core validation schemas
- `users.controller.ts` - Business logic
- `users.routes.ts` - Express routes
- Updates main router automatically

### 3. Generate CRUD Resource

```bash
katax generate crud products
```

Creates a complete CRUD API with 5 endpoints:
- `GET /api/products` - List all
- `GET /api/products/:id` - Get one
- `POST /api/products` - Create

### `katax init [project-name]`

Initialize a new Express API project.

**Options:**
- `-f, --force` - Overwrite existing directory
katax init my-awesome-api
```

### `katax add endpoint <name>`

Add a new endpoint with validation.

**Options:**
- `-m, --method <method>` - HTTP method (GET, POST, PUT, DELETE)

**Example:**
```bash
katax add endpoint users -m POST -p /api/users
```

### `katax generate crud <resource-name>`

Generate a complete CRUD resource.

**Options:**
- `--no-auth` - Skip authentication middleware

**Example:**
```bash
katax generate crud products
```

### `katax info`

Show current project structure and routes.

**Aliases:** `status`, `ls`

**Example:**
```bash
katax info
```

## 🎯 Generated Code Example

When you run `katax add endpoint users`, it generates:

**users.validator.ts:**
```typescript
import { k, kataxInfer } from 'katax-core';

export const usersSchema = k.object({
  username: k.string()
    .minLength(3, 'Username must be at least 3 characters')
    .maxLength(50, 'Username cannot exceed 50 characters'),
  email: k.string().email('Must be a valid email'),
  age: k.number().min(0, 'Age must be positive').optional()
});

export type UsersData = kataxInfer<typeof usersSchema>;

export async function validateUsers(data: unknown) {
  return await usersSchema.safeParse(data);
}
```

**users.controller.ts:**
```typescript
import { UsersData } from './users.validator.js';
import { ControllerResult, createSuccessResult } from '../../shared/api.utils.js';

export async function createUsers(data: UsersData): Promise<ControllerResult<any>> {
  try {
    // Your business logic here
    const newUser = { id: 1, ...data, createdAt: new Date() };
    return createSuccessResult('User created successfully', newUser, undefined, 201);
  } catch (error) {
    // Error handling
  }
}
```

**users.routes.ts:**
```typescript
import { Router } from 'express';
import { createUsers } from './users.controller.js';
# Katax CLI

[![npm version](https://img.shields.io/npm/v/katax-cli.svg)](https://www.npmjs.com/package/katax-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Katax CLI — generate Express REST APIs with TypeScript and katax-core validation.

## Features

- Quick project scaffolding (Express + TypeScript)
- katax-core integration for type-safe validation
- Generate endpoints, CRUD resources and routes
- Optional DB scaffolding (Postgres / MySQL / MongoDB)
- Optional JWT authentication

## Installation

```bash
# global
npm install -g katax-cli

# or run with npx
npx katax-cli init my-api
```

## Usage

- `katax init <name>` — initialize a new API project
- `katax add endpoint <name>` — add endpoint with validation
- `katax generate crud <resource>` — scaffold full CRUD
- `katax info` — show project structure and routes

## Development

Run development server:

```bash
npm run dev
```

Build and publish:

```bash
npm run build
npm publish
```

## Example generated files

- `users.validator.ts` — katax-core schema
- `users.controller.ts` — business logic
- `users.routes.ts` — express routes

## Links

- Repository: https://github.com/LOPIN6FARRIER/katax-cli
- katax-core: https://github.com/LOPIN6FARRIER/katax-core

---

MIT © Vinicio Esparza
