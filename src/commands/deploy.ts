import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { execa } from "execa";
import { success, error, warning, title, info, gray } from "../utils/logger.js";
import { directoryExists, writeFile, fileExists } from "../utils/file-utils.js";

interface DeployConfig {
  appName: string;
  repoUrl: string;
  branch: string;
  installPath: string;
  pm2Config: {
    instances: number | "max";
    maxMemory: string;
    env: Record<string, string>;
  };
}

/**
 * Deploy init - First time deployment (clone repo + setup PM2)
 */
export async function deployInitCommand() {
  title("🚀 Katax Deploy - Initial Setup");

  // Check if PM2 is installed
  const pm2Installed = await checkPM2Installation();
  if (!pm2Installed) {
    error("PM2 is not installed globally!");
    info("Install with: npm install -g pm2");
    process.exit(1);
  }

  // Interactive configuration
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "appName",
      message: "Application name for PM2:",
      default: "my-api",
      validate: (input) => {
        if (!/^[a-z0-9-_]+$/i.test(input)) {
          return "App name can only contain letters, numbers, hyphens, and underscores";
        }
        return true;
      },
    },
    {
      type: "list",
      name: "repoType",
      message: "Repository connection type:",
      choices: [
        { name: "HTTPS (username/password or token)", value: "https" },
        { name: "SSH (requires SSH key setup)", value: "ssh" },
      ],
      default: "https",
    },
    {
      type: "input",
      name: "repoUrl",
      message: "Git repository URL:",
      validate: (input) => {
        if (!input) return "Repository URL is required";
        // Basic validation for git URLs
        if (!input.includes("git") && !input.includes(".git")) {
          return "Please provide a valid Git repository URL";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "branch",
      message: "Branch to deploy:",
      default: "main",
    },
    {
      type: "input",
      name: "installPath",
      message: "Installation path (absolute):",
      default: `/home/${process.env.USER || "ubuntu"}/apps`,
      validate: (input) => {
        if (!path.isAbsolute(input)) {
          return "Please provide an absolute path";
        }
        return true;
      },
    },
    {
      type: "list",
      name: "instances",
      message: "PM2 instances (cluster mode):",
      choices: [
        { name: "Max (use all CPU cores)", value: "max" },
        { name: "1 instance", value: 1 },
        { name: "2 instances", value: 2 },
        { name: "4 instances", value: 4 },
      ],
      default: "max",
    },
    {
      type: "input",
      name: "maxMemory",
      message: "Max memory per instance (e.g., 512M, 1G):",
      default: "512M",
    },
    {
      type: "confirm",
      name: "addEnvVars",
      message: "Add environment variables?",
      default: true,
    },
  ]);

  // Collect environment variables
  let envVars: Record<string, string> = {};
  if (answers.addEnvVars) {
    envVars = await collectEnvVars();
  }

  const deployConfig: DeployConfig = {
    appName: answers.appName,
    repoUrl: answers.repoUrl,
    branch: answers.branch,
    installPath: answers.installPath,
    pm2Config: {
      instances: answers.instances,
      maxMemory: answers.maxMemory,
      env: envVars,
    },
  };

  // Execute deployment
  await executeInitialDeploy(deployConfig);
}

/**
 * Deploy update - Update existing deployment (pull + rebuild + restart)
 */
