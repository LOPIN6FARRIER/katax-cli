import chalk from "chalk";
import ora from "ora";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { OpenAPIGenerator } from "../services/openapi-generator.service.js";
import {
  generateSwaggerSetup,
  generateSwaggerReadme,
} from "../templates/generators/swagger-template.js";
import { success, error, warning, info, title } from "../utils/logger.js";
import { writeFile } from "../utils/file-utils.js";

interface GenerateDocsOptions {
  force?: boolean;
  output?: string;
  port?: string;
  url?: string;
}

function extractPort(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^['\"]|['\"]$/g, "");
  const match = trimmed.match(/\b(\d{2,5})\b/);
  if (!match) return undefined;
  const port = Number(match[1]);
  if (Number.isNaN(port) || port < 1 || port > 65535) return undefined;
  return String(port);
}

function resolveProjectPort(projectPath: string, preferredPort?: string): string {
  const fromOption = extractPort(preferredPort);
  if (fromOption) return fromOption;

  const envPath = path.join(projectPath, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const portMatch = envContent.match(/^PORT\s*=\s*(.+)$/m);
    const fromEnv = extractPort(portMatch?.[1]);
    if (fromEnv) return fromEnv;
  }

  const indexPath = path.join(projectPath, "src", "index.ts");
  if (existsSync(indexPath)) {
    const indexContent = readFileSync(indexPath, "utf-8");

    const patterns = [
      /katax\.env\(\s*['\"]PORT['\"]\s*,\s*['\"](\d{2,5})['\"]\s*\)/,
      /process\.env\.PORT\s*\|\|\s*['\"]?(\d{2,5})['\"]?/,
      /process\.env\.PORT\s*\?\?\s*['\"]?(\d{2,5})['\"]?/,
    ];

    for (const pattern of patterns) {
      const match = indexContent.match(pattern);
      const parsed = extractPort(match?.[1]);
      if (parsed) return parsed;
    }
  }

  return "3000";
}

/**
 * Auto-regenerate documentation silently (for use after CRUD/endpoint generation)
 */
export async function autoRegenerateDocs(
  projectPath: string = process.cwd(),
): Promise<void> {
  try {
    // Check if project has API directory
    const apiPath = path.join(projectPath, "src", "api");
    if (!existsSync(apiPath)) {
      return; // Skip if no API structure
    }

    // Generate OpenAPI spec
    const generator = new OpenAPIGenerator(projectPath);
    const spec = await generator.generate();

    // Enhance with package.json info
    const packageJsonPath = path.join(projectPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      spec.info.title = packageJson.name || spec.info.title;
      spec.info.version = packageJson.version || spec.info.version;
      spec.info.description = packageJson.description || spec.info.description;
    }

    // Write OpenAPI spec
    const outputPath = path.join(projectPath, "src", "openapi.json");
    await writeFile(outputPath, JSON.stringify(spec, null, 2));

    info(
      `📖 API documentation updated (${Object.values(spec.paths).reduce(
        (count: number, methods: any) => count + Object.keys(methods).length,
        0,
      )} endpoints)`,
    );
  } catch (err) {
    // Silent fail - documentation generation should not block main operations
  }
}

/**
 * Generate API documentation (Swagger/OpenAPI)
 */
export async function generateDocsCommand(
  options: GenerateDocsOptions = {},
): Promise<void> {
  title("📖 Generate API Documentation");

  const projectPath = process.cwd();

  // Check if it's a valid project
  if (!existsSync(path.join(projectPath, "src"))) {
    error("Not a valid project! Run this command from your API project root.");
    info('Must have a "src" directory with API structure.');
    process.exit(1);
  }

  // Check for API directory
  const apiPath = path.join(projectPath, "src", "api");
  if (!existsSync(apiPath)) {
    warning("No API routes found in src/api directory.");
    info("Generate some endpoints first:");
    info(`  ${chalk.cyan("katax generate crud users")}`);
    info(`  ${chalk.cyan("katax add endpoint products")}`);
    process.exit(1);
  }

  const spinner = ora("Scanning project structure...").start();

  try {
    // Read production URL from options or .env
    const envPath = path.join(projectPath, ".env");
    let port = resolveProjectPort(projectPath, options.port);
    let productionUrl = options.url;

    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, "utf-8");
      if (!productionUrl) {
        const urlMatch = envContent.match(/^(?:API_URL|PRODUCTION_URL)\s*=\s*(.+)/m);
        if (urlMatch) productionUrl = urlMatch[1].trim();
      }
    }

    // Generate OpenAPI spec
    const generator = new OpenAPIGenerator(projectPath, {
      port,
      productionUrl,
    });
    const spec = await generator.generate();

    spinner.text = "Generating OpenAPI specification...";

    // Enhance spec with project info if package.json exists
    const packageJsonPath = path.join(projectPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      spec.info.title = packageJson.name || spec.info.title;
      spec.info.version = packageJson.version || spec.info.version;
      spec.info.description = packageJson.description || spec.info.description;
    }

    // Write OpenAPI spec
    const outputPath =
      options.output || path.join(projectPath, "src", "openapi.json");
    await writeFile(outputPath, JSON.stringify(spec, null, 2));

    spinner.succeed("OpenAPI specification generated");

    // Setup Swagger UI (if not already setup)
    await setupSwaggerUI(projectPath, options.force, port);

    // Summary
    success("\n✅ API Documentation generated successfully!\n");

    // Count endpoints
    const endpointCount = Object.values(spec.paths).reduce(
      (count: number, methods: any) => count + Object.keys(methods).length,
      0,
    );

    info(`📊 Documentation Stats:`);
    info(`   ${chalk.cyan("Endpoints:")} ${endpointCount}`);
    info(
      `   ${chalk.cyan("Schemas:")} ${Object.keys(spec.components?.schemas || {}).length}`,
    );
    info(
      `   ${chalk.cyan("Tags:")} ${
        new Set(
          Object.values(spec.paths).flatMap((methods: any) =>
            Object.values(methods).flatMap((method: any) => method.tags || []),
          ),
        ).size
      }`,
    );

    // Get port: from option, then .env, then default 3000
    // Note: port variable already set above when creating OpenAPIGenerator

    info(`\n📖 View documentation:`);
    info(
      `   ${chalk.cyan("npm run dev")} then open ${chalk.green(`http://localhost:${port}/docs`)}`,
    );
    if (productionUrl) {
      info(`   ${chalk.cyan("Production:")} ${chalk.green(`${productionUrl}/docs`)}`);
    }
    info(
      `\n📄 OpenAPI spec: ${chalk.gray(path.relative(projectPath, outputPath))}\n`,
    );
  } catch (err: any) {
    spinner.fail("Failed to generate documentation");
    error(err.message);
    if (err.stack) {
      console.error(chalk.gray(err.stack));
    }
    process.exit(1);
  }
}

/**
 * Setup Swagger UI in the project
 */
async function setupSwaggerUI(
  projectPath: string,
  force: boolean = false,
  port: string = "3000",
): Promise<void> {
  const configDir = path.join(projectPath, "src", "config");
  const swaggerConfigPath = path.join(configDir, "swagger.config.ts");

  // Check if already exists
  if (existsSync(swaggerConfigPath) && !force) {
    info("✓ Swagger UI already configured");
    return;
  }

  const spinner = ora("Setting up Swagger UI...").start();

  try {
    // Create swagger config
    await writeFile(swaggerConfigPath, generateSwaggerSetup(port));

    // Update app.ts to include swagger
    const appPath = path.join(projectPath, "src", "app.ts");
    if (existsSync(appPath)) {
      let appContent = readFileSync(appPath, "utf-8");

      // Check if swagger is already imported
      if (!appContent.includes("setupSwagger")) {
        // Add import
        const importLine =
          "import { setupSwagger } from './config/swagger.config.js';\n";

        // Find where to insert import (after other imports)
        const lastImportIndex = appContent.lastIndexOf("import ");
        const endOfLastImport = appContent.indexOf("\n", lastImportIndex);

        if (endOfLastImport !== -1) {
          appContent =
            appContent.slice(0, endOfLastImport + 1) +
            importLine +
            appContent.slice(endOfLastImport + 1);
        }

        // Add swagger setup call (before routes or at end of middleware)
        const setupLine = "\n// API Documentation\nsetupSwagger(app);\n";

        // Try to find where to insert (before routes or error handler)
        let insertIndex = appContent.indexOf("// Routes");
        if (insertIndex === -1) {
          insertIndex = appContent.indexOf("// Error");
        }
        if (insertIndex === -1) {
          // Insert before export
          insertIndex = appContent.indexOf("export default app");
        }

        if (insertIndex !== -1) {
          appContent =
            appContent.slice(0, insertIndex) +
            setupLine +
            appContent.slice(insertIndex);
        }

        writeFileSync(appPath, appContent, "utf-8");
      }
    }

    // Create docs README
    const docsReadmePath = path.join(projectPath, "DOCS.md");
    if (!existsSync(docsReadmePath) || force) {
      await writeFile(docsReadmePath, generateSwaggerReadme(port));
    }

    // Update package.json to include swagger-ui-express
    await updatePackageJsonDependencies(projectPath);

    spinner.succeed("Swagger UI configured");

    warning("\n⚠️  Install required dependency:");
    info(`   ${chalk.cyan("npm install swagger-ui-express")}`);
    info(`   ${chalk.cyan("npm install -D @types/swagger-ui-express")}`);
  } catch (err: any) {
    spinner.fail("Failed to setup Swagger UI");
    throw err;
  }
}

/**
 * Update package.json with swagger dependencies
 */
async function updatePackageJsonDependencies(
  projectPath: string,
): Promise<void> {
  const packageJsonPath = path.join(projectPath, "package.json");

  if (!existsSync(packageJsonPath)) {
    return;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    // Check if swagger-ui-express is already in dependencies
    const hasSwagger =
      packageJson.dependencies?.["swagger-ui-express"] ||
      packageJson.devDependencies?.["swagger-ui-express"];

    if (!hasSwagger) {
      // Add a note in package.json (user still needs to npm install)
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }

      // Add script for regenerating docs
      if (!packageJson.scripts["docs:generate"]) {
        packageJson.scripts["docs:generate"] = "katax generate docs";
      }

      writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2),
        "utf-8",
      );
    }
  } catch (err) {
    // Silent fail - not critical
  }
}
