import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import fs from "fs/promises";
import { success, error, warning, gray, title, info } from "../utils/logger.js";
import {
  fileExists,
  writeFile,
  ensureDir,
  toPascalCase,
  toCamelCase,
} from "../utils/file-utils.js";
import { FieldConfig } from "../types/index.js";
import { autoRegenerateDocs } from "./generate-docs.js";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface GenerateCrudOptions {
  auth?: boolean;
}

export async function generateCrudCommand(
  resourceName: string,
  options: GenerateCrudOptions = {},
) {
  title(`🔧 Generate CRUD: ${resourceName}`);

  // Check if we're in a project
  if (!fileExists(path.join(process.cwd(), "package.json"))) {
    error("Not in a project directory!");
    gray("Run this command from your project root\n");
    process.exit(1);
  }

  // Ask which HTTP methods to generate
  const { methodChoice } = await inquirer.prompt([
    {
      type: "list",
      name: "methodChoice",
      message: "Which HTTP methods do you want to generate?",
      choices: [
        { name: "All CRUD (GET, POST, PUT, DELETE)", value: "all" },
        { name: "Select specific methods", value: "select" },
      ],
      default: "all",
    },
  ]);

  let selectedMethods: HttpMethod[] = ["GET", "POST", "PUT", "DELETE"];

  if (methodChoice === "select") {
    const { methods } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "methods",
        message: "Select HTTP methods:",
        choices: [
          { name: "GET (list + get by id)", value: "GET", checked: true },
          { name: "POST (create)", value: "POST", checked: true },
          { name: "PUT (full update)", value: "PUT", checked: false },
          { name: "PATCH (partial update)", value: "PATCH", checked: false },
          { name: "DELETE", value: "DELETE", checked: false },
        ],
        validate: (input: string[]) => {
          if (input.length === 0) {
            return "You must select at least one method";
          }
          return true;
        },
      },
    ]);
    selectedMethods = methods;
  }

  // Ask about authentication
  const { addAuth } = await inquirer.prompt([
    {
      type: "confirm",
      name: "addAuth",
      message: "Require authentication for endpoints?",
      default: options.auth !== false,
    },
  ]);

  // Collect fields
  info("\nDefine fields for the resource:");
  const fields: FieldConfig[] = [];
  let addingFields = true;

  while (addingFields) {
    const { fieldName } = await inquirer.prompt([
      {
        type: "input",
        name: "fieldName",
        message: "Field name (press Enter to finish):",
        validate: (input: string) => {
          if (input && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) {
            return "Field name must be a valid identifier";
          }
          return true;
        },
      },
    ]);

    if (!fieldName) {
      addingFields = false;
      break;
    }

    const fieldConfig = await inquirer.prompt([
      {
        type: "list",
        name: "type",
        message: `Type for "${fieldName}":`,
        choices: ["string", "number", "boolean", "date", "email"],
      },
      {
        type: "confirm",
        name: "required",
        message: "Required?",
        default: true,
      },
    ]);

    fields.push({
      name: fieldName,
      type: fieldConfig.type,
      required: fieldConfig.required,
      rules: [],
    });

    gray(`  ✓ Added field: ${fieldName} (${fieldConfig.type})`);
  }

  if (fields.length === 0) {
    warning("No fields defined. Adding default 'name' field.");
    fields.push({
      name: "name",
      type: "string",
      required: true,
      rules: [],
    });
  }

  const spinner = ora("Generating CRUD endpoints...").start();

  try {
    await generateCRUDFiles(resourceName, selectedMethods, fields, addAuth);
    spinner.succeed("CRUD endpoints generated");

    success(`\n✨ CRUD for "${resourceName}" created successfully!\n`);

    info("Generated files:");
    gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.validator.ts`);
    gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.controller.ts`);
    gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.handler.ts`);
    gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.routes.ts`);
    gray(`  Updated: src/api/routes.ts\n`);

    info("Generated endpoints:");
    selectedMethods.forEach((method) => {
      if (method === "GET") {
        gray(`  GET    /api/${resourceName.toLowerCase()}     - List all`);
        gray(`  GET    /api/${resourceName.toLowerCase()}/:id - Get by ID`);
      } else if (method === "POST") {
        gray(`  POST   /api/${resourceName.toLowerCase()}     - Create`);
      } else if (method === "PUT" || method === "PATCH") {
        gray(`  ${method.padEnd(6)} /api/${resourceName.toLowerCase()}/:id - Update`);
      } else if (method === "DELETE") {
        gray(`  DELETE /api/${resourceName.toLowerCase()}/:id - Delete`);
      }
    });
    console.log();

    if (addAuth) {
      warning("Remember to implement authentication middleware!\n");
    }

    await autoRegenerateDocs(process.cwd());
  } catch (err) {
    spinner.fail("Failed to generate CRUD");
    error(err instanceof Error ? err.message : "Unknown error");
    console.error(err);
    process.exit(1);
  }
}

