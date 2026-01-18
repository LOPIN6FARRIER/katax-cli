import chalk from 'chalk';
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
  directoryExists,
  ensureDir,
  writeFile,
  copyTemplate
} from '../utils/file-utils.js';
import { ProjectConfig } from '../types/index.js';

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
    const dbQuestions: any[] = [];
    
    if (answers.database === 'postgresql' || answers.database === 'mysql') {
      dbQuestions.push(
        {
          type: 'input',
          name: 'host',
          message: `${answers.database === 'postgresql' ? 'PostgreSQL' : 'MySQL'} host:`,
          default: 'localhost'
        },
        {
          type: 'input',
          name: 'port',
          message: `${answers.database === 'postgresql' ? 'PostgreSQL' : 'MySQL'} port:`,
          default: answers.database === 'postgresql' ? '5432' : '3306'
        },
        {
          type: 'input',
          name: 'user',
          message: 'Database user:',
          default: 'postgres'
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
          default: finalProjectName.toLowerCase().replace(/-/g, '_')
        }
      );
    } else if (answers.database === 'mongodb') {
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
          default: finalProjectName.toLowerCase().replace(/-/g, '_')
        },
        {
          type: 'confirm',
          name: 'useAuth',
          message: 'Use authentication?',
          default: false
        }
      );
    }
    
    dbConfig = await inquirer.prompt(dbQuestions);
    
    // Ask for MongoDB credentials if authentication is enabled
    if (answers.database === 'mongodb' && dbConfig.useAuth) {
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
      dbConfig.user = authConfig.user;
      dbConfig.password = authConfig.password;
    }
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

  // Ask for JWT secret generation if JWT is enabled
  let generateJwtSecrets = false;
  if (config.authentication === 'jwt') {
    const jwtAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'generate',
        message: 'Generate JWT secrets automatically?',
        default: true
      }
    ]);
    generateJwtSecrets = jwtAnswer.generate;
  }

  // Display configuration
  gray('\n📋 Project Configuration:');
  gray(`  Name: ${config.name}`);
  gray(`  Database: ${config.database}`);
  gray(`  Auth: ${config.authentication}`);
  gray(`  Validation: ${config.validation}`);
  gray(`  Port: ${config.port}\n`);

  const spinner = ora('Creating project structure...').start();

  try {
    // Create project structure
    await createProjectStructure(projectPath, config, generateJwtSecrets);
    spinner.succeed('Project structure created');

    // Install dependencies
    spinner.start('Installing dependencies...');
    await installDependencies(projectPath);
    spinner.succeed('Dependencies installed');

    success(`\n✨ Project "${finalProjectName}" created successfully!\n`);
    
    info('Next steps:');
    gray(`  cd ${finalProjectName}`);
    gray(`  npm run dev\n`);
    
    info('Available commands:');
    gray(`  katax add endpoint <name>    - Add a new endpoint`);
    gray(`  katax generate crud <name>   - Generate CRUD resource`);
    gray(`  katax info                   - Show project structure\n`);

  } catch (err) {
    spinner.fail('Failed to create project');
    error(err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  }
}

async function installDependencies(projectPath: string): Promise<void> {
  await execa('npm', ['install'], {
    cwd: projectPath,
    stdio: 'ignore'
  });
}

