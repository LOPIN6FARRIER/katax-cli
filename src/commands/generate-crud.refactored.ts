/**
 * Generate CRUD command - Refactored version
 * Uses CodeGenerationService for consistent code generation
 */

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
import { fileExists } from '../utils/file-utils.js';
import { FieldConfig } from '../types/index.js';
import { codeGenerationService } from '../services/code-generation.service.js';

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

  // Detect database type from package.json
  const database = await detectDatabase();
  
  if (!database) {
    warning('No database detected. Please install a database driver first:');
    gray('  PostgreSQL: npm install pg @types/pg');
    gray('  MySQL: npm install mysql2');
    gray('  MongoDB: npm install mongodb\n');
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
  const fields: FieldConfig[] = await collectFields();

  if (fields.length === 0) {
    error('At least one field is required to generate CRUD');
    process.exit(1);
  }

  const spinner = ora('Generating CRUD endpoints...').start();

  try {
    await codeGenerationService.generateCRUD(
      resourceName,
      fields,
      process.cwd(),
      database,
      answers.addAuth
    );

    spinner.succeed('CRUD endpoints generated');

    success(`\n✨ CRUD for "${resourceName}" created successfully!\n`);

    displayGeneratedEndpoints(resourceName, answers.addAuth);

  } catch (err) {
    spinner.fail('Failed to generate CRUD');
    error(err instanceof Error ? err.message : 'Unknown error');
    if (err instanceof Error && err.stack) {
      gray(err.stack);
    }
    process.exit(1);
  }
}

/**
 * Detect database type from package.json
 */
async function detectDatabase(): Promise<'postgresql' | 'mysql' | 'mongodb' | undefined> {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const fs = await import('fs/promises');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    
    if (packageJson.dependencies?.pg) return 'postgresql';
    if (packageJson.dependencies?.mysql2) return 'mysql';
    if (packageJson.dependencies?.mongodb) return 'mongodb';
    
    return undefined;
  } catch (err) {
    return undefined;
  }
}

/**
 * Collect fields interactively
 */
async function collectFields(): Promise<FieldConfig[]> {
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

  return fields;
}

/**
 * Display generated endpoints
 */
function displayGeneratedEndpoints(resourceName: string, hasAuth: boolean): void {
  info('Generated endpoints:');
  gray(`  GET    /api/${resourceName.toLowerCase()}     - List all`);
  gray(`  GET    /api/${resourceName.toLowerCase()}/:id - Get one`);
  gray(`  POST   /api/${resourceName.toLowerCase()}     - Create`);
  gray(`  PUT    /api/${resourceName.toLowerCase()}/:id - Update`);
  gray(`  DELETE /api/${resourceName.toLowerCase()}/:id - Delete\n`);

  info('Generated files:');
  gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.validator.ts`);
  gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.repository.ts`);
  gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.controller.ts`);
  gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.handler.ts`);
  gray(`  src/api/${resourceName.toLowerCase()}/${resourceName.toLowerCase()}.routes.ts`);
  gray(`  Updated: src/api/routes.ts\n`);

  if (hasAuth) {
    warning('Remember to implement authentication middleware!');
    gray('Uncomment the requireAuth middleware in your routes.\n');
  }
}
