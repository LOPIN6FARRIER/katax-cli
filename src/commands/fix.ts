/**
 * Fix command - Patch existing projects with latest improvements
 */

import chalk from "chalk";
import ora from "ora";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { success, error, warning, info, title } from "../utils/logger.js";

interface FixOptions {
  skipInstall?: boolean;
}

/**
 * Fix docs - Patch build script to copy openapi.json for production
 */
export async function fixDocsCommand(options: FixOptions = {}): Promise<void> {
  title("🔧 Fix API Documentation for Production");

  const projectPath = process.cwd();
  const packageJsonPath = path.join(projectPath, "package.json");

  // Validate project
  if (!existsSync(packageJsonPath)) {
    error("No package.json found. Run this from your project root.");
    process.exit(1);
  }

  const spinner = ora("Analyzing project...").start();

  try {
    // Read package.json
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    let changes: string[] = [];

    // Check and fix build script
    const currentBuild = packageJson.scripts?.build || "";
    if (!currentBuild.includes("copyfiles") && !currentBuild.includes("openapi.json")) {
      if (currentBuild === "tsc") {
        packageJson.scripts.build = "tsc && copyfiles -u 1 src/openapi.json dist";
        changes.push("Updated build script to copy openapi.json");
      } else if (currentBuild.startsWith("tsc")) {
        packageJson.scripts.build = currentBuild + " && copyfiles -u 1 src/openapi.json dist";
        changes.push("Appended openapi.json copy to build script");
      } else {
        warning(`Custom build script detected: "${currentBuild}"`);
        info("Add this manually: && copyfiles -u 1 src/openapi.json dist");
      }
    }

    // Check and add copyfiles dependency
    if (!packageJson.devDependencies?.copyfiles) {
      packageJson.devDependencies = packageJson.devDependencies || {};
      packageJson.devDependencies.copyfiles = "^2.4.1";
      changes.push("Added copyfiles to devDependencies");
    }

    if (changes.length === 0) {
      spinner.succeed("Project already up to date!");
      info("\n✅ Your project already has the docs fix applied.\n");
      return;
    }

    // Write updated package.json
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
    spinner.succeed("Updated package.json");

    // Show changes
    info("\n📝 Changes applied:");
    changes.forEach(change => info(`   ${chalk.green("✓")} ${change}`));

    // Install dependencies
    if (!options.skipInstall) {
      const installSpinner = ora("Installing copyfiles...").start();
      try {
        execSync("npm install", { cwd: projectPath, stdio: "pipe" });
        installSpinner.succeed("Dependencies installed");
      } catch (err) {
        installSpinner.fail("Failed to install dependencies");
        warning("Run 'npm install' manually to complete the fix.");
      }
    } else {
      warning("\nSkipped install. Run 'npm install' to complete the fix.");
    }

    success("\n✅ Docs fix applied successfully!\n");
    info("Now when you run 'npm run build', openapi.json will be copied to dist/");
    info("Your /docs endpoint will work in production.\n");

  } catch (err: any) {
    spinner.fail("Failed to apply fix");
    error(err.message);
    process.exit(1);
  }
}

/**
 * Fix all - Apply all available fixes
 */
export async function fixAllCommand(options: FixOptions = {}): Promise<void> {
  title("🔧 Apply All Fixes");
  
  await fixDocsCommand(options);
  
  // Future fixes can be added here
  // await fixOtherThing(options);
}

/**
 * List available fixes
 */
export function listFixesCommand(): void {
  title("🔧 Available Fixes");
  
  console.log();
  info(`${chalk.cyan("katax fix docs")}     - Fix API documentation for production`);
  info(`                      Adds copyfiles to copy openapi.json during build`);
  console.log();
  info(`${chalk.cyan("katax fix all")}      - Apply all available fixes`);
  console.log();
}
