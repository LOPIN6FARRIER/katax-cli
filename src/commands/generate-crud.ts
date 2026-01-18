import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import {
  success,
  error,
  warning,
  gray,
  title,
  info
} from '../utils/logger.js';
import {
  fileExists,
  writeFile,
  toPascalCase,
  toCamelCase
} from '../utils/file-utils.js';
import { CRUDConfig, FieldConfig } from '../types/index.js';

interface GenerateCrudOptions {
  auth?: boolean;
}

export async function generateCrudCommand(resourceName: string, options: GenerateCrudOptions = {}) {
  title(`🔧 Generate CRUD: ${resourceName}`);

  // Check if we're in a project
  if (!fileExists(path.join(process.cwd(), 'package.json'))) {
    error('Not in a project directory!');
    gray('Run this command from your project root\n');
    process.exit(1);
  }

  // Interactive prompts
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tableName',
      message: 'Database table name:',
      default: `${resourceName.toLowerCase()}s`
    },
    {
      type: 'confirm',
      name: 'addAuth',
      message: 'Require authentication for endpoints?',
      default: options.auth !== false
    }
  ]);

  info('\nDefine fields for the resource:');
  const fields: FieldConfig[] = [];
  let addingFields = true;

  while (addingFields) {
    const fieldAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'fieldName',
        message: 'Field name (press Enter to finish):',
        validate: (input) => {
          if (input && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) {
            return 'Field name must be a valid identifier';
          }
          return true;
        }
      }
    ]);

    if (!fieldAnswers.fieldName) {
      addingFields = false;
      break;
    }

    const fieldConfig = await inquirer.prompt([
      {
        type: 'list',
        name: 'type',
        message: `Type for "${fieldAnswers.fieldName}":`,
        choices: ['string', 'number', 'boolean', 'date', 'email']
      },
      {
        type: 'confirm',
        name: 'required',
        message: 'Required?',
        default: true
      }
    ]);

    fields.push({
      name: fieldAnswers.fieldName,
      type: fieldConfig.type,
      required: fieldConfig.required,
      rules: []
    });

    gray(`  ✓ Added field: ${fieldAnswers.fieldName} (${fieldConfig.type})`);
  }

  if (fields.length === 0) {
    error('At least one field is required to generate CRUD');
    process.exit(1);
  }

  const config: CRUDConfig = {
    resourceName,
    tableName: answers.tableName,
    fields,
    addAuth: answers.addAuth
  };

  const spinner = ora('Generating CRUD endpoints...').start();

  try {
    await generateCRUDFiles(config);
    spinner.succeed('CRUD endpoints generated');

    success(`\n✨ CRUD for "${resourceName}" created successfully!\n`);

    info('Generated endpoints:');
    gray(`  GET    /api/${resourceName.toLowerCase()}     - List all`);
    gray(`  GET    /api/${resourceName.toLowerCase()}/:id - Get one`);
    gray(`  POST   /api/${resourceName.toLowerCase()}     - Create`);
    gray(`  PUT    /api/${resourceName.toLowerCase()}/:id - Update`);
    gray(`  DELETE /api/${resourceName.toLowerCase()}/:id - Delete\n`);

    if (config.addAuth) {
      warning('Remember to implement authentication middleware!');
    }

  } catch (err) {
    spinner.fail('Failed to generate CRUD');
    error(err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  }
}

async function generateCRUDFiles(config: CRUDConfig): Promise<void> {
  const { resourceName, fields } = config;
  const basePath = path.join(process.cwd(), 'src', 'api', resourceName.toLowerCase());

  // Generate validator with all operations
  const validatorContent = generateCRUDValidator(config);
  await writeFile(path.join(basePath, `${resourceName.toLowerCase()}.validator.ts`), validatorContent);

  // Generate controller with CRUD operations
  const controllerContent = generateCRUDController(config);
  await writeFile(path.join(basePath, `${resourceName.toLowerCase()}.controller.ts`), controllerContent);

  // Generate routes with all CRUD endpoints
  const routesContent = generateCRUDRoutes(config);
  await writeFile(path.join(basePath, `${resourceName.toLowerCase()}.routes.ts`), routesContent);

  // Update main router
  const { updateMainRouter } = await import('../generators/router-updater.js');
  await updateMainRouter(resourceName, {
    name: resourceName,
    method: 'GET',
    path: `/api/${resourceName.toLowerCase()}`,
    addValidation: true,
    fields,
    addAsyncValidators: false
  });
}

function generateCRUDValidator(config: CRUDConfig): string {
  const { resourceName, fields } = config;
  const pascalName = toPascalCase(resourceName);
  const camelName = toCamelCase(resourceName);

  let content = `import { k, kataxInfer } from 'katax-core';\n\n`;
  
  content += `// ==================== SCHEMAS ====================\n\n`;

  // Create schema
  content += `export const create${pascalName}Schema = k.object({\n`;
  fields.forEach((field, index) => {
    const isLast = index === fields.length - 1;
    let fieldSchema = field.type === 'email' ? 'k.string().email()' : `k.${field.type}()`;
    if (!field.required) fieldSchema += '.optional()';
    content += `  ${field.name}: ${fieldSchema}${isLast ? '' : ','}\n`;
  });
  content += `});\n\n`;

  // Update schema (all fields optional)
  content += `export const update${pascalName}Schema = k.object({\n`;
  fields.forEach((field, index) => {
    const isLast = index === fields.length - 1;
    const fieldSchema = field.type === 'email' ? 'k.string().email().optional()' : `k.${field.type}().optional()`;
    content += `  ${field.name}: ${fieldSchema}${isLast ? '' : ','}\n`;
  });
  content += `});\n\n`;

  content += `export type Create${pascalName}Data = kataxInfer<typeof create${pascalName}Schema>;\n`;
  content += `export type Update${pascalName}Data = kataxInfer<typeof update${pascalName}Schema>;\n`;

  return content;
}