async function generateCRUDFiles(
  name: string,
  methods: HttpMethod[],
  fields: FieldConfig[],
  addAuth: boolean,
): Promise<void> {
  const basePath = path.join(process.cwd(), "src", "api", name.toLowerCase());
  await ensureDir(basePath);

  const pascalName = toPascalCase(name);
  const camelName = toCamelCase(name);
  const lowerName = name.toLowerCase();

  // Generate all files
  await writeFile(
    path.join(basePath, `${lowerName}.validator.ts`),
    generateValidator(pascalName, camelName, methods, fields),
  );

  await writeFile(
    path.join(basePath, `${lowerName}.controller.ts`),
    generateController(pascalName, camelName, methods, fields),
  );

  await writeFile(
    path.join(basePath, `${lowerName}.handler.ts`),
    generateHandler(pascalName, camelName, lowerName, methods),
  );

  await writeFile(
    path.join(basePath, `${lowerName}.routes.ts`),
    generateRoutes(pascalName, camelName, lowerName, methods, addAuth),
  );

  // Update main router
  await updateMainRouter(name);
}

function generateValidator(
  pascalName: string,
  camelName: string,
  methods: HttpMethod[],
  fields: FieldConfig[],
): string {
  const lines: string[] = [
    "import { k, kataxInfer } from 'katax-core';",
    "import { validateSchema, ValidationResult } from '../../shared/api.utils.js';",
    "",
    "// ==================== SCHEMAS ====================",
    "",
  ];

  // ID params schema
  if (methods.some((m) => ["GET", "PUT", "PATCH", "DELETE"].includes(m))) {
    lines.push(
      "/**",
      ` * Schema for ${camelName} ID params`,
      " */",
      `export const ${camelName}IdSchema = k.object({`,
      "  id: k.string().minLength(1)",
      "});",
      "",
      `export type ${pascalName}IdParams = kataxInfer<typeof ${camelName}IdSchema>;`,
      "",
    );
  }

  // Query params schema for GET list
  if (methods.includes("GET")) {
    lines.push(
      "/**",
      ` * Schema for ${camelName} query params (list)`,
      " */",
      `export const ${camelName}QuerySchema = k.object({`,
      "  page: k.number().optional(),",
      "  limit: k.number().optional(),",
      "  search: k.string().optional()",
      "});",
      "",
      `export type ${pascalName}Query = kataxInfer<typeof ${camelName}QuerySchema>;`,
      "",
    );
  }

  // Create schema for POST
  if (methods.includes("POST")) {
    lines.push(
      "/**",
      ` * Schema for creating ${camelName}`,
      " */",
      `export const create${pascalName}Schema = k.object({`,
    );
    fields.forEach((field, i) => {
      let schema = field.type === "email" ? "k.string().email()" : `k.${field.type}()`;
      if (!field.required) schema += ".optional()";
      lines.push(`  ${field.name}: ${schema}${i < fields.length - 1 ? "," : ""}`);
    });
    lines.push(
      "});",
      "",
      `export type Create${pascalName}Data = kataxInfer<typeof create${pascalName}Schema>;`,
      "",
    );
  }

  // Update schema for PUT/PATCH
  if (methods.some((m) => ["PUT", "PATCH"].includes(m))) {
    lines.push(
      "/**",
      ` * Schema for updating ${camelName}`,
      " */",
      `export const update${pascalName}Schema = k.object({`,
    );
    fields.forEach((field, i) => {
      const schema = field.type === "email" ? "k.string().email().optional()" : `k.${field.type}().optional()`;
      lines.push(`  ${field.name}: ${schema}${i < fields.length - 1 ? "," : ""}`);
    });
    lines.push(
      "});",
      "",
      `export type Update${pascalName}Data = kataxInfer<typeof update${pascalName}Schema>;`,
      "",
    );
  }

  // Validate functions
  lines.push("// ==================== VALIDATORS ====================", "");

  if (methods.some((m) => ["GET", "PUT", "PATCH", "DELETE"].includes(m))) {
    lines.push(
      `export async function validate${pascalName}Id(data: unknown): Promise<ValidationResult<${pascalName}IdParams>> {`,
      `  return validateSchema<${pascalName}IdParams>(${camelName}IdSchema, data);`,
      "}",
      "",
    );
  }

  if (methods.includes("GET")) {
    lines.push(
      `export async function validate${pascalName}Query(data: unknown): Promise<ValidationResult<${pascalName}Query>> {`,
      `  return validateSchema<${pascalName}Query>(${camelName}QuerySchema, data);`,
      "}",
      "",
    );
  }

  if (methods.includes("POST")) {
    lines.push(
      `export async function validate${pascalName}Create(data: unknown): Promise<ValidationResult<Create${pascalName}Data>> {`,
      `  return validateSchema<Create${pascalName}Data>(create${pascalName}Schema, data);`,
      "}",
      "",
    );
  }

  if (methods.some((m) => ["PUT", "PATCH"].includes(m))) {
    lines.push(
      `export async function validate${pascalName}Update(data: unknown): Promise<ValidationResult<Update${pascalName}Data>> {`,
      `  return validateSchema<Update${pascalName}Data>(update${pascalName}Schema, data);`,
      "}",
      "",
    );
  }

  return lines.join("\n");
}

