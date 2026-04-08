#!/usr/bin/env node

/**
 * Katax CLI - API Generator with TypeScript and katax-core validation
 *
 * A CLI tool for generating Express REST APIs with TypeScript,
 * integrated with katax-core for robust schema validation.
 */

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initCommand } from "./commands/init.js";
import { addEndpointCommand } from "./commands/add-endpoint.js";
import { generateCrudCommand } from "./commands/generate-crud.js";
import { generateRepositoryCommand } from "./commands/generate-repository.js";
import { generateDocsCommand } from "./commands/generate-docs.js";
import { infoCommand } from "./commands/info.js";
import {
  deployInitCommand,
  deployUpdateCommand,
  deployRollbackCommand,
  deployLogsCommand,
  deployStatusCommand,
} from "./commands/deploy.js";
import {
  fixDocsCommand,
  fixAllCommand,
  listFixesCommand,
} from "./commands/fix.js";
import { setVerbose, setColorMode } from "./utils/logger.js";

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
);
const version = packageJson.version;

const program = new Command();

program
  .name("katax")
  .description(
    chalk.blue(
      "🚀 Generate Express APIs with TypeScript and katax-core validation",
    ),
  )
  .version(version, "-v, --version", "Output the current version");

// Init command - Initialize new API project
program
  .command("init [project-name]")
  .description("Initialize a new Express API project with TypeScript")
  .option("-f, --force", "Overwrite existing project")
  .option("--pm <manager>", "Package manager to use (npm|pnpm)")
  .option("--ignore-scripts", "Install dependencies with --ignore-scripts")
  .option("--write-npmrc", "Write .npmrc with ignore-scripts=true")
  .action(initCommand);

// Add command - Add resources to project
const addCommand = program
  .command("add")
  .description("Add resources to your project");

addCommand
  .command("endpoint <name>")
  .description("Add a new endpoint with validation")
  .option(
    "-m, --method <method>",
    "HTTP method (GET, POST, PUT, DELETE)",
    "POST",
  )
  .option("-p, --path <path>", "Route path")
  .action(addEndpointCommand);

// Generate command - Generate complete resources
const generateCommand = program
  .command("generate")
  .aliases(["gen", "g"])
  .description("Generate complete resources");

generateCommand
  .command("crud <resource-name>")
  .description("Generate a complete CRUD resource")
  .option("--no-auth", "Skip authentication middleware")
  .action(generateCrudCommand);

generateCommand
  .command("repository <name>")
  .description("Generate a repository scaffold")
  .action(generateRepositoryCommand);

generateCommand
  .command("docs")
  .description("Generate API documentation (Swagger/OpenAPI)")
  .option("-f, --force", "Force regenerate (overwrite existing)")
  .option("-o, --output <path>", "Output path for OpenAPI spec")
  .option("-p, --port <port>", "Server port for documentation URL")
  .option(
    "-u, --url <url>",
    "Production server URL (e.g., https://api.example.com)",
  )
  .action(generateDocsCommand);

// Deploy command - PM2 deployment on Ubuntu VPS
const deployCommand = program
  .command("deploy")
  .description("Deploy and manage applications with PM2 on Ubuntu VPS");

deployCommand
  .command("init")
  .description("Initial deployment - Clone repo and setup PM2")
  .action(deployInitCommand);

deployCommand
  .command("update")
  .description("Update existing deployment - Pull changes and restart")
  .option("-b, --branch <branch>", "Branch to deploy (default: current branch)")
  .option("--hard", "Hard reset - discard all local changes")
  .option(
    "-a, --app-name <name>",
    "PM2 application name (overrides .katax-deploy.json)",
  )
  .action(deployUpdateCommand);

deployCommand
  .command("rollback")
  .description("Rollback to previous version")
  .option("-c, --commits <number>", "Number of commits to rollback", "1")
  .option(
    "-a, --app-name <name>",
    "PM2 application name (overrides .katax-deploy.json)",
  )
  .action(deployRollbackCommand);

deployCommand
  .command("logs")
  .description("View PM2 application logs")
  .option("-l, --lines <number>", "Number of lines to display")
  .option("-f, --follow", "Follow log output")
  .option(
    "-a, --app-name <name>",
    "PM2 application name (overrides .katax-deploy.json)",
  )
  .action(deployLogsCommand);

deployCommand
  .command("status")
  .description("Show PM2 applications status")
  .action(deployStatusCommand);

// Fix command - Patch existing projects
const fixCommand = program
  .command("fix")
  .description("Apply fixes to existing projects");

fixCommand
  .command("docs")
  .description("Fix API documentation for production (copy openapi.json)")
  .option("--skip-install", "Skip npm install after patching")
  .action(fixDocsCommand);

fixCommand
  .command("all")
  .description("Apply all available fixes")
  .option("--skip-install", "Skip npm install after patching")
  .action(fixAllCommand);

fixCommand
  .command("list")
  .description("List all available fixes")
  .action(listFixesCommand);

// Info command - Show project structure
program
  .command("info")
  .aliases(["status", "ls"])
  .description("Show current project structure and routes")
  .action(infoCommand);

// Global options
program
  .option("--no-color", "Disable colored output")
  .option("--verbose", "Enable verbose logging");

// Parse global options
program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.verbose) setVerbose(true);
  if (opts.color === false) setColorMode(false);
});

// Show help after error and suggestions
program.showHelpAfterError("(add --help for additional information)");
program.showSuggestionAfterError(true);

// Add examples to help
program.addHelpText(
  "after",
  `
${chalk.bold("Examples:")}
  ${chalk.gray("# Initialize a new API project")}
  $ katax init my-api

  ${chalk.gray("# Add a single endpoint")}
  $ katax add endpoint users

  ${chalk.gray("# Generate a complete CRUD resource")}
  $ katax generate crud products

  ${chalk.gray("# Generate a repository scaffold")}
  $ katax generate repository products

  ${chalk.gray("# Generate API documentation")}
  $ katax generate docs

  ${chalk.gray("# View project structure")}
  $ katax info

  ${chalk.gray("# Deploy to Ubuntu VPS with PM2")}
  $ katax deploy init                    # First time deployment
  $ katax deploy update                  # Update existing deployment
  $ katax deploy update --hard           # Hard reset and update
  $ katax deploy update -a my-api-prod   # Specify PM2 app name
  $ katax deploy status                  # Check PM2 status
  $ katax deploy logs -f                 # Follow logs
  $ katax deploy rollback                # Rollback 1 commit

${chalk.bold("Documentation:")}
  ${chalk.cyan("https://github.com/LOPIN6FARRIER/katax-cli#readme")}
`,
);

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