async function createDatabaseConnection(projectPath: string, config: ProjectConfig): Promise<void> {
  const destPath = path.join(projectPath, 'src/database/connection.ts');
  
  let content = '';
  
  if (config.database === 'postgresql') {
    content = [
      "import { Pool } from 'pg';",
      "import dotenv from 'dotenv';",
      "dotenv.config();",
      "",
      "const pool = new Pool({",
      "  host: process.env.DB_HOST,",
      "  port: Number(process.env.DB_PORT),",
      "  database: process.env.DB_NAME,",
      "  user: process.env.DB_USER,",
      "  password: process.env.DB_PASSWORD,",
      "});",
      "",
      "pool.on('connect', () => {",
      "  console.log('✅ Connected to PostgreSQL database');",
      "});",
      "",
      "pool.on('error', (err: Error) => {",
      "  console.error('❌ PostgreSQL connection error:', err);",
      "  process.exit(-1);",
      "});",
      "",
      "export default pool;",
      "",
      "export async function query(text: string, params?: any[]) {",
      "  const start = Date.now();",
      "  const res = await pool.query(text, params);",
      "  const duration = Date.now() - start;",
      "  console.log('Executed query', { text, duration, rows: res.rowCount });",
      "  return res;",
      "}",
      "",
      "export async function getClient() {",
      "  const client = await pool.connect();",
      "  const originalQuery = client.query;",
      "  const originalRelease = client.release;",
      "  ",
      "  const timeout = setTimeout(() => {",
      "    console.error('A client has been checked out for more than 5 seconds!');",
      "  }, 5000);",
      "  ",
      "  // Override query method to add logging/monitoring",
      "  client.query = (originalQuery as any).bind(client);",
      "  ",
      "  client.release = () => {",
      "    clearTimeout(timeout);",
      "    client.query = originalQuery;",
      "    client.release = originalRelease;",
      "    return originalRelease.apply(client);",
      "  };",
      "  ",
      "  return client;",
      "}"
    ].join('\n');
  } else if (config.database === 'mysql') {
    content = [
      "import mysql from 'mysql2/promise';",
      "",
      "const pool = mysql.createPool({",
      "  uri: process.env.DATABASE_URL,",
      "  waitForConnections: true,",
      "  connectionLimit: 10,",
      "  queueLimit: 0",
      "});",
      "",
      "export default pool;",
      "",
      "export async function query(sql: string, params?: any[]) {",
      "  const start = Date.now();",
      "  const [rows] = await pool.execute(sql, params);",
      "  const duration = Date.now() - start;",
      "  console.log('Executed query', { sql, duration, rows: Array.isArray(rows) ? rows.length : 0 });",
      "  return rows;",
      "}",
      "",
      "export async function getConnection() {",
      "  return await pool.getConnection();",
      "}"
    ].join('\n');
  } else if (config.database === 'mongodb') {
    content = [
      "import { MongoClient, Db } from 'mongodb';",
      "",
      "let client: MongoClient;",
      "let db: Db;",
      "",
      "export async function connect(): Promise<Db> {",
      "  if (db) {",
      "    return db;",
      "  }",
      "",
      "  const uri = process.env.DATABASE_URL;",
      "  if (!uri) {",
      "    throw new Error('DATABASE_URL is not defined in environment variables');",
      "  }",
      "",
      "  client = new MongoClient(uri);",
      "  ",
      "  try {",
      "    await client.connect();",
      "    console.log('✅ Connected to MongoDB database');",
      "    ",
      "    const dbName = uri.split('/').pop()?.split('?')[0];",
      "    db = client.db(dbName);",
      "    ",
      "    return db;",
      "  } catch (error) {",
      "    console.error('❌ MongoDB connection error:', error);",
      "    throw error;",
      "  }",
      "}",
      "",
      "export async function disconnect(): Promise<void> {",
      "  if (client) {",
      "    await client.close();",
      "    console.log('Disconnected from MongoDB');",
      "  }",
      "}",
      "",
      "export function getDb(): Db {",
      "  if (!db) {",
      "    throw new Error('Database not initialized. Call connect() first.');",
      "  }",
      "  return db;",
      "}",
      "",
      "export default { connect, disconnect, getDb };"
    ].join('\n');
  }
  
  await writeFile(destPath, content);
}

