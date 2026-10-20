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
import { infoCommand } from "./commands/info.js";
import {
  deployInitCommand,
  deployUpdateCommand,
  deployRollbackCommand,
  deployLogsCommand,
  deployStatusCommand,
} from "./commands/deploy.js";
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
  .option("--no-install", "Don't install dependencies")
  .action(initCommand);

// Add command - Add resources to project
const addCommand = program
  .command("add")
  .description("Add resources to your project");

function withEndpointOptions(command: Command): Command {
  return command
    .option(
      "--methods <list>",
      "Operations to generate: list,get,create,update,delete (default: all)",
    )
    .option("--id <type>", "Id type: uuid (default), number or string")
    .option(
      "--fields <spec>",
      'Fields, e.g. "name:string, price:number?, starts_on:date, status:enum(draft|done)" (? = optional)',
    )
    .option("--table <name>", "SQL table name (default: snake_case of the resource)")
    .option("--singular <name>", "Singular name when the automatic one is wrong (e.g. --singular person)")
    .option("--public", "Mount before requireAuth: no userId, no ownership checks")
    .option("--no-repository", "Don't generate repository/table (controllers left to implement)")
    .option("--no-interactive", "Never prompt (uses name:string when --fields is missing)")
    .option("-d, --dry-run", "Show what would be created/changed without writing")
    .option("-f, --force", "Overwrite existing resource files");
}

withEndpointOptions(
  addCommand
    .command("endpoint <path>")
    .description(
      "Add a resource: validator, types, repository, controller, handler, routes (+ row type, migration, routes.ts). " +
        "Examples: habits | admin/users | habits/:habitId/reminders",
    ),
).action(addEndpointCommand);

// Generate command - Generate complete resources
const generateCommand = program
  .command("generate")
  .aliases(["gen", "g"])
  .description("Generate complete resources");

withEndpointOptions(
  generateCommand
    .command("endpoint <path>")
    .alias("crud")
    .description("Same as `katax add endpoint` (also: katax gen crud)"),
).action(addEndpointCommand);

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

  ${chalk.gray("# Add a CRUD resource (validator, types, repository, controller, handler, routes, migration)")}
  $ katax add endpoint habits --fields "name:string, note:text?, status:enum(active|paused)"

  ${chalk.gray("# Pick only some operations (interactive mode shows a checklist when --methods is omitted)")}
  $ katax gen endpoint news --methods list,get

  ${chalk.gray("# Sub-resource and nested path")}
  $ katax add endpoint habits/:habitId/reminders --fields "time:string, enabled:boolean"
  $ katax add endpoint admin/user-roles

  ${chalk.gray("# Public, read-only resource; preview without writing")}
  $ katax add endpoint news --public --methods list,get --dry-run

  ${chalk.gray("# OpenAPI docs are always on: http://localhost:3000/docs")}

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