function generateCRUDController(config: CRUDConfig): string {
  const { resourceName, tableName } = config;
  const pascalName = toPascalCase(resourceName);
  const camelName = toCamelCase(resourceName);

  return `import { Create${pascalName}Data, Update${pascalName}Data } from './${resourceName.toLowerCase()}.validator.js';
import { ControllerResult, createSuccessResult, createErrorResult } from '../../shared/api.utils.js';

// List all ${camelName}s
export async function list${pascalName}s(): Promise<ControllerResult<any[]>> {
  try {
    // TODO: Implement database query
    // const result = await pool.query('SELECT * FROM ${tableName}');
    
    const mock${pascalName}s = [
      { id: 1, name: 'Sample ${pascalName} 1', createdAt: new Date().toISOString() },
      { id: 2, name: 'Sample ${pascalName} 2', createdAt: new Date().toISOString() }
    ];

    return createSuccessResult('${pascalName}s retrieved', mock${pascalName}s);
  } catch (error) {
    return createErrorResult('Failed to list ${camelName}s', error instanceof Error ? error.message : 'Unknown error', 500);
  }
}

// Get single ${camelName}
export async function get${pascalName}(id: string): Promise<ControllerResult<any>> {
  try {
    // TODO: Implement database query
    // const result = await pool.query('SELECT * FROM ${tableName} WHERE id = $1', [id]);
    
    const mock${pascalName} = { id: parseInt(id), name: 'Sample ${pascalName}', createdAt: new Date().toISOString() };
    return createSuccessResult('${pascalName} retrieved', mock${pascalName});
  } catch (error) {
    return createErrorResult('Failed to get ${camelName}', error instanceof Error ? error.message : 'Unknown error', 500);
  }
}

// Create ${camelName}
export async function create${pascalName}(data: Create${pascalName}Data): Promise<ControllerResult<any>> {
  try {
    // TODO: Implement database insertion
    const new${pascalName} = { id: Math.floor(Math.random() * 1000), ...data, createdAt: new Date().toISOString() };
    return createSuccessResult('${pascalName} created', new${pascalName}, undefined, 201);
  } catch (error) {
    return createErrorResult('Failed to create ${camelName}', error instanceof Error ? error.message : 'Unknown error', 500);
  }
}

// Update ${camelName}
export async function update${pascalName}(id: string, data: Update${pascalName}Data): Promise<ControllerResult<any>> {
  try {
    // TODO: Implement database update
    const updated${pascalName} = { id: parseInt(id), ...data, updatedAt: new Date().toISOString() };
    return createSuccessResult('${pascalName} updated', updated${pascalName});
  } catch (error) {
    return createErrorResult('Failed to update ${camelName}', error instanceof Error ? error.message : 'Unknown error', 500);
  }
}

// Delete ${camelName}
export async function delete${pascalName}(id: string): Promise<ControllerResult<void>> {
  try {
    // TODO: Implement database deletion
    return createSuccessResult('${pascalName} deleted');
  } catch (error) {
    return createErrorResult('Failed to delete ${camelName}', error instanceof Error ? error.message : 'Unknown error', 500);
  }
}
`;
}

function generateCRUDRoutes(config: CRUDConfig): string {
  const { resourceName, addAuth } = config;
  const pascalName = toPascalCase(resourceName);

  return `import { Router, Request, Response } from 'express';
import {
  list${pascalName}s,
  get${pascalName},
  create${pascalName},
  update${pascalName},
  delete${pascalName}
} from './${resourceName.toLowerCase()}.controller.js';
import { create${pascalName}Schema, update${pascalName}Schema } from './${resourceName.toLowerCase()}.validator.js';
import { sendResponse } from '../../shared/api.utils.js';
${addAuth ? "// import { requireAuth } from '../auth/auth.middleware.js';\n" : ''}
const router = Router();

// List all
router.get('/', ${addAuth ? '/* requireAuth, */ ' : ''}async (req: Request, res: Response) => {
  try {
    const result = await list${pascalName}s();
    res.status(result.statusCode || 200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal error', error });
  }
});

// Get one
router.get('/:id', ${addAuth ? '/* requireAuth, */ ' : ''}async (req: Request, res: Response) => {
  try {
    const result = await get${pascalName}(req.params.id);
    res.status(result.statusCode || 200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal error', error });
  }
});

// Create
router.post('/', ${addAuth ? '/* requireAuth, */ ' : ''}async (req: Request, res: Response) => {
  await sendResponse(req, res, () => create${pascalName}Schema.safeParse(req.body), (data) => create${pascalName}(data));
});

// Update
router.put('/:id', ${addAuth ? '/* requireAuth, */ ' : ''}async (req: Request, res: Response) => {
  await sendResponse(req, res, () => update${pascalName}Schema.safeParse(req.body), (data) => update${pascalName}(req.params.id, data));
});

// Delete
router.delete('/:id', ${addAuth ? '/* requireAuth, */ ' : ''}async (req: Request, res: Response) => {
  try {
    const result = await delete${pascalName}(req.params.id);
    res.status(result.statusCode || 200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal error', error });
  }
});

export default router;
`;
}
