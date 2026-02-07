/**
 * Project structure generator
 * Creates base files for a new project using templates
 */

import path from 'path';
import { writeFile, ensureDir } from '../utils/file-utils.js';
import { ProjectConfig } from '../types/index.js';
import { CodeBuilder } from '../templates/base/code-builder.js';

export class ProjectStructureGenerator {
  constructor(private projectPath: string, private config: ProjectConfig) {}

  /**
   * Generate complete project structure
   */
  async generate(): Promise<void> {
    // Create directory structure
    await this.createDirectories();

    // Generate base files
    await this.generatePackageJson();
    await this.generateTsConfig();
    await this.generateEnvFile();
    await this.generateGitIgnore();
    await this.generateGitAttributes();

    // Generate source files
    await this.generateIndexFile();
    await this.generateAppFile();
    await this.generateRoutesFile();

    // Generate config files
    await this.generateCorsConfig();
    await this.generateEnvValidator();

    // Generate middleware
    await this.generateErrorMiddleware();
    await this.generateLoggerMiddleware();

    // Generate shared utilities
    await this.generateResultTypes();
    await this.generateErrorTypes();
    await this.generateLoggerUtils();
    await this.generateResponseUtils();
    
    if (this.config.authentication === 'jwt') {
      await this.generateJwtUtils();
    }

    // Generate DI container
    await this.generateDIContainer();

    // Generate database connection
    if (this.config.database !== 'none') {
      await this.generateDatabaseConnection();
    }

    // Generate health check
    await this.generateHealthCheck();
    
    // Generate hello example
    await this.generateHelloExample();
  }

  private async createDirectories(): Promise<void> {
    const dirs = [
      'src',
      'src/api',
      'src/api/hello',
      'src/api/health',
      'src/config',
      'src/middleware',
      'src/shared',
      'src/core'
    ];

    if (this.config.database !== 'none') {
      dirs.push('src/database');
    }

    for (const dir of dirs) {
      await ensureDir(path.join(this.projectPath, dir));
    }
  }

  private async generateIndexFile(): Promise<void> {
    const builder = new CodeBuilder();
    
    builder
      .importDefault('app', './app.js')
      .importDefault('dotenv', 'dotenv')
      .import(['logger'], './shared/logger.utils.js')
      .import(['validateEnvironment'], './config/env.validator.js')
      .line()
      .line('dotenv.config();')
      .line()
      .comment('Validate required environment variables')
      .line('validateEnvironment();')
      .line()
      .line(`const PORT = process.env.PORT || ${this.config.port};`)
      .line()
      .line('app.listen(PORT, () => {')
      .line(`  logger.info(\`Server running on http://localhost:\${PORT}\`);`)
      .line(`  logger.info(\`API endpoints available at http://localhost:\${PORT}/api\`);`)
      .line(`  logger.info(\`Health check: http://localhost:\${PORT}/api/health\`);`)
      .line('});');

    await writeFile(
      path.join(this.projectPath, 'src/index.ts'),
      builder.build()
    );
  }

  private async generateAppFile(): Promise<void> {
    const builder = new CodeBuilder();
    
    builder
      .importDefault('express', 'express')
      .importDefault('cors', 'cors')
      .importDefault('router', './api/routes.js')
      .import(['errorMiddleware'], './middleware/error.middleware.js')
      .import(['requestLogger'], './middleware/logger.middleware.js')
      .import(['corsOptions'], './config/cors.config.js')
      .line()
      .line('const app = express();')
      .line()
      .comment('Middleware')
      .line('app.use(cors(corsOptions));')
      .line('app.use(express.json());')
      .line('app.use(express.urlencoded({ extended: true }));')
      .line('app.use(requestLogger);')
      .line()
      .comment('Root route')
      .line("app.get('/', (req, res) => {")
      .line('  res.json({')
      .line(`    message: 'Welcome to ${this.config.name} API',`)
      .line(`    version: '1.0.0',`)
      .line(`    endpoints: '/api',`)
      .line(`    health: '/api/health'`)
      .line('  });')
      .line('});')
      .line()
      .comment('API Routes')
      .line("app.use('/api', router);")
      .line()
      .comment('Error handling')
      .line('app.use(errorMiddleware);')
      .line()
      .line('export default app;');

    await writeFile(
      path.join(this.projectPath, 'src/app.ts'),
      builder.build()
    );
  }