function generateController(
  pascalName: string,
  camelName: string,
  methods: HttpMethod[],
  fields: FieldConfig[],
): string {
  const lines: string[] = [
    "import { ControllerResult, createSuccessResult, createErrorResult } from '../../shared/api.utils.js';",
    "import { logger } from '../../shared/logger.utils.js';",
  ];

  // Import types
  const types: string[] = [];
  if (methods.includes("GET")) types.push(`${pascalName}Query`, `${pascalName}IdParams`);
  if (methods.includes("POST")) types.push(`Create${pascalName}Data`);
  if (methods.some((m) => ["PUT", "PATCH"].includes(m))) {
    types.push(`Update${pascalName}Data`);
    if (!types.includes(`${pascalName}IdParams`)) types.push(`${pascalName}IdParams`);
  }
  if (methods.includes("DELETE") && !types.includes(`${pascalName}IdParams`)) {
    types.push(`${pascalName}IdParams`);
  }

  if (types.length > 0) {
    lines.push(`import { ${types.join(", ")} } from './${camelName}.validator.js';`);
  }

  lines.push("", "// ==================== CONTROLLERS ====================", "");

  // GET list
  if (methods.includes("GET")) {
    lines.push(
      "/**",
      ` * List all ${camelName}s`,
      " */",
      `export async function list${pascalName}s(query: ${pascalName}Query): Promise<ControllerResult<any[]>> {`,
      "  try {",
      `    logger.debug({ message: 'Listing ${camelName}s', query });`,
      "",
      "    // TODO: Implement database query",
      `    const mock${pascalName}s = [`,
      `      { id: '1', ${fields.length > 0 ? `${fields[0].name}: 'Sample 1',` : ""} createdAt: new Date().toISOString() },`,
      `      { id: '2', ${fields.length > 0 ? `${fields[0].name}: 'Sample 2',` : ""} createdAt: new Date().toISOString() }`,
      "    ];",
      "",
      `    return createSuccessResult('${pascalName}s retrieved', mock${pascalName}s);`,
      "  } catch (error) {",
      `    logger.error({ message: 'Error listing ${camelName}s', err: error });`,
      `    return createErrorResult('Failed to list ${camelName}s', error instanceof Error ? error.message : 'Unknown error', 500);`,
      "  }",
      "}",
      "",
    );

    // GET by ID
    lines.push(
      "/**",
      ` * Get ${camelName} by ID`,
      " */",
      `export async function get${pascalName}(params: ${pascalName}IdParams): Promise<ControllerResult<any>> {`,
      "  try {",
      `    logger.debug({ message: 'Getting ${camelName}', id: params.id });`,
      "",
      "    // TODO: Implement database query",
      `    const mock${pascalName} = { id: params.id, ${fields.length > 0 ? `${fields[0].name}: 'Sample',` : ""} createdAt: new Date().toISOString() };`,
      "",
      `    return createSuccessResult('${pascalName} retrieved', mock${pascalName});`,
      "  } catch (error) {",
      `    logger.error({ message: 'Error getting ${camelName}', err: error });`,
      `    return createErrorResult('Failed to get ${camelName}', error instanceof Error ? error.message : 'Unknown error', 500);`,
      "  }",
      "}",
      "",
    );
  }

  // POST create
  if (methods.includes("POST")) {
    lines.push(
      "/**",
      ` * Create ${camelName}`,
      " */",
      `export async function create${pascalName}(data: Create${pascalName}Data): Promise<ControllerResult<any>> {`,
      "  try {",
      `    logger.debug({ message: 'Creating ${camelName}', data });`,
      "",
      "    // TODO: Implement database insertion",
      `    const new${pascalName} = { id: Math.random().toString(36).substr(2, 9), ...data, createdAt: new Date().toISOString() };`,
      "",
      `    return createSuccessResult('${pascalName} created', new${pascalName}, undefined, 201);`,
      "  } catch (error) {",
      `    logger.error({ message: 'Error creating ${camelName}', err: error });`,
      `    return createErrorResult('Failed to create ${camelName}', error instanceof Error ? error.message : 'Unknown error', 500);`,
      "  }",
      "}",
      "",
    );
  }

  // PUT/PATCH update
  if (methods.some((m) => ["PUT", "PATCH"].includes(m))) {
    lines.push(
      "/**",
      ` * Update ${camelName}`,
      " */",
      `export async function update${pascalName}(params: ${pascalName}IdParams, data: Update${pascalName}Data): Promise<ControllerResult<any>> {`,
      "  try {",
      `    logger.debug({ message: 'Updating ${camelName}', id: params.id, data });`,
      "",
      "    // TODO: Implement database update",
      `    const updated${pascalName} = { id: params.id, ...data, updatedAt: new Date().toISOString() };`,
      "",
      `    return createSuccessResult('${pascalName} updated', updated${pascalName});`,
      "  } catch (error) {",
      `    logger.error({ message: 'Error updating ${camelName}', err: error });`,
      `    return createErrorResult('Failed to update ${camelName}', error instanceof Error ? error.message : 'Unknown error', 500);`,
      "  }",
      "}",
      "",
    );
  }

  // DELETE
  if (methods.includes("DELETE")) {
    lines.push(
      "/**",
      ` * Delete ${camelName}`,
      " */",
      `export async function delete${pascalName}(params: ${pascalName}IdParams): Promise<ControllerResult<void>> {`,
      "  try {",
      `    logger.debug({ message: 'Deleting ${camelName}', id: params.id });`,
      "",
      "    // TODO: Implement database deletion",
      "",
      `    return createSuccessResult('${pascalName} deleted');`,
      "  } catch (error) {",
      `    logger.error({ message: 'Error deleting ${camelName}', err: error });`,
      `    return createErrorResult('Failed to delete ${camelName}', error instanceof Error ? error.message : 'Unknown error', 500);`,
      "  }",
      "}",
      "",
    );
  }

  return lines.join("\n");
}

