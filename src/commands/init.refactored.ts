/**
 * Init command - Refactored version
 * Creates a new API project using ProjectStructureGenerator
 */

import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import crypto from 'crypto';
import { execa } from 'execa';
import { 
  success, 
  error, 
  warning, 
  gray, 
  title, 
  info 
} from '../utils/logger.js';
import {
  directoryExists
} from '../utils/file-utils.js';
import { ProjectConfig } from '../types/index.js';
import { ProjectStructureGenerator } from '../services/project-structure-generator.js';

interface InitOptions {
  force?: boolean;
}

export async function initCommand(projectName?: string, options: InitOptions = {}) {
  title('🚀 Katax CLI - Initialize API Project');

  // Determine project name
  let finalProjectName: string = projectName || '';
  if (!finalProjectName) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: 'my-api',
        validate: (input) => {
          if (!/^[a-z0-9-_]+$/i.test(input)) {
            return 'Project name can only contain letters, numbers, hyphens, and underscores';
          }
          return true;
        }
      }
    ]);
    finalProjectName = answer.projectName;
  }

  const projectPath = path.join(process.cwd(), finalProjectName);

  // Check if directory exists
  if (directoryExists(projectPath) && !options.force) {
    error(`Directory "${finalProjectName}" already exists!`);
    gray('Use --force to overwrite\n');
    process.exit(1);
  }

  // Interactive configuration
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      default: 'REST API built with Express and TypeScript'
    },
    {
      type: 'list',
      name: 'database',
      message: 'Select database:',
      choices: [
        { name: 'PostgreSQL', value: 'postgresql' },
        { name: 'MySQL', value: 'mysql' },
        { name: 'MongoDB', value: 'mongodb' },
        { name: 'None (no database)', value: 'none' }
      ],
      default: 'postgresql'
    },
    {
      type: 'list',
      name: 'authentication',
      message: 'Add authentication?',
      choices: [
        { name: 'JWT Authentication', value: 'jwt' },
        { name: 'None', value: 'none' }
      ],
      default: 'jwt'
    },
    {
      type: 'confirm',
      name: 'validation',
      message: 'Use katax-core for validation?',
      default: true
    },
    {
      type: 'input',
      name: 'port',
      message: 'Server port:',
      default: '3000',
      validate: (input) => {
        const port = parseInt(input);
        if (isNaN(port) || port < 1 || port > 65535) {
          return 'Port must be a number between 1 and 65535';
        }
        return true;
      }
    }
  ]);

  // Ask for database credentials if database is selected
  let dbConfig: any = {};
  if (answers.database !== 'none') {
    dbConfig = await collectDatabaseConfig(answers.database, finalProjectName);
  }

  const config: ProjectConfig = {
    name: finalProjectName,
    description: answers.description,
    type: 'rest-api',
    typescript: true,
    database: answers.database,
    authentication: answers.authentication,
    validation: answers.validation ? 'katax-core' : 'none',
    orm: 'none',
    port: parseInt(answers.port),
    dbConfig
  };

  // Display configuration
  displayConfiguration(config);

  const spinner = ora('Creating project structure...').start();

  try {
    // Generate project structure using new service
    const generator = new ProjectStructureGenerator(projectPath, config);
    await generator.generate();
    spinner.succeed('Project structure created');

    // Install dependencies
    spinner.start('Installing dependencies...');
    await installDependencies(projectPath);
    spinner.succeed('Dependencies installed');

    success(`\n✨ Project "${finalProjectName}" created successfully!\n`);
    
    displayNextSteps(finalProjectName);

  } catch (err) {
    spinner.fail('Failed to create project');
    error(err instanceof Error ? err.message : 'Unknown error');
    if (err instanceof Error && err.stack) {
      gray(err.stack);
    }
    process.exit(1);
  }
}

/**
 * Collect database configuration
 */
async function collectDatabaseConfig(database: string, projectName: string): Promise<any> {
  const dbQuestions: any[] = [];
  
  if (database === 'postgresql' || database === 'mysql') {
    dbQuestions.push(
      {
        type: 'input',
        name: 'host',
        message: `${database === 'postgresql' ? 'PostgreSQL' : 'MySQL'} host:`,
        default: 'localhost'
      },
      {
        type: 'input',
        name: 'port',
        message: `${database === 'postgresql' ? 'PostgreSQL' : 'MySQL'} port:`,
        default: database === 'postgresql' ? '5432' : '3306'
      },
      {
        type: 'input',
        name: 'user',
        message: 'Database user:',
        default: database === 'postgresql' ? 'postgres' : 'root'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Database password:',
        default: 'password'
      },
      {
        type: 'input',
        name: 'database',
        message: 'Database name:',
        default: projectName.toLowerCase().replace(/-/g, '_')
      }
    );
  } else if (database === 'mongodb') {
    dbQuestions.push(
      {
        type: 'input',
        name: 'host',
        message: 'MongoDB host:',
        default: 'localhost'
      },
      {
        type: 'input',
        name: 'port',
        message: 'MongoDB port:',
        default: '27017'
      },
      {
        type: 'input',
        name: 'database',
        message: 'Database name:',
        default: projectName.toLowerCase().replace(/-/g, '_')
      },
      {
        type: 'confirm',
        name: 'useAuth',
        message: 'Use authentication?',
        default: false
      }
    );
  }
  
  const config = await inquirer.prompt(dbQuestions);
  
  // Ask for MongoDB credentials if authentication is enabled
  if (database === 'mongodb' && config.useAuth) {
    const authConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'user',
        message: 'MongoDB user:',
        default: 'admin'
      },
      {
        type: 'password',
        name: 'password',
        message: 'MongoDB password:',
        default: 'password'
      }
    ]);
    config.user = authConfig.user;
    config.password = authConfig.password;
  }

  return config;
}

/**
 * Display project configuration
 */
function displayConfiguration(config: ProjectConfig): void {
  gray('\n📋 Project Configuration:');
  gray(`  Name: ${config.name}`);
  gray(`  Database: ${config.database}`);
  gray(`  Auth: ${config.authentication}`);
  gray(`  Validation: ${config.validation}`);
  gray(`  Port: ${config.port}\n`);
}

/**
 * Display next steps
 */
function displayNextSteps(projectName: string): void {
  info('Next steps:');
  gray(`  cd ${projectName}`);
  gray(`  npm run dev\n`);
  
  info('Available commands:');
  gray(`  katax add endpoint <name>    - Add a new endpoint`);
  gray(`  katax generate crud <name>   - Generate CRUD resource`);
  gray(`  katax info                   - Show project structure\n`);
  
  info('Generated with:');
  gray(`  ✅ Result pattern for type-safe error handling`);
  gray(`  ✅ Repository pattern for database abstraction`);
  gray(`  ✅ Dependency injection ready`);
  gray(`  ✅ Structured logging with Pino`);
  gray(`  ✅ Health check endpoint`);
  gray(`  ✅ Hello example endpoint\n`);
}

/**
 * Install npm dependencies
 */
async function installDependencies(projectPath: string): Promise<void> {
  await execa('npm', ['install'], {
    cwd: projectPath,
    stdio: 'ignore'
  });
}