  private async generateRoutesFile(): Promise<void> {
    const builder = new CodeBuilder();
    
    builder
      .import(['Router'], 'express')
      .importDefault('helloRouter', './hello/hello.routes.js')
      .import(['healthCheckHandler'], './health/health.handler.js')
      .line()
      .line('const router = Router();')
      .line()
      .comment('Health check')
      .line("router.get('/health', healthCheckHandler);")
      .line()
      .comment('Example endpoint')
      .line("router.use('/hello', helloRouter);")
      .line()
      .line('export default router;');

    await writeFile(
      path.join(this.projectPath, 'src/api/routes.ts'),
      builder.build()
    );
  }

  private async generateResultTypes(): Promise<void> {
    // Copy from our core/result.ts
    const fs = await import('fs/promises');
    const sourceFile = path.join(process.cwd(), 'src/core/result.ts');
    const destFile = path.join(this.projectPath, 'src/core/result.ts');
    
    try {
      const content = await fs.readFile(sourceFile, 'utf-8');
      await writeFile(destFile, content);
    } catch (error) {
      // Fallback: write minimal version
      const builder = new CodeBuilder();
      builder
        .comment('Type-safe Result pattern')
        .line('export type Ok<T> = { readonly ok: true; readonly value: T };')
        .line('export type Err<E> = { readonly ok: false; readonly error: E };')
        .line('export type Result<T, E = Error> = Ok<T> | Err<E>;')
        .line()
        .line('export function ok<T>(value: T): Ok<T> {')
        .line('  return { ok: true, value };')
        .line('}')
        .line()
        .line('export function err<E>(error: E): Err<E> {')
        .line('  return { ok: false, error };')
        .line('}')
        .line()
        .line('export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {')
        .line('  return result.ok === true;')
        .line('}');
      
      await writeFile(destFile, builder.build());
    }
  }

  private async generateErrorTypes(): Promise<void> {
    // Copy from our core/errors.ts
    const fs = await import('fs/promises');
    const sourceFile = path.join(process.cwd(), 'src/core/errors.ts');
    const destFile = path.join(this.projectPath, 'src/core/errors.ts');
    
    try {
      const content = await fs.readFile(sourceFile, 'utf-8');
      await writeFile(destFile, content);
    } catch (error) {
      // Fallback: write minimal version
      const builder = new CodeBuilder();
      builder
        .comment('Application error hierarchy')
        .line('export abstract class AppError extends Error {')
        .line('  abstract readonly statusCode: number;')
        .line('  abstract readonly code: string;')
        .line('  readonly timestamp: Date = new Date();')
        .line()
        .line('  constructor(message: string, public readonly details?: Record<string, any>) {')
        .line('    super(message);')
        .line('    this.name = this.constructor.name;')
        .line('    Error.captureStackTrace(this, this.constructor);')
        .line('  }')
        .line('}')
        .line()
        .line('export class ValidationError extends AppError {')
        .line('  readonly statusCode = 400;')
        .line('  readonly code = "VALIDATION_ERROR";')
        .line('}')
        .line()
        .line('export class NotFoundError extends AppError {')
        .line('  readonly statusCode = 404;')
        .line('  readonly code = "NOT_FOUND";')
        .line('}');
      
      await writeFile(destFile, builder.build());
    }
  }

  private async generateLoggerUtils(): Promise<void> {
    const builder = new CodeBuilder();
    
    builder
      .importDefault('pino', 'pino')
      .line()
      .line("const isDev = process.env.NODE_ENV !== 'production';")
      .line()
      .line('export const logger = pino({')
      .line('  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),')
      .line('  transport: isDev')
      .line('    ? {')
      .line('        target: "pino-pretty",')
      .line('        options: {')
      .line('          colorize: true,')
      .line('          translateTime: "SYS:standard",')
      .line('          ignore: "pid,hostname"')
      .line('        }')
      .line('      }')
      .line('    : undefined')
      .line('});')
      .line()
      .line('export type Logger = typeof logger;');

    await writeFile(
      path.join(this.projectPath, 'src/shared/logger.utils.ts'),
      builder.build()
    );
  }