function generateHandler(
  pascalName: string,
  camelName: string,
  lowerName: string,
  methods: HttpMethod[],
): string {
  const lines: string[] = [
    "import { Request, Response } from 'express';",
    "import { sendResponse } from '../../shared/api.utils.js';",
  ];

  // Import controllers
  const controllerImports: string[] = [];
  if (methods.includes("GET")) controllerImports.push(`list${pascalName}s`, `get${pascalName}`);
  if (methods.includes("POST")) controllerImports.push(`create${pascalName}`);
  if (methods.some((m) => ["PUT", "PATCH"].includes(m))) controllerImports.push(`update${pascalName}`);
  if (methods.includes("DELETE")) controllerImports.push(`delete${pascalName}`);

  lines.push(`import { ${controllerImports.join(", ")} } from './${lowerName}.controller.js';`);

  // Import validators
  const validatorImports: string[] = [];
  if (methods.includes("GET")) validatorImports.push(`validate${pascalName}Query`, `validate${pascalName}Id`);
  if (methods.includes("POST")) validatorImports.push(`validate${pascalName}Create`);
  if (methods.some((m) => ["PUT", "PATCH"].includes(m))) {
    validatorImports.push(`validate${pascalName}Update`);
    if (!validatorImports.includes(`validate${pascalName}Id`)) validatorImports.push(`validate${pascalName}Id`);
  }
  if (methods.includes("DELETE") && !validatorImports.includes(`validate${pascalName}Id`)) {
    validatorImports.push(`validate${pascalName}Id`);
  }

  lines.push(`import { ${validatorImports.join(", ")} } from './${lowerName}.validator.js';`);

  lines.push("", "// ==================== HANDLERS ====================", "");

  // GET list handler
  if (methods.includes("GET")) {
    lines.push(
      "/**",
      ` * Handler for GET /api/${lowerName}`,
      " */",
      `export async function list${pascalName}sHandler(req: Request, res: Response): Promise<void> {`,
      "  await sendResponse(",
      "    req,",
      "    res,",
      `    () => validate${pascalName}Query(req.query),`,
      `    (validData) => list${pascalName}s(validData)`,
      "  );",
      "}",
      "",
    );

    // GET by ID handler
    lines.push(
      "/**",
      ` * Handler for GET /api/${lowerName}/:id`,
      " */",
      `export async function get${pascalName}Handler(req: Request, res: Response): Promise<void> {`,
      "  await sendResponse(",
      "    req,",
      "    res,",
      `    () => validate${pascalName}Id(req.params),`,
      `    (validData) => get${pascalName}(validData)`,
      "  );",
      "}",
      "",
    );
  }

  // POST create handler
  if (methods.includes("POST")) {
    lines.push(
      "/**",
      ` * Handler for POST /api/${lowerName}`,
      " */",
      `export async function create${pascalName}Handler(req: Request, res: Response): Promise<void> {`,
      "  await sendResponse(",
      "    req,",
      "    res,",
      `    () => validate${pascalName}Create(req.body),`,
      `    (validData) => create${pascalName}(validData)`,
      "  );",
      "}",
      "",
    );
  }

  // PUT/PATCH update handler
  if (methods.some((m) => ["PUT", "PATCH"].includes(m))) {
    lines.push(
      "/**",
      ` * Handler for PUT/PATCH /api/${lowerName}/:id`,
      " */",
      `export async function update${pascalName}Handler(req: Request, res: Response): Promise<void> {`,
      "  // First validate params",
      `  const paramsResult = await validate${pascalName}Id(req.params);`,
      "  if (!paramsResult.isValid) {",
      "    res.status(400).json({",
      "      success: false,",
      "      message: 'Invalid params',",
      "      errors: paramsResult.errors",
      "    });",
      "    return;",
      "  }",
      "",
      "  // Then validate body and execute",
      "  await sendResponse(",
      "    req,",
      "    res,",
      `    () => validate${pascalName}Update(req.body),`,
      `    (validData) => update${pascalName}(paramsResult.data!, validData)`,
      "  );",
      "}",
      "",
    );
  }

  // DELETE handler
  if (methods.includes("DELETE")) {
    lines.push(
      "/**",
      ` * Handler for DELETE /api/${lowerName}/:id`,
      " */",
      `export async function delete${pascalName}Handler(req: Request, res: Response): Promise<void> {`,
      "  await sendResponse(",
      "    req,",
      "    res,",
      `    () => validate${pascalName}Id(req.params),`,
      `    (validData) => delete${pascalName}(validData)`,
      "  );",
      "}",
      "",
    );
  }

  return lines.join("\n");
}