async function createProjectStructure(projectPath: string, config: ProjectConfig, generateJwtSecrets: boolean): Promise<void> {
  // Create directories
  const dirs = [
    'src',
    'src/api',
    'src/config',
    'src/middleware',
    'src/shared',
    'src/types'
  ];

  if (config.database !== 'none') {
    dirs.push('src/database');
  }

  // Add default hola endpoint
  dirs.push('src/api/hola');

  for (const dir of dirs) {
    await ensureDir(path.join(projectPath, dir));
  }

  // Create package.json
  const packageJson = {
    name: config.name,
    version: '1.0.0',
    description: config.description,
    type: 'module',
    main: 'dist/index.js',
    scripts: {
      dev: 'nodemon --watch src --exec tsx src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      lint: 'eslint . --ext .ts',
      format: 'prettier --write "src/**/*.ts"'
    },
    keywords: ['api', 'express', 'typescript'],
    author: '',
    license: 'MIT',
    dependencies: {
      express: '^4.18.2',
      cors: '^2.8.5',
      dotenv: '^16.3.1',
      pino: '^8.17.2',
      'pino-pretty': '^10.3.1',
      ...(config.validation === 'katax-core' && { 'katax-core': '^1.1.0' }),
      ...(config.authentication === 'jwt' && {
        jsonwebtoken: '^9.0.2',
        bcrypt: '^5.1.1'
      }),
      ...(config.database === 'postgresql' && { pg: '^8.11.3' }),
      ...(config.database === 'mysql' && { mysql2: '^3.6.5' }),
      ...(config.database === 'mongodb' && { mongodb: '^6.3.0' })
    },
    devDependencies: {
      '@types/express': '^4.17.21',
      '@types/cors': '^2.8.17',
      '@types/node': '^22.10.5',
      ...(config.authentication === 'jwt' && {
        '@types/jsonwebtoken': '^9.0.5',
        '@types/bcrypt': '^5.0.2'
      }),
      ...(config.database === 'postgresql' && { '@types/pg': '^8.10.9' }),
      typescript: '^5.3.3',
      tsx: '^4.7.0',
      nodemon: '^3.0.2',
      eslint: '^8.56.0',
      '@typescript-eslint/eslint-plugin': '^6.19.0',
      '@typescript-eslint/parser': '^6.19.0',
      prettier: '^3.2.4'
    }
  };

  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create tsconfig.json
  const tsConfig = {
    compilerOptions: {
      target: 'es2016',
      module: 'commonjs',
      sourceMap: true,
      outDir: './dist',
      mapRoot: 'src',
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      strict: true,
      skipLibCheck: true
    },
    include: ['src'],
    exclude: ['node_modules', 'dist']
  };

  await writeFile(
    path.join(projectPath, 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2)
  );

  // Create .env.example and .env
  let databaseUrl = '';
  let dbEnvVars = '';
  if (config.database === 'postgresql' && config.dbConfig) {
    const { host, port, user, password, database } = config.dbConfig;
    databaseUrl = `DATABASE_URL=postgresql://${user}:${password}@${host}:${port}/${database}`;
    dbEnvVars = `DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}
DB_USER=${user}
DB_PASSWORD=${password}`;
  } else if (config.database === 'mysql' && config.dbConfig) {
    const { host, port, user, password, database } = config.dbConfig;
    databaseUrl = `DATABASE_URL=mysql://${user}:${password}@${host}:${port}/${database}`;
    dbEnvVars = `DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}
DB_USER=${user}
DB_PASSWORD=${password}`;
  } else if (config.database === 'mongodb' && config.dbConfig) {
    const { host, port, database, user, password } = config.dbConfig;
    if (user && password) {
      databaseUrl = `DATABASE_URL=mongodb://${user}:${password}@${host}:${port}/${database}`;
      dbEnvVars = `DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}
DB_USER=${user}
DB_PASSWORD=${password}`;
    } else {
      databaseUrl = `DATABASE_URL=mongodb://${host}:${port}/${database}`;
      dbEnvVars = `DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}`;
    }
  }

  // Generate JWT secrets if needed
  let jwtConfig = '';
  if (config.authentication === 'jwt') {
    if (generateJwtSecrets) {
      const jwtSecret = crypto.randomBytes(64).toString('hex');
      const jwtRefreshSecret = crypto.randomBytes(64).toString('hex');
      jwtConfig = `JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=${jwtRefreshSecret}
JWT_REFRESH_EXPIRES_IN=7d`;
    } else {
      jwtConfig = `JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_REFRESH_EXPIRES_IN=7d`;
    }
  }

  const envContent = `# Server Configuration
PORT=${config.port}
NODE_ENV=development
LOG_LEVEL=info

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Database Configuration
  ${databaseUrl}
  ${dbEnvVars ? '\n# DB connection variables for pool\n' + dbEnvVars : ''}

# JWT Configuration
${jwtConfig}
`;

  await writeFile(path.join(projectPath, '.env.example'), envContent);
  await writeFile(path.join(projectPath, '.env'), envContent);

  // Create .gitignore
  const gitignoreContent = `node_modules/
dist/
.env
.DS_Store
*.log
coverage/
.vscode/
`;

  await writeFile(path.join(projectPath, '.gitignore'), gitignoreContent);

  // Create index.ts
  const indexContent = `import app from './app.js';
import dotenv from 'dotenv';
import { logger } from './shared/logger.utils.js';
import { validateEnvironment } from './config/env.validator.js';

dotenv.config();

// Validate required environment variables
validateEnvironment();

const PORT = process.env.PORT || ${config.port};

app.listen(PORT, () => {
  logger.info(\`Server running on http://localhost:\${PORT}\`);
  logger.info(\`API endpoints available at http://localhost:\${PORT}/api\`);
  logger.info(\`Health check: http://localhost:\${PORT}/api/health\`);
});
`;

  await writeFile(path.join(projectPath, 'src/index.ts'), indexContent);

  // Create app.ts
  const appContent = `import express from 'express';
import cors from 'cors';
import router from './api/routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { corsOptions } from './config/cors.config.js';

const app = express();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to ${config.name} API',
    version: '1.0.0',
    endpoints: '/api',
    health: '/api/health'
  });
});

app.use('/api', router);

// Error handling
app.use(errorMiddleware);

export default app;
`;

  await writeFile(path.join(projectPath, 'src/app.ts'), appContent);

  // Create routes.ts
  const routesContent = `import { Router } from 'express';
import holaRouter from './hola/hola.routes.js';
import { healthCheckHandler } from './health/health.handler.js';

const router = Router();

// Health check
router.get('/health', healthCheckHandler);

// Example endpoint
router.use('/hola', holaRouter);

export default router;
`;

  await writeFile(path.join(projectPath, 'src/api/routes.ts'), routesContent);

  // Create error middleware
  const errorMiddlewareContent = `import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/logger.utils.js';

export interface ApiError extends Error {
  statusCode?: number;
}

export function errorMiddleware(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({
    err,
    req: {
      method: req.method,
      url: req.url,
      headers: req.headers
    },
    statusCode
  }, message);

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
`;

  await writeFile(
    path.join(projectPath, 'src/middleware/error.middleware.ts'),
    errorMiddlewareContent
  );

  // Create database connection if database is selected
  if (config.database !== 'none') {
    await createDatabaseConnection(projectPath, config);
  }

  // Create shared utilities
  if (config.validation === 'katax-core') {
    const apiUtilsContent = `import { Request, Response } from 'express';
import { logger } from './logger.utils.js';

export interface ControllerResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  statusCode?: number;
}

export function createSuccessResult<T>(
  message: string,
  data?: T,
  error?: string,
  statusCode = 200
): ControllerResult<T> {
  return { success: true, message, data, error, statusCode };
}

export function createErrorResult(
  message: string,
  error?: string,
  statusCode = 400
): ControllerResult {
  return { success: false, message, error, statusCode };
}

export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors?: any[];
}

export async function sendResponse<TValidation = any, TResponse = any>(
  req: Request,
  res: Response,
  validator: () => Promise<ValidationResult<TValidation>>,
  controller: (validData: TValidation) => Promise<ControllerResult<TResponse>>
): Promise<void> {
  try {
    // 1. Execute validation
    const validationResult = await validator();
    
    if (!validationResult.isValid) {
      // Validation error
      logger.warn({
        method: req.method,
        path: req.path,
        errors: validationResult.errors
      }, 'Validation failed');
      
      res.status(400).json({
        success: false,
        message: 'Invalid data',
        error: 'Validation failed',
        details: validationResult.errors
      });
      return;
    }

    // 2. Execute controller if validation passes
    const controllerResult = await controller(validationResult.data as TValidation);

    // 3. Build HTTP response
    const statusCode = controllerResult.statusCode || (controllerResult.success ? 200 : 400);

    const response: any = {
      success: controllerResult.success,
      message: controllerResult.message
    };

    if (controllerResult.data !== undefined) {
      response.data = controllerResult.data;
    }

    if (controllerResult.error) {
      response.error = controllerResult.error;
    }

    res.status(statusCode).json(response);

  } catch (error) {
    // Internal server error
    logger.error({
      err: error,
      method: req.method,
      path: req.path
    }, 'Internal server error');
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
`;

    await writeFile(
      path.join(projectPath, 'src/shared/api.utils.ts'),
      apiUtilsContent
    );
  }

  // Create JWT utilities if JWT authentication is selected
  if (config.authentication === 'jwt') {
    const jwtUtilsContent = `import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';

const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';  // 7 days

// ==================== INTERFACES ====================

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// ==================== TOKEN GENERATION ====================

/**
 * Generate Access Token
 * @param payload - JWT payload containing user information
 * @returns JWT access token string
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY
  });
}

/**
 * Generate Refresh Token
 * @param payload - JWT payload containing user information
 * @returns JWT refresh token string
 */
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY
  });
}

/**
 * Generate both access and refresh tokens
 * @param payload - JWT payload containing user information
 * @returns Object with both tokens
 */
export function generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload)
  };
}

// ==================== TOKEN VERIFICATION ====================

/**
 * Verify Access Token
 * @param token - JWT token to verify
 * @returns Decoded JWT payload or null if invalid
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    console.error('[JWT] Error verifying access token:', error);
    return null;
  }
}

/**
 * Verify Refresh Token
 * @param token - JWT token to verify
 * @returns Decoded JWT payload or null if invalid
 */
export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
  } catch (error) {
    console.error('[JWT] Error verifying refresh token:', error);
    return null;
  }
}

/**
 * Decode token without verifying (useful for debugging)
 * @param token - JWT token to decode
 * @returns Decoded token data
 */
export function decodeToken(token: string): any {
  return jwt.decode(token);
}

// ==================== MIDDLEWARE ====================

/**
 * Express middleware to authenticate requests using JWT
 * Expects Bearer token in Authorization header
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
    return;
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
    return;
  }

  // Attach user info to request
  (req as any).user = payload;
  next();
}

/**
 * Middleware to check if user has specific role
 * @param roles - Array of allowed roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
}
`;

    await writeFile(
      path.join(projectPath, 'src/shared/jwt.utils.ts'),
      jwtUtilsContent
    );
  }

  // Create logger utility with pino
  const loggerUtilsContent = `import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Pino logger configuration
 * - Pretty printing in development
 * - JSON logs in production
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  }
});

/**
 * Log HTTP request
 */
export function logRequest(method: string, url: string, statusCode: number, duration: number): void {
  logger.info({
    method,
    url,
    statusCode,
    duration: \`\${duration}ms\`
  }, \`\${method} \${url} - \${statusCode} (\${duration}ms)\`);
}

/**
 * Log error with context
 */
export function logError(error: Error, context?: Record<string, any>): void {
  logger.error({
    err: error,
    ...context
  }, error.message);
}

/**
 * Log info message
 */
export function logInfo(message: string, data?: Record<string, any>): void {
  logger.info(data, message);
}

/**
 * Log warning message
 */
export function logWarning(message: string, data?: Record<string, any>): void {
  logger.warn(data, message);
}

/**
 * Log debug message (only in development)
 */
export function logDebug(message: string, data?: Record<string, any>): void {
  logger.debug(data, message);
}
`;

  await writeFile(
    path.join(projectPath, 'src/shared/logger.utils.ts'),
    loggerUtilsContent
  );

  // Create logger middleware
  const loggerMiddlewareContent = `import { Request, Response, NextFunction } from 'express';
import { logRequest } from '../shared/logger.utils.js';

/**
 * Express middleware to log all HTTP requests
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logRequest(req.method, req.url, res.statusCode, duration);
  });

  next();
}
`;

  await writeFile(
    path.join(projectPath, 'src/middleware/logger.middleware.ts'),
    loggerMiddlewareContent
  );

  // Create CORS configuration
  const corsConfigContent = `import { CorsOptions } from 'cors';

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173'];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
`;

  await writeFile(
    path.join(projectPath, 'src/config/cors.config.ts'),
    corsConfigContent
  );

  // Create environment validator
  const envValidatorContent = `import { logger } from '../shared/logger.utils.js';

interface RequiredEnvVars {
  [key: string]: string;
}

/**
 * Validate that all required environment variables are present
 */
export function validateEnvironment(): void {
  const required: RequiredEnvVars = {
    PORT: process.env.PORT || '',
    NODE_ENV: process.env.NODE_ENV || ''
  };

${config.database !== 'none' ? `  // Database variables\n  required.DATABASE_URL = process.env.DATABASE_URL || '';\n` : ''}${config.authentication === 'jwt' ? `  // JWT variables\n  required.JWT_SECRET = process.env.JWT_SECRET || '';\n  required.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || '';\n` : ''}
  const missing: string[] = [];

  for (const [key, value] of Object.entries(required)) {
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    logger.error(\`Missing required environment variables: \${missing.join(', ')}\`);
    logger.error('Please check your .env file');
    process.exit(1);
  }

  logger.info('Environment variables validated successfully');
}
`;

  await writeFile(
    path.join(projectPath, 'src/config/env.validator.ts'),
    envValidatorContent
  );

  // Create health check handler
  const healthHandlerContent = `import { Request, Response } from 'express';
import os from 'os';

/**
 * Health check endpoint handler
 * Returns system information and service status
 */
export function healthCheckHandler(req: Request, res: Response): void {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime)
    },
    memory: {
      rss: formatBytes(memoryUsage.rss),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      external: formatBytes(memoryUsage.external)
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpus: os.cpus().length,
      totalMemory: formatBytes(os.totalmem()),
      freeMemory: formatBytes(os.freemem())
    },
    environment: process.env.NODE_ENV || 'development'
  };

  res.json(healthData);
}

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(\`\${days}d\`);
  if (hours > 0) parts.push(\`\${hours}h\`);
  if (minutes > 0) parts.push(\`\${minutes}m\`);
  parts.push(\`\${secs}s\`);

  return parts.join(' ');
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return \`\${size.toFixed(2)} \${units[unitIndex]}\`;
}
`;

  await ensureDir(path.join(projectPath, 'src/api/health'));
  await writeFile(
    path.join(projectPath, 'src/api/health/health.handler.ts'),
    healthHandlerContent
  );

  // Create README.md
  const readmeContent = `# ${config.name}

${config.description}

## 🚀 Quick Start

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
\`\`\`

## 📁 Project Structure

\`\`\`
src/
├── api/              # API routes and endpoints
├── config/           # Configuration files
├── middleware/       # Express middleware
├── shared/           # Shared utilities
└── index.ts          # Entry point
\`\`\`

## 🛠️ Technologies

- **Express** - Web framework
- **TypeScript** - Type safety
${config.validation === 'katax-core' ? '- **katax-core** - Schema validation\n' : ''}${config.authentication === 'jwt' ? '- **JWT** - Authentication\n' : ''}${config.database !== 'none' ? `- **${config.database}** - Database\n` : ''}
## 📚 API Documentation

Server runs on \`http://localhost:${config.port}\`

### Endpoints

- \`GET /\` - Welcome message
- \`GET /api/health\` - Health check

## 🔧 Development

Add new endpoints using Katax CLI:

\`\`\`bash
# Add a single endpoint
katax add endpoint users

# Generate CRUD resource
katax generate crud products
\`\`\`

## 📝 License

MIT
`;

  await writeFile(path.join(projectPath, 'README.md'), readmeContent);

  // Create default hola endpoint
  await createHolaEndpoint(projectPath, config);
}

async function createHolaEndpoint(projectPath: string, config: ProjectConfig): Promise<void> {
  const holaPath = path.join(projectPath, 'src/api/hola');

  // hola.controller.ts
  const controllerContent = [
    "import { ControllerResult, createSuccessResult, createErrorResult } from '../../shared/api.utils.js';",
    "import { HolaQuery } from './hola.validator.js';",
    "import { logger } from '../../shared/logger.utils.js';",
    "",
    "/**",
    " * Get hola message",
    " */",
    "export async function getHola(queryData: HolaQuery): Promise<ControllerResult<{ message: string; timestamp: string }>> {",
    "  try {",
    "    const name = queryData.name || 'World';",
    "    logger.debug({ name }, 'Processing hola request');",
    "    ",
    "    return createSuccessResult(",
    "      'Hola endpoint working!',",
    "      {",
    "        message: `Hola ${name}! Welcome to your API 🚀`,",
    "        timestamp: new Date().toISOString()",
    "      }",
    "    );",
    "  } catch (error) {",
    "    logger.error({ err: error }, 'Error in getHola controller');",
    "    return createErrorResult(",
    "      'Failed to get hola message',",
    "      error instanceof Error ? error.message : 'Unknown error',",
    "      500",
    "    );",
    "  }",
    "}"
  ].join('\n');

  await writeFile(path.join(holaPath, 'hola.controller.ts'), controllerContent);

  // hola.handler.ts
  const handlerContent = [
    "import { Request, Response } from 'express';",
    "import { getHola } from './hola.controller.js';",
    "import { validateHolaQuery } from './hola.validator.js';",
    "import { sendResponse } from '../../shared/api.utils.js';",
    "",
    "// ==================== HANDLERS ====================",
    "",
    "/**",
    " * Handler for GET /api/hola",
    " * Uses sendResponse utility for automatic validation and response handling",
    " */",
    "export async function getHolaHandler(req: Request, res: Response): Promise<void> {",
    "  await sendResponse(",
    "    req,",
    "    res,",
    "    // Validator returns Promise<ValidationResult<HolaQuery>>",
    "    () => validateHolaQuery(req.query),",
    "    // validData is automatically: HolaQuery (not any)",
    "    (validData) => getHola(validData)",
    "  );",
    "}"
  ].join('\n');

  await writeFile(path.join(holaPath, 'hola.handler.ts'), handlerContent);

  // hola.routes.ts
  const routesContent = [
    "import { Router } from 'express';",
    "import { getHolaHandler } from './hola.handler.js';",
    "",
    "const router = Router();",
    "",
    "// ==================== ROUTES ====================",
    "",
    "/**",
    " * @route GET /api/hola",
    " * @desc Example endpoint - returns a greeting message",
    " */",
    "router.get('/', getHolaHandler);",
    "",
    "export default router;"
  ].join('\n');

  await writeFile(path.join(holaPath, 'hola.routes.ts'), routesContent);

  // Only create validator if katax-core is enabled
  if (config.validation === 'katax-core') {
    const validatorContent = [
      "import { k, kataxInfer } from 'katax-core';",
      "import type { ValidationResult } from '../../shared/api.utils.js';",
      "",
      "// ==================== SCHEMAS ====================",
      "",
      "/**",
      " * Schema for hola query params",
      " */",
      "export const holaQuerySchema = k.object({",
      "  name: k.string().minLength(2).optional()",
      "});",
      "",
      "/**",
      " * Inferred TypeScript type from schema",
      " */",
      "export type HolaQuery = kataxInfer<typeof holaQuerySchema>;",
      "",
      "/**",
      " * Validate hola query params",
      " */",
      "export async function validateHolaQuery(data: unknown): Promise<ValidationResult<HolaQuery>> {",
      "  const result = holaQuerySchema.safeParse(data);",
      "",
      "  if (!result.success) {",
      "    const errors = result.issues.map(issue => ({",
      "      field: issue.path.join('.'),",
      "      message: issue.message",
      "    }));",
      "",
      "    return {",
      "      isValid: false,",
      "      errors",
      "    };",
      "  }",
      "",
      "  return {",
      "    isValid: true,",
      "    data: result.data",
      "  };",
      "}"
    ].join('\n');

    await writeFile(path.join(holaPath, 'hola.validator.ts'), validatorContent);
  }
}
