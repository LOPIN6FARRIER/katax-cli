import chalk from 'chalk';
import path from 'path';
import { title, info, gray, error, warning } from '../utils/logger.js';
import { fileExists } from '../utils/file-utils.js';
import { checkForUpdates } from '../utils/version-check.js';

export async function infoCommand() {
  title('📊 Project Information');

  // Check if in project
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fileExists(packageJsonPath)) {
    error('Not in a project directory!');
    process.exit(1);
  }

  // Read package.json
  const fs = await import('fs');
  const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8'));

  info('Project Details:');
  gray(`  Name: ${packageJson.name}`);
  gray(`  Version: ${packageJson.version}`);
  gray(`  Description: ${packageJson.description || 'N/A'}\n`);

  // Check for katax-core
  const hasKataxCore = packageJson.dependencies?.['katax-core'];
  const hasKataxServiceManager = packageJson.dependencies?.['katax-service-manager'];
  info('Dependencies:');
  gray(`  katax-core: ${hasKataxCore ? `✅ ${hasKataxCore}` : '❌ Not installed'}`);
  gray(
    `  katax-service-manager: ${hasKataxServiceManager ? `✅ ${hasKataxServiceManager}` : '❌ Not installed'}`,
  );
  gray(`  express: ${packageJson.dependencies?.express ? '✅ Installed' : '❌ Not installed'}`);
  gray(`  TypeScript: ${packageJson.devDependencies?.typescript ? '✅ Installed' : '❌ Not installed'}\n`);

  // Check for available updates (non-blocking, cached ~1 day)
  const toCheck: Array<{ name: string; current: string }> = [];
  if (hasKataxCore) toCheck.push({ name: 'katax-core', current: hasKataxCore });
  if (hasKataxServiceManager) {
    toCheck.push({ name: 'katax-service-manager', current: hasKataxServiceManager });
  }

  if (toCheck.length > 0) {
    info('Checking for updates...');
    const results = await checkForUpdates(toCheck);
    for (const { name, current, latest, hasUpdate } of results) {
      if (latest === null) {
        gray(`  ${name}: ${current} (could not reach npm registry)`);
      } else if (hasUpdate) {
        warning(`  ${name}: ${current} -> ${latest} available (npm install ${name}@latest)`);
      } else {
        gray(`  ${name}: ${current} (up to date)`);
      }
    }
    console.log();
  }

  // Scan for API routes
  const apiPath = path.join(process.cwd(), 'src', 'api');
  if (await dirExists(apiPath)) {
    info('API Routes:');
    const routes = await scanRoutes(apiPath);
    if (routes.length > 0) {
      routes.forEach(route => gray(`  ${route}`));
    } else {
      gray('  No routes found');
    }
  } else {
    warning('API directory not found');
  }

  console.log();
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const fs = await import('fs');
    const stats = await fs.promises.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function scanRoutes(apiPath: string): Promise<string[]> {
  const routes: string[] = [];
  try {
    const fs = await import('fs');
    const entries = await fs.promises.readdir(apiPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'routes') {
        const routeFile = path.join(apiPath, entry.name, `${entry.name}.routes.ts`);
        if (await fileExistsAsync(routeFile)) {
          routes.push(`/${entry.name}`);
        }
      }
    }
  } catch (err) {
    // Ignore errors
  }
  return routes;
}

async function fileExistsAsync(filePath: string): Promise<boolean> {
  try {
    const fs = await import('fs');
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