function generateRoutes(
  pascalName: string,
  camelName: string,
  lowerName: string,
  methods: HttpMethod[],
  addAuth: boolean,
): string {
  const lines: string[] = [
    "import { Router } from 'express';",
  ];

  // Import handlers
  const handlerImports: string[] = [];
  if (methods.includes("GET")) handlerImports.push(`list${pascalName}sHandler`, `get${pascalName}Handler`);
  if (methods.includes("POST")) handlerImports.push(`create${pascalName}Handler`);
  if (methods.some((m) => ["PUT", "PATCH"].includes(m))) handlerImports.push(`update${pascalName}Handler`);
  if (methods.includes("DELETE")) handlerImports.push(`delete${pascalName}Handler`);

  lines.push(`import { ${handlerImports.join(", ")} } from './${lowerName}.handler.js';`);

  if (addAuth) {
    lines.push("// import { requireAuth } from '../../middleware/auth.middleware.js';");
  }

  lines.push(
    "",
    "const router = Router();",
    "",
    "// ==================== ROUTES ====================",
    "",
  );

  const authMiddleware = addAuth ? "/* requireAuth, */ " : "";

  // GET routes
  if (methods.includes("GET")) {
    lines.push(
      "/**",
      ` * @route GET /api/${lowerName}`,
      ` * @desc List all ${lowerName}s`,
      " */",
      `router.get('/', ${authMiddleware}list${pascalName}sHandler);`,
      "",
      "/**",
      ` * @route GET /api/${lowerName}/:id`,
      ` * @desc Get ${lowerName} by ID`,
      " */",
      `router.get('/:id', ${authMiddleware}get${pascalName}Handler);`,
      "",
    );
  }

  // POST route
  if (methods.includes("POST")) {
    lines.push(
      "/**",
      ` * @route POST /api/${lowerName}`,
      ` * @desc Create new ${lowerName}`,
      " */",
      `router.post('/', ${authMiddleware}create${pascalName}Handler);`,
      "",
    );
  }

  // PUT route
  if (methods.includes("PUT")) {
    lines.push(
      "/**",
      ` * @route PUT /api/${lowerName}/:id`,
      ` * @desc Update ${lowerName}`,
      " */",
      `router.put('/:id', ${authMiddleware}update${pascalName}Handler);`,
      "",
    );
  }

  // PATCH route
  if (methods.includes("PATCH")) {
    lines.push(
      "/**",
      ` * @route PATCH /api/${lowerName}/:id`,
      ` * @desc Partial update ${lowerName}`,
      " */",
      `router.patch('/:id', ${authMiddleware}update${pascalName}Handler);`,
      "",
    );
  }

  // DELETE route
  if (methods.includes("DELETE")) {
    lines.push(
      "/**",
      ` * @route DELETE /api/${lowerName}/:id`,
      ` * @desc Delete ${lowerName}`,
      " */",
      `router.delete('/:id', ${authMiddleware}delete${pascalName}Handler);`,
      "",
    );
  }

  lines.push("export default router;");

  return lines.join("\n");
}