  private async generateResponseUtils(): Promise<void> {
    const { generateResponseUtils } = await import('../templates/generators/response-utils-template.js');
    
    const content = generateResponseUtils();

    await writeFile(
      path.join(this.projectPath, 'src/shared/response.utils.ts'),
      content
    );
  }

  // More generator methods follow...
  private async generatePackageJson(): Promise<void> {
    const packageJson = {
      name: this.config.name,
      version: '1.0.0',
      description: this.config.description,
      type: 'module',
      main: 'dist/index.js',
      scripts: {
        dev: 'nodemon --watch src --exec tsx src/index.ts',
        build: 'tsc',
        start: 'node dist/index.js',
        'type-check': 'tsc --noEmit'
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
        ...(this.config.validation === 'katax-core' && { 'katax-core': '^1.1.0' }),
        ...(this.config.authentication === 'jwt' && {
          jsonwebtoken: '^9.0.2',
          bcrypt: '^5.1.1'
        }),
        ...(this.config.database === 'postgresql' && { pg: '^8.11.3' }),
        ...(this.config.database === 'mysql' && { mysql2: '^3.6.5' }),
        ...(this.config.database === 'mongodb' && { mongodb: '^6.3.0' })
      },
      devDependencies: {
        '@types/express': '^4.17.21',
        '@types/cors': '^2.8.17',
        '@types/node': '^20.10.6',
        ...(this.config.authentication === 'jwt' && {
          '@types/jsonwebtoken': '^9.0.5',
          '@types/bcrypt': '^5.0.2'
        }),
        ...(this.config.database === 'postgresql' && { '@types/pg': '^8.10.9' }),
        typescript: '^5.3.3',
        tsx: '^4.19.2',
        nodemon: '^3.1.7'
      }
    };

    await writeFile(
      path.join(this.projectPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  private async generateTsConfig(): Promise<void> {
    const tsconfig = {
      compilerOptions: {
        // Target ES2022 - Compatible with Node.js 18+ (Ubuntu LTS)
        target: 'ES2022',
        module: 'ESNext',
        lib: ['ES2022'],
        
        // Use Node.js module resolution for VPS deployment
        moduleResolution: 'node',
        
        // ES Module support (no require, pure import/export)
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        
        // Strict type checking
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        
        // Module options
        resolveJsonModule: true,
        
        // Emit options - Optimized for production
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        removeComments: true,
        rootDir: './src',
        outDir: './dist'
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    };

    await writeFile(
      path.join(this.projectPath, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2)
    );
  }

  private async generateEnvFile(): Promise<void> {
    const lines: string[] = [
      '# Server Configuration',
      `PORT=${this.config.port}`,
      `NODE_ENV=development`,
      ''
    ];

    if (this.config.database !== 'none' && this.config.dbConfig) {
      lines.push('# Database Configuration');
      lines.push(`DB_HOST=${this.config.dbConfig.host || 'localhost'}`);
      lines.push(`DB_PORT=${this.config.dbConfig.port || ''}`);
      if (this.config.dbConfig.user) lines.push(`DB_USER=${this.config.dbConfig.user}`);
      if (this.config.dbConfig.password) lines.push(`DB_PASSWORD=${this.config.dbConfig.password}`);
      if (this.config.dbConfig.database) lines.push(`DB_NAME=${this.config.dbConfig.database}`);
      lines.push('');
      lines.push('# Connection Pool Settings (optional - defaults are set)');
      lines.push('DB_POOL_MAX=20    # Maximum connections in pool');
      lines.push('DB_POOL_MIN=2     # Minimum connections in pool');
      lines.push('');
    }

    if (this.config.authentication === 'jwt') {
      lines.push('# JWT Configuration');
      lines.push('JWT_SECRET=your-secret-key-here');
      lines.push('JWT_REFRESH_SECRET=your-refresh-secret-here');
      lines.push('JWT_EXPIRES_IN=15m');
      lines.push('JWT_REFRESH_EXPIRES_IN=7d');
      lines.push('');
    }

    await writeFile(path.join(this.projectPath, '.env'), lines.join('\n'));
  }

  private async generateGitIgnore(): Promise<void> {
    const content = `node_modules/
dist/
.env
.env.local
.env.*.local
*.log
.DS_Store
coverage/
.vscode/
.idea/
`;
    await writeFile(path.join(this.projectPath, '.gitignore'), content);
  }

  private async generateGitAttributes(): Promise<void> {
    const content = `# Auto normalize line endings to LF
* text=auto eol=lf

# Explicit file types
*.ts text eol=lf
*.js text eol=lf
*.json text eol=lf
*.md text eol=lf
`;
    await writeFile(path.join(this.projectPath, '.gitattributes'), content);
  }

  private async generateCorsConfig(): Promise<void> {
    const builder = new CodeBuilder();
    
    builder
      .import(['CorsOptions'], 'cors')
      .line()
      .line('const allowedOrigins = process.env.ALLOWED_ORIGINS')
      .line('  ? process.env.ALLOWED_ORIGINS.split(",")')
      .line('  : ["http://localhost:3000"];')
      .line()
      .line('export const corsOptions: CorsOptions = {')
      .line('  origin: (origin, callback) => {')
      .line('    if (!origin || allowedOrigins.includes(origin)) {')
      .line('      callback(null, true);')
      .line('    } else {')
      .line('      callback(new Error("Not allowed by CORS"));')
      .line('    }')
      .line('  },')
      .line('  credentials: true')
      .line('};');

    await writeFile(
      path.join(this.projectPath, 'src/config/cors.config.ts'),
      builder.build()
    );
  }

  private async generateEnvValidator(): Promise<void> {
    const builder = new CodeBuilder();
    
    if (this.config.validation === 'katax-core') {
      builder
        .import(['k'], 'katax-core')
        .line()
        .line('const envSchema = k.object({')
        .line('  PORT: k.string().optional(),')
        .line(`  NODE_ENV: k.enum(['development', 'production', 'test']).optional(),`);
      
      if (this.config.database !== 'none') {
        builder
          .line('  DB_HOST: k.string(),')
          .line('  DB_PORT: k.string(),')
          .line('  DB_USER: k.string(),')
          .line('  DB_PASSWORD: k.string(),')
          .line('  DB_NAME: k.string(),');
      }
      
      if (this.config.authentication === 'jwt') {
        builder
          .line('  JWT_SECRET: k.string(),')
          .line('  JWT_REFRESH_SECRET: k.string(),');
      }
      
      builder
        .line('});')
        .line()
        .line('export function validateEnvironment(): void {')
        .line('  const result = envSchema.safeParse(process.env);')
        .line('  if (!result.success) {')
        .line('    console.error("❌ Invalid environment variables:");')
        .line('    console.error(result.errors);')
        .line('    process.exit(1);')
        .line('  }')
        .line('}');
    } else {
      builder
        .line('export function validateEnvironment(): void {')
        .line('  // Add environment validation here')
        .line('}');
    }

    await writeFile(
      path.join(this.projectPath, 'src/config/env.validator.ts'),
      builder.build()
    );
  }

  private async generateErrorMiddleware(): Promise<void> {
    const builder = new CodeBuilder();
    
    builder
      .import(['Request', 'Response', 'NextFunction'], 'express')
      .import(['isAppError', 'InternalServerError'], '../core/errors.js')
      .import(['logger'], '../shared/logger.utils.js')
      .line()
      .comment('Global error handling middleware')
      .line('export function errorMiddleware(')
      .line('  err: Error,')
      .line('  req: Request,')
      .line('  res: Response,')
      .line('  next: NextFunction')
      .line('): void {')
      .line('  logger.error("Error occurred:", err);')
      .line()
      .line('  const error = isAppError(err) ? err : InternalServerError.fromError(err);')
      .line()
      .line('  res.status(error.statusCode).json({')
      .line('    success: false,')
      .line('    error: error.toJSON()')
      .line('  });')
      .line('}');

    await writeFile(
      path.join(this.projectPath, 'src/middleware/error.middleware.ts'),
      builder.build()
    );
  }

  private async generateLoggerMiddleware(): Promise<void> {
    const builder = new CodeBuilder();
    
    builder
      .import(['Request', 'Response', 'NextFunction'], 'express')
      .import(['logger'], '../shared/logger.utils.js')
      .line()
      .comment('Request logging middleware')
      .line('export function requestLogger(')
      .line('  req: Request,')
      .line('  res: Response,')
      .line('  next: NextFunction')
      .line('): void {')
      .line('  const start = Date.now();')
      .line()
      .line('  res.on("finish", () => {')
      .line('    const duration = Date.now() - start;')
      .line('    logger.info({')
      .line('      method: req.method,')
      .line('      url: req.url,')
      .line('      status: res.statusCode,')
      .line('      duration: `${duration}ms`')
      .line('    });')
      .line('  });')
      .line()
      .line('  next();')
      .line('}');

    await writeFile(
      path.join(this.projectPath, 'src/middleware/logger.middleware.ts'),
      builder.build()
    );
  }

  private async generateJwtUtils(): Promise<void> {
    // Simplified version - full implementation would be longer
    const content = `import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export function generateTokens(payload: any) {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
  
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
  
  return { accessToken, refreshToken };
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }
  
  jwt.verify(token, process.env.JWT_SECRET!, (err, user) => {
    if (err) {
      res.status(403).json({ success: false, error: 'Invalid token' });
      return;
    }
    (req as any).user = user;
    next();
  });
}
`;
    await writeFile(
      path.join(this.projectPath, 'src/shared/jwt.utils.ts'),
      content
    );
  }

  private async generateDatabaseConnection(): Promise<void> {
    const builder = new CodeBuilder();
    
    if (this.config.database === 'postgresql') {
      builder
        .import(['Pool', 'PoolClient'], 'pg')
        .importDefault('dotenv', 'dotenv')
        .line()
        .line('dotenv.config();')
        .line()
        .comment('PostgreSQL connection pool with production settings')
        .line('const pool = new Pool({')
        .line('  host: process.env.DB_HOST || "localhost",')
        .line('  port: Number(process.env.DB_PORT) || 5432,')
        .line('  database: process.env.DB_NAME,')
        .line('  user: process.env.DB_USER,')
        .line('  password: process.env.DB_PASSWORD,')
        .line('  // Connection pool settings')
        .line('  max: Number(process.env.DB_POOL_MAX) || 20,          // Maximum pool size')
        .line('  min: Number(process.env.DB_POOL_MIN) || 2,           // Minimum pool size')
        .line('  idleTimeoutMillis: 30000,                             // Close idle clients after 30s')
        .line('  connectionTimeoutMillis: 5000,                        // Connection timeout')
        .line('  // Retry and error handling')
        .line('  allowExitOnIdle: false,                               // Keep pool alive')
        .line('  statement_timeout: 30000,                             // 30s query timeout')
        .line('});')
        .line()
        .comment('Connection event handlers')
        .line('pool.on("connect", (client: PoolClient) => {')
        .line('  console.log("✅ New PostgreSQL client connected");')
        .line('  // Set session-level settings if needed')
        .line('  // client.query("SET timezone = \'UTC\'");')
        .line('});')
        .line()
        .line('pool.on("acquire", () => {')
        .line('  console.log("📤 PostgreSQL client checked out from pool");')
        .line('});')
        .line()
        .line('pool.on("remove", () => {')
        .line('  console.log("🗑️  PostgreSQL client removed from pool");')
        .line('});')
        .line()
        .line('pool.on("error", (err: Error) => {')
        .line('  console.error("❌ PostgreSQL pool error:", err);')
        .line('  // Don\'t exit - let the pool handle reconnection')
        .line('});')
        .line()
        .comment('Test connection on startup')
        .line('pool.query("SELECT NOW()")')
        .line('  .then(() => console.log("✅ PostgreSQL connection successful"))')
        .line('  .catch((err) => {')
        .line('    console.error("❌ PostgreSQL connection failed:", err);')
        .line('    process.exit(1);')
        .line('  });')
        .line()
        .comment('Graceful shutdown')
        .line('process.on("SIGTERM", async () => {')
        .line('  console.log("🛑 SIGTERM received, closing PostgreSQL pool...");')
        .line('  await pool.end();')
        .line('  console.log("✅ PostgreSQL pool closed");')
        .line('  process.exit(0);')
        .line('});')
        .line()
        .comment('Health check function')
        .line('export async function checkDatabaseHealth(): Promise<boolean> {')
        .line('  try {')
        .line('    const result = await pool.query("SELECT 1 as health");')
        .line('    return result.rows[0].health === 1;')
        .line('  } catch (error) {')
        .line('    console.error("Database health check failed:", error);')
        .line('    return false;')
        .line('  }')
        .line('}')
        .line()
        .line('export default pool;');
    } else if (this.config.database === 'mysql') {
      builder
        .importDefault('mysql', 'mysql2/promise')
        .importDefault('dotenv', 'dotenv')
        .line()
        .line('dotenv.config();')
        .line()
        .comment('MySQL connection pool with production settings')
        .line('const pool = mysql.createPool({')
        .line('  host: process.env.DB_HOST || "localhost",')
        .line('  port: Number(process.env.DB_PORT) || 3306,')
        .line('  database: process.env.DB_NAME,')
        .line('  user: process.env.DB_USER,')
        .line('  password: process.env.DB_PASSWORD,')
        .line('  // Connection pool settings')
        .line('  waitForConnections: true,                              // Wait for available connection')
        .line('  connectionLimit: Number(process.env.DB_POOL_MAX) || 10, // Max connections')
        .line('  maxIdle: 10,                                           // Max idle connections')
        .line('  idleTimeout: 60000,                                    // Idle timeout (60s)')
        .line('  queueLimit: 0,                                         // No limit on queue')
        .line('  enableKeepAlive: true,                                 // Keep connections alive')
        .line('  keepAliveInitialDelay: 0,                              // Start keep-alive immediately')
        .line('  // Timeouts')
        .line('  connectTimeout: 10000,                                 // 10s connection timeout')
        .line('  acquireTimeout: 10000,                                 // 10s acquire timeout')
        .line('  timeout: 30000,                                        // 30s query timeout')
        .line('  // Charset and timezone')
        .line('  charset: "utf8mb4",                                    // UTF-8 support')
        .line('  timezone: "Z",                                         // UTC timezone')
        .line('});')
        .line()
        .comment('Test connection on startup')
        .line('pool.getConnection()')
        .line('  .then((connection) => {')
        .line('    console.log("✅ MySQL connection successful");')
        .line('    connection.release();')
        .line('  })')
        .line('  .catch((err) => {')
        .line('    console.error("❌ MySQL connection failed:", err);')
        .line('    process.exit(1);')
        .line('  });')
        .line()
        .comment('Graceful shutdown')
        .line('process.on("SIGTERM", async () => {')
        .line('  console.log("🛑 SIGTERM received, closing MySQL pool...");')
        .line('  await pool.end();')
        .line('  console.log("✅ MySQL pool closed");')
        .line('  process.exit(0);')
        .line('});')
        .line()
        .comment('Health check function')
        .line('export async function checkDatabaseHealth(): Promise<boolean> {')
        .line('  try {')
        .line('    const [rows] = await pool.query("SELECT 1 as health");')
        .line('    return Array.isArray(rows) && rows.length > 0;')
        .line('  } catch (error) {')
        .line('    console.error("Database health check failed:", error);')
        .line('    return false;')
        .line('  }')
        .line('}')
        .line()
        .line('export default pool;');
    } else if (this.config.database === 'mongodb') {
      builder
        .import(['MongoClient', 'Db', 'MongoClientOptions'], 'mongodb')
        .importDefault('dotenv', 'dotenv')
        .line()
        .line('dotenv.config();')
        .line()
        .comment('MongoDB connection configuration')
        .line('const user = process.env.DB_USER;')
        .line('const password = process.env.DB_PASSWORD;')
        .line('const host = process.env.DB_HOST || "localhost:27017";')
        .line('const dbName = process.env.DB_NAME;')
        .line()
        .comment('Build connection URI')
        .line('const isAtlas = host.includes(".mongodb.net");')
        .line('const protocol = isAtlas ? "mongodb+srv" : "mongodb";')
        .line('const authString = user && password ? `${user}:${password}@` : "";')
        .line('const uri = `${protocol}://${authString}${host}/${dbName}?retryWrites=true&w=majority`;')
        .line()
        .comment('MongoDB client options - Production settings')
        .line('const options: MongoClientOptions = {')
        .line('  maxPoolSize: Number(process.env.DB_POOL_MAX) || 10,  // Max connections')
        .line('  minPoolSize: Number(process.env.DB_POOL_MIN) || 2,   // Min connections')
        .line('  maxIdleTimeMS: 60000,                                 // Close idle after 60s')
        .line('  serverSelectionTimeoutMS: 5000,                       // 5s timeout')
        .line('  socketTimeoutMS: 45000,                               // 45s socket timeout')
        .line('  connectTimeoutMS: 10000,                              // 10s connection timeout')
        .line('  retryWrites: true,                                    // Retry writes')
        .line('  retryReads: true,                                     // Retry reads')
        .line('};')
        .line()
        .line('const client = new MongoClient(uri, options);')
        .line('let db: Db | null = null;')
        .line()
        .comment('Connect to MongoDB')
        .line('client.connect()')
        .line('  .then(() => {')
        .line('    console.log("✅ MongoDB connected successfully");')
        .line('    db = client.db(dbName);')
        .line('    // Ping to verify connection')
        .line('    return db.admin().ping();')
        .line('  })')
        .line('  .then(() => console.log("✅ MongoDB ping successful"))')
        .line('  .catch((err) => {')
        .line('    console.error("❌ MongoDB connection failed:", err);')
        .line('    process.exit(1);')
        .line('  });')
        .line()
        .comment('Graceful shutdown')
        .line('process.on("SIGTERM", async () => {')
        .line('  console.log("🛑 SIGTERM received, closing MongoDB connection...");')
        .line('  await client.close();')
        .line('  console.log("✅ MongoDB connection closed");')
        .line('  process.exit(0);')
        .line('});')
        .line()
        .comment('Get database instance')
        .line('export function getDatabase(): Db {')
        .line('  if (!db) {')
        .line('    throw new Error("Database not initialized. Call connect() first.");')
        .line('  }')
        .line('  return db;')
        .line('}')
        .line()
        .comment('Health check function')
        .line('export async function checkDatabaseHealth(): Promise<boolean> {')
        .line('  try {')
        .line('    const database = getDatabase();')
        .line('    await database.admin().ping();')
        .line('    return true;')
        .line('  } catch (error) {')
        .line('    console.error("Database health check failed:", error);')
        .line('    return false;')
        .line('  }')
        .line('}')
        .line()
        .line('export default client;');
    }

    await writeFile(
      path.join(this.projectPath, 'src/database/connection.ts'),
      builder.build()
    );
  }

  /**
   * Generate DI container
   */
  private async generateDIContainer(): Promise<void> {
    const { generateDIContainer } = await import('../templates/generators/di-container.js');
    
    const content = generateDIContainer({
      hasDatabase: !!this.config.database && this.config.database !== 'none',
      database: this.config.database !== 'none' ? this.config.database : undefined
    });

    await writeFile(
      path.join(this.projectPath, 'src/container.ts'),
      content
    );
  }

  /**
   * Generate hello example endpoint
   */
  private async generateHelloExample(): Promise<void> {
    // Create hello directory
    await ensureDir(path.join(this.projectPath, 'src/api/hello'));

    // Generate validator
    const validatorContent = `import { k, kataxInfer } from 'katax-core';

// ==================== SCHEMAS ====================

export const helloQuerySchema = k.object({
  name: k.string().min(1).max(50).optional()
});

export type HelloQueryData = kataxInfer<typeof helloQuerySchema>;

// ==================== VALIDATORS ====================

export async function validateHelloQuery(data: unknown) {
  return await helloQuerySchema.safeParse(data);
}
`;
    await writeFile(
      path.join(this.projectPath, 'src/api/hello/hello.validator.ts'),
      validatorContent
    );

    // Generate hello controller
    const controllerContent = `import { Result, ok } from '../../core/result.js';
import { AppError } from '../../core/errors.js';
import { HelloQueryData } from './hello.validator.js';
import { logger } from '../../shared/logger.utils.js';

/**
 * Hello controller - Example endpoint
 */
export class HelloController {
  async greet(query: HelloQueryData): Promise<Result<{ message: string }, AppError>> {
    const name = query.name || 'World';
    logger.info('Greeting', { name });
    
    return ok({ message: \`Hello, \${name}! Welcome to ${this.config.name} API.\` });
  }
}
`;
    await writeFile(
      path.join(this.projectPath, 'src/api/hello/hello.controller.ts'),
      controllerContent
    );

    // Generate hello handler
    const handlerContent = `import { Request, Response } from 'express';
import { isOk } from '../../core/result.js';
import { isAppError, InternalServerError } from '../../core/errors.js';
import { HelloController } from './hello.controller.js';
import { validateHelloQuery } from './hello.validator.js';

const helloController = new HelloController();

/**
 * Get hello handler
 */
export async function getHelloHandler(req: Request, res: Response): Promise<void> {
  // Validate query params
  const validationResult = await validateHelloQuery(req.query);
  if (!validationResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        errors: validationResult.errors
      }
    });
    return;
  }

  const result = await helloController.greet(validationResult.data);

  if (isOk(result)) {
    res.status(200).json({
      success: true,
      data: result.value
    });
    return;
  }

  const error = isAppError(result.error) ? result.error : InternalServerError.fromError(result.error as Error);
  res.status(error.statusCode).json({
    success: false,
    error: error.toJSON()
  });
}
`;
    await writeFile(
      path.join(this.projectPath, 'src/api/hello/hello.handler.ts'),
      handlerContent
    );

    // Generate hello routes
    const routesContent = `import { Router } from 'express';
import { getHelloHandler } from './hello.handler.js';

const router = Router();

router.get('/', getHelloHandler);

export default router;
`;
    await writeFile(
      path.join(this.projectPath, 'src/api/hello/hello.routes.ts'),
      routesContent
    );
  }

  private async generateHealthCheck(): Promise<void> {
    const builder = new CodeBuilder();
    
    builder
      .import(['Request', 'Response'], 'express')
      .line();
    
    // Import health check if database is configured
    if (this.config.database !== 'none') {
      builder.import(['checkDatabaseHealth'], '../database/connection.js').line();
    }
    
    builder
      .comment('Health check handler with database status')
      .line('export async function healthCheckHandler(req: Request, res: Response): Promise<void> {')
      .line('  const health = {')
      .line('    status: \"ok\",')
      .line('    timestamp: new Date().toISOString(),')
      .line('    uptime: process.uptime(),')
      .line('    memory: {')
      .line('      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),')
      .line('      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),')
      .line('      unit: \"MB\"')
      .line('    },')
      .line('    environment: process.env.NODE_ENV || \"development\"');
    
    if (this.config.database !== 'none') {
      builder
        .line('  };')
        .line()
        .comment('Check database connection')
        .line('  try {')
        .line('    const dbHealthy = await checkDatabaseHealth();')
        .line('    Object.assign(health, {')
        .line('      database: {')
        .line('        status: dbHealthy ? \"connected\" : \"disconnected\",')
        .line(`        type: \"${this.config.database}\"`)
        .line('      }')
        .line('    });')
        .line('  } catch (error) {')
        .line('    Object.assign(health, {')
        .line('      database: { status: \"error\", type: \"${this.config.database}\" }')
        .line('    });')
        .line('  }')
        .line()
        .line('  res.json(health);')
        .line('}');
    } else {
      builder
        .line('  };')
        .line()
        .line('  res.json(health);')
        .line('}');
    }

    await writeFile(
      path.join(this.projectPath, 'src/api/health/health.handler.ts'),
      builder.build()
    );
  }
}
