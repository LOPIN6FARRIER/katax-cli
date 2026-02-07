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
  toPascalCase,
  toCamelCase
} from '../utils/file-utils.js';
import { EndpointConfig, FieldConfig, ValidationRule } from '../types/index.js';
import { codeGenerationService } from '../services/code-generation.service.js';

interface AddEndpointOptions {
  method?: string;
  path?: string;
}

export async function addEndpointCommand(name: string, options: AddEndpointOptions = {}) {
  title(`🎯 Add Endpoint: ${name}`);

  // Check if we're in a Katax project
  if (!fileExists(path.join(process.cwd(), 'package.json'))) {
    error('Not in a project directory!');
    gray('Run this command from your project root\n');
    process.exit(1);
  }

  // Check if katax-core is installed
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(await import('fs').then(fs => fs.promises.readFile(packageJsonPath, 'utf-8')));
  const hasKataxCore = packageJson.dependencies?.['katax-core'];

  if (!hasKataxCore) {
    warning('katax-core is not installed in this project');
    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Would you like to install katax-core?',
        default: true
      }
    ]);

    if (!install) {
      error('Cannot create endpoint without validation library');
      process.exit(1);
    }

    // Install katax-core
    const spinner = ora('Installing katax-core...').start();
    const { execa } = await import('execa');
    await execa('npm', ['install', 'katax-core'], { cwd: process.cwd() });
    spinner.succeed('katax-core installed');
  }

  // Interactive prompts
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'HTTP Method:',
      choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      default: options.method?.toUpperCase() || 'POST',
      when: !options.method
    },
    {
      type: 'input',
      name: 'path',
      message: 'Route path:',
      default: `/api/${name.toLowerCase()}`,
      when: !options.path,
      validate: (input) => {
        if (!input.startsWith('/')) {
          return 'Path must start with /';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'addValidation',
      message: 'Add validation?',
      default: true
    }
  ]);

  const config: EndpointConfig = {
    name,
    method: (options.method?.toUpperCase() || answers.method) as any,
    path: options.path || answers.path,
    addValidation: answers.addValidation,
    fields: [],
    addAsyncValidators: false,
    dbOperations: []
  };

  // If validation is enabled, collect fields
  if (config.addValidation && config.method !== 'GET' && config.method !== 'DELETE') {
    info('\nDefine request body fields:');
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
          choices: ['string', 'number', 'boolean', 'date', 'email', 'array', 'object']
        },
        {
          type: 'confirm',
          name: 'required',
          message: 'Required?',
          default: true
        }
      ]);

      const field: FieldConfig = {
        name: fieldAnswers.fieldName,
        type: fieldConfig.type,
        required: fieldConfig.required,
        rules: []
      };

      // Add type-specific rules
      if (fieldConfig.type === 'string' || fieldConfig.type === 'email') {
        const stringRules = await inquirer.prompt([
          {
            type: 'input',
            name: 'minLength',
            message: 'Minimum length (press Enter to skip):',
            validate: (input) => !input || !isNaN(parseInt(input)) || 'Must be a number'
          },
          {
            type: 'input',
            name: 'maxLength',
            message: 'Maximum length (press Enter to skip):',
            validate: (input) => !input || !isNaN(parseInt(input)) || 'Must be a number'
          }
        ]);

        if (stringRules.minLength) {
          field.rules!.push({ type: 'minLength', value: parseInt(stringRules.minLength) });
        }
        if (stringRules.maxLength) {
          field.rules!.push({ type: 'maxLength', value: parseInt(stringRules.maxLength) });
        }
      }

      if (fieldConfig.type === 'number') {
        const numberRules = await inquirer.prompt([
          {
            type: 'input',
            name: 'min',
            message: 'Minimum value (press Enter to skip):',
            validate: (input) => !input || !isNaN(parseFloat(input)) || 'Must be a number'
          },
          {
            type: 'input',
            name: 'max',
            message: 'Maximum value (press Enter to skip):',
            validate: (input) => !input || !isNaN(parseFloat(input)) || 'Must be a number'
          }
        ]);

        if (numberRules.min) {
          field.rules!.push({ type: 'min', value: parseFloat(numberRules.min) });
        }
        if (numberRules.max) {
          field.rules!.push({ type: 'max', value: parseFloat(numberRules.max) });
        }
      }

      config.fields!.push(field);
      gray(`  ✓ Added field: ${field.name} (${field.type})`);
    }

    if (config.fields!.length > 0) {
      const { addAsync } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addAsync',
          message: 'Add async validators (e.g., unique email)?',
          default: false
        }
      ]);
      config.addAsyncValidators = addAsync;
    }
  }

  // Generate files using new service
  const spinner = ora('Generating endpoint files...').start();

  try {
    // Read database config from package.json if available
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    let database: 'postgresql' | 'mysql' | 'mongodb' | undefined;
    
    try {
      const packageJson = JSON.parse(await import('fs').then(fs => fs.promises.readFile(packageJsonPath, 'utf-8')));
      if (packageJson.dependencies?.pg) database = 'postgresql';
      else if (packageJson.dependencies?.mysql2) database = 'mysql';
      else if (packageJson.dependencies?.mongodb) database = 'mongodb';
    } catch (err) {
      // No database detected
    }

    const files = await codeGenerationService.generateEndpoint(
      config,
      process.cwd(),
      database
    );
    
    spinner.succeed('Endpoint files generated');

    success(`\n✨ Endpoint "${name}" created successfully!\n`);

    info('Generated files:');
    gray(`  src/api/${name.toLowerCase()}/${name.toLowerCase()}.validator.ts`);
    gray(`  src/api/${name.toLowerCase()}/${name.toLowerCase()}.controller.ts`);
    gray(`  src/api/${name.toLowerCase()}/${name.toLowerCase()}.handler.ts`);
    gray(`  src/api/${name.toLowerCase()}/${name.toLowerCase()}.routes.ts`);
    gray(`  Updated: src/api/routes.ts\n`);
    gray(`  Updated: src/api/routes.ts\n`);

    info('Test your endpoint:');
    gray(`  ${config.method} ${config.path}\n`);

  } catch (err) {
    error('Failed to add endpoint');
    console.error(err);
    process.exit(1);
  }
}