async function updateMainRouter(name: string): Promise<void> {
  const routerPath = path.join(process.cwd(), "src", "api", "routes.ts");
  const lowerName = name.toLowerCase();

  try {
    let content = await fs.readFile(routerPath, "utf-8");

    // Add import at the top (after other imports)
    const importLine = `import ${lowerName}Router from './${lowerName}/${lowerName}.routes.js';`;
    if (!content.includes(importLine)) {
      // Find last import line
      const importRegex = /^import\s+.+from\s+.+;$/gm;
      let lastImportMatch: RegExpExecArray | null = null;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        lastImportMatch = match;
      }

      if (lastImportMatch) {
        const insertPos = lastImportMatch.index + lastImportMatch[0].length;
        content =
          content.slice(0, insertPos) +
          "\n" +
          importLine +
          content.slice(insertPos);
      }
    }

    // Add router.use() before export
    const useLine = `router.use('/${lowerName}', ${lowerName}Router);`;
    if (!content.includes(useLine)) {
      const exportIndex = content.indexOf("export default router");
      if (exportIndex !== -1) {
        content =
          content.slice(0, exportIndex) +
          useLine +
          "\n\n" +
          content.slice(exportIndex);
      }
    }

    await fs.writeFile(routerPath, content, "utf-8");
  } catch (err) {
    // Router file might not exist, which is fine
  }
}