export async function deployUpdateCommand(options: {
  branch?: string;
  hard?: boolean;
  appName?: string;
}) {
  title("🔄 Katax Deploy - Update Application");

  // Check if we're in a git repository
  const isGitRepo = await checkGitRepository();
  if (!isGitRepo) {
    error(
      "Not a git repository! Run this command from your project directory.",
    );
    info("Or use: katax deploy init");
    process.exit(1);
  }

  // Check if PM2 is installed
  const pm2Installed = await checkPM2Installation();
  if (!pm2Installed) {
    error("PM2 is not installed globally!");
    info("Install with: npm install -g pm2");
    process.exit(1);
  }

  // Detect PM2 app name: priority order
  // 1. Command line option --app-name
  // 2. Auto-discover from PM2 (matching cwd)
  // 3. Config file .katax-deploy.json
  // 4. Directory name (fallback)
  const currentDir = process.cwd();
  let appName = options.appName;
  let wasAutoDiscovered = false;

  if (!appName) {
    // Try to discover from PM2
    const discovered = await discoverPM2AppName(currentDir);
    if (discovered) {
      appName = discovered;
      wasAutoDiscovered = true;
      info(`🔍 Discovered PM2 app: ${chalk.cyan(appName)}`);
    }
  }

  if (!appName) {
    // Try to load from config file
    const configPath = path.join(currentDir, ".katax-deploy.json");
    if (fileExists(configPath)) {
      try {
        const fs = await import("fs");
        const configContent = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configContent);
        appName = config.appName;
        info(`📝 Using app name from config: ${chalk.cyan(appName)}`);
      } catch (err) {
        // Continue to fallback
      }
    }
  }

  // Fallback to directory name
  if (!appName) {
    appName = path.basename(currentDir);
    warning(`⚠️  Using directory name as fallback: ${chalk.yellow(appName)}`);
    info(`💡 Tip: Run ${chalk.cyan("pm2 list")} to verify the app name`);
  }

  // Get current branch if not specified
  let targetBranch = options.branch;
  if (!targetBranch) {
    const branchResult = await execa("git", ["branch", "--show-current"]);
    targetBranch = branchResult.stdout.trim();
  }

  // Auto-save discovered name for future use (after we have the branch)
  if (wasAutoDiscovered && appName) {
    await saveAppNameToConfig(currentDir, appName, targetBranch);
  }

  info(`📦 Application: ${chalk.cyan(appName)}`);
  info(`🌿 Branch: ${chalk.cyan(targetBranch)}`);

  if (options.hard) {
    warning("⚠️  Hard reset enabled - all local changes will be lost!");
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Proceed with update?",
      default: true,
    },
  ]);

  if (!confirm) {
    warning("Update cancelled");
    return;
  }

  // Execute update
  await executeUpdate(appName, targetBranch, options.hard || false);

  // Save config after successful deployment (if not already saved)
  if (!wasAutoDiscovered) {
    await saveAppNameToConfig(currentDir, appName, targetBranch, true);
  }
}

/**
 * Deploy rollback - Rollback to previous version
 */
export async function deployRollbackCommand(options: {
  commits?: number;
  appName?: string;
}) {
  title("⏮️  Katax Deploy - Rollback");

  const isGitRepo = await checkGitRepository();
  if (!isGitRepo) {
    error("Not a git repository!");
    process.exit(1);
  }

  const commits = options.commits || 1;
  const currentDir = process.cwd();

  // Detect app name using same logic as update
  let appName = options.appName;

  if (!appName) {
    appName = (await discoverPM2AppName(currentDir)) || undefined;
  }

  if (!appName) {
    const configPath = path.join(currentDir, ".katax-deploy.json");
    if (fileExists(configPath)) {
      try {
        const fs = await import("fs");
        const configContent = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configContent);
        appName = config.appName;
      } catch (err) {
        // Fallback to directory name
      }
    }
  }

  if (!appName) {
    appName = path.basename(currentDir);
  }

  warning(`Rolling back ${commits} commit(s) for ${appName}`);

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "This will reset your code. Continue?",
      default: false,
    },
  ]);

  if (!confirm) {
    warning("Rollback cancelled");
    return;
  }

  await executeRollback(appName, commits);
}

/**
 * Deploy logs - View PM2 logs
 */
export async function deployLogsCommand(options: {
  lines?: number;
  follow?: boolean;
  appName?: string;
}) {
  const currentDir = process.cwd();

  // Detect app name using same logic as update
  let appName = options.appName;

  if (!appName) {
    appName = (await discoverPM2AppName(currentDir)) || undefined;
  }

  if (!appName) {
    const configPath = path.join(currentDir, ".katax-deploy.json");
    if (fileExists(configPath)) {
      try {
        const fs = await import("fs");
        const configContent = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configContent);
        appName = config.appName;
      } catch (err) {
        // Fallback to directory name
      }
    }
  }

  if (!appName) {
    appName = path.basename(currentDir);
  }

  title(`📋 PM2 Logs - ${appName}`);

  const args = ["logs", appName];
  if (options.lines) {
    args.push("--lines", options.lines.toString());
  }
  if (!options.follow) {
    args.push("--nostream");
  }

  try {
    await execa("pm2", args, { stdio: "inherit" });
  } catch (err) {
    error("Failed to fetch logs");
    console.error(err);
  }
}

/**
 * Deploy status - Check PM2 status
 */
export async function deployStatusCommand() {
  title("📊 PM2 Status");

  try {
    await execa("pm2", ["list"], { stdio: "inherit" });
  } catch (err) {
    error("Failed to get PM2 status");
    console.error(err);
  }
}

// ==================== Helper Functions ====================

async function checkPM2Installation(): Promise<boolean> {
  try {
    await execa("pm2", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function checkGitRepository(): Promise<boolean> {
  try {
    await execa("git", ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save discovered app name to .katax-deploy.json for future use
 */
async function saveAppNameToConfig(
  projectDir: string,
  appName: string,
  branch: string,
  silent: boolean = false,
): Promise<void> {
  try {
    const configPath = path.join(projectDir, ".katax-deploy.json");

    // Check if config already exists
    if (fileExists(configPath)) {
      return; // Don't overwrite existing config
    }

    const config = {
      appName: appName,
      createdAt: new Date().toISOString(),
      branch: branch,
      autoDiscovered: true,
    };

    await writeFile(configPath, JSON.stringify(config, null, 2));

    if (!silent) {
      success(`💾 Saved app name to .katax-deploy.json for future deployments`);
    }
  } catch (err) {
    // Silent fail - not critical
  }
}

/**
 * Discover PM2 app name by querying PM2 for apps running in current directory
 */
async function discoverPM2AppName(targetDir: string): Promise<string | null> {
  try {
    // Get PM2 process list in JSON format
    const { stdout } = await execa("pm2", ["jlist"]);
    const processes = JSON.parse(stdout);

    // Normalize paths for comparison (resolve symlinks, normalize separators)
    const normalizedTargetDir = path.resolve(targetDir).toLowerCase();

    // Find process with matching cwd (current working directory)
    for (const proc of processes) {
      if (proc.pm2_env && proc.pm2_env.pm_cwd) {
        const procDir = path.resolve(proc.pm2_env.pm_cwd).toLowerCase();
        if (procDir === normalizedTargetDir) {
          return proc.name;
        }
      }
      // Also check pm_exec_path directory
      if (proc.pm2_env && proc.pm2_env.pm_exec_path) {
        const execDir = path
          .resolve(path.dirname(proc.pm2_env.pm_exec_path))
          .toLowerCase();
        if (
          execDir === normalizedTargetDir ||
          execDir.startsWith(normalizedTargetDir)
        ) {
          return proc.name;
        }
      }
    }

    return null;
  } catch (err) {
    // PM2 not available or no processes - return null to try other methods
    return null;
  }
}

async function collectEnvVars(): Promise<Record<string, string>> {
  const envVars: Record<string, string> = {};

  info("\n📝 Add environment variables (leave empty to finish):\n");

  while (true) {
    const { key } = await inquirer.prompt([
      {
        type: "input",
        name: "key",
        message: "Variable name:",
      },
    ]);

    if (!key) break;

    const { value } = await inquirer.prompt([
      {
        type: "input",
        name: "value",
        message: `Value for ${key}:`,
      },
    ]);

    envVars[key] = value;
    success(`✓ ${key} added`);
  }

  return envVars;
}

async function executeInitialDeploy(config: DeployConfig): Promise<void> {
  const fullPath = path.join(config.installPath, config.appName);

  // Step 1: Check if directory exists
  if (directoryExists(fullPath)) {
    error(`Directory ${fullPath} already exists!`);
    process.exit(1);
  }

  // Save config for future updates
  const deployConfigFile = {
    appName: config.appName,
    createdAt: new Date().toISOString(),
    branch: config.branch,
  };
  await writeFile(
    path.join(fullPath, ".katax-deploy.json"),
    JSON.stringify(deployConfigFile, null, 2),
  );

  // Step 2: Clone repository
  const cloneSpinner = ora("Cloning repository...").start();
  try {
    await execa("git", [
      "clone",
      "--branch",
      config.branch,
      config.repoUrl,
      fullPath,
    ]);
    cloneSpinner.succeed("Repository cloned");
  } catch (err) {
    cloneSpinner.fail("Failed to clone repository");
    console.error(err);
    process.exit(1);
  }

  // Step 3: Install dependencies
  const installSpinner = ora("Installing dependencies...").start();
  try {
    await execa("npm", ["install"], { cwd: fullPath });
    installSpinner.succeed("Dependencies installed");
  } catch (err) {
    installSpinner.fail("Failed to install dependencies");
    console.error(err);
    process.exit(1);
  }

  // Step 4: Build project
  const buildSpinner = ora("Building project...").start();
  try {
    await execa("npm", ["run", "build"], { cwd: fullPath });
    buildSpinner.succeed("Project built");
  } catch (err) {
    buildSpinner.fail("Failed to build project");
    console.error(err);
    process.exit(1);
  }

  // Step 5: Generate PM2 ecosystem config
  await generatePM2Config(fullPath, config);

  // Step 6: Start with PM2
  const pm2Spinner = ora("Starting with PM2...").start();
  try {
    await execa(
      "pm2",
      ["start", "ecosystem.config.cjs", "--env", "production"],
      { cwd: fullPath },
    );
    await execa("pm2", ["save"]);
    pm2Spinner.succeed("Application started with PM2");
  } catch (err) {
    pm2Spinner.fail("Failed to start with PM2");
    console.error(err);
    process.exit(1);
  }

  success(`\n✅ Deployment completed successfully!`);
  info(`\n📍 Location: ${fullPath}`);
  info(`🔧 PM2 App Name: ${config.appName}`);
  info(`📝 Config saved: .katax-deploy.json`);
  info(`\nUseful commands:`);
  gray(`  pm2 logs ${config.appName}       # View logs`);
  gray(`  pm2 restart ${config.appName}    # Restart app`);
  gray(`  pm2 stop ${config.appName}       # Stop app`);
  gray(`  katax deploy update           # Update deployment`);
  gray(
    `  katax deploy update --app-name ${config.appName}  # Specify app name\n`,
  );
}

async function executeUpdate(
  appName: string,
  branch: string,
  hard: boolean,
): Promise<void> {
  const currentDir = process.cwd();

  // Step 1: Git operations
  const gitSpinner = ora("Updating code from git...").start();
  try {
    // Fetch latest
    await execa("git", ["fetch", "origin", branch]);

    if (hard) {
      // Hard reset - discard all local changes
      await execa("git", ["reset", "--hard", `origin/${branch}`]);
    } else {
      // Regular pull
      await execa("git", ["pull", "origin", branch]);
    }

    gitSpinner.succeed("Code updated");
  } catch (err: any) {
    gitSpinner.fail("Git update failed");
    error(err.message);
    process.exit(1);
  }

  // Step 2: Install dependencies
  const installSpinner = ora("Installing dependencies...").start();
  try {
    await execa("npm", ["install"], { cwd: currentDir });
    installSpinner.succeed("Dependencies updated");
  } catch (err) {
    installSpinner.fail("Failed to install dependencies");
    console.error(err);
    process.exit(1);
  }

  // Step 3: Build project
  const buildSpinner = ora("Building project...").start();
  try {
    await execa("npm", ["run", "build"], { cwd: currentDir });
    buildSpinner.succeed("Project rebuilt");
  } catch (err) {
    buildSpinner.fail("Build failed");
    console.error(err);
    process.exit(1);
  }

  // Step 4: Restart PM2
  const pm2Spinner = ora("Restarting PM2...").start();
  try {
    await execa("pm2", ["restart", appName]);
    pm2Spinner.succeed("Application restarted");
  } catch (err) {
    pm2Spinner.fail("PM2 restart failed");
    console.error(err);
    process.exit(1);
  }

  success("\n✅ Update completed successfully!");
  info(`\nView logs with: pm2 logs ${appName}\n`);
}

async function executeRollback(
  appName: string,
  commits: number,
): Promise<void> {
  const rollbackSpinner = ora(`Rolling back ${commits} commit(s)...`).start();

  try {
    // Git reset
    await execa("git", ["reset", "--hard", `HEAD~${commits}`]);
    rollbackSpinner.succeed("Code rolled back");

    // Rebuild
    const buildSpinner = ora("Rebuilding...").start();
    await execa("npm", ["install"]);
    await execa("npm", ["run", "build"]);
    buildSpinner.succeed("Project rebuilt");

    // Restart PM2
    const pm2Spinner = ora("Restarting PM2...").start();
    await execa("pm2", ["restart", appName]);
    pm2Spinner.succeed("Application restarted");

    success("\n✅ Rollback completed successfully!");
  } catch (err) {
    rollbackSpinner.fail("Rollback failed");
    console.error(err);
    process.exit(1);
  }
}

async function generatePM2Config(
  projectPath: string,
  config: DeployConfig,
): Promise<void> {
  const ecosystem = `// PM2 Ecosystem Configuration
// Generated by Katax CLI

module.exports = {
  apps: [{
    name: '${config.appName}',
    script: './dist/index.js',
    
    // Cluster mode
    instances: ${typeof config.pm2Config.instances === "number" ? config.pm2Config.instances : `'${config.pm2Config.instances}'`},
    exec_mode: 'cluster',
    
    // Resource limits
    max_memory_restart: '${config.pm2Config.maxMemory}',
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Auto restart configuration
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Environment variables
    env_production: ${JSON.stringify(
      {
        NODE_ENV: "production",
        ...config.pm2Config.env,
      },
      null,
      6,
    )}
  }]
};
`;

  await writeFile(path.join(projectPath, "ecosystem.config.cjs"), ecosystem);
  success("✓ PM2 ecosystem.config.cjs generated");
}
