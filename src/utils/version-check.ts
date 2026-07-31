import fs from "fs-extra";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { warning, gray } from "./logger.js";

interface RegistryPackageInfo {
  version?: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const CACHE_PATH = path.join(os.tmpdir(), "katax-cli-version-check-cache.json");
const FETCH_TIMEOUT_MS = 1500;

interface CacheEntry {
  latest: string;
  fetchedAt: number;
}

type Cache = Record<string, CacheEntry>;

async function readCache(): Promise<Cache> {
  try {
    return (await fs.readJson(CACHE_PATH)) as Cache;
  } catch {
    return {};
  }
}

async function writeCache(cache: Cache): Promise<void> {
  try {
    await fs.writeJson(CACHE_PATH, cache);
  } catch {
    // Non-critical: a failed cache write just means we re-check next run.
  }
}

async function fetchLatestVersion(pkgName: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as RegistryPackageInfo;
    return data.version ?? null;
  } catch {
    // Offline, registry unreachable, blocked by a firewall, etc. - a version
    // check must never fail (or slow down) the actual command being run.
    return null;
  }
}

/**
 * Compares two version strings (major.minor.patch, ignoring a leading
 * ^/~ and any pre-release/build suffix) and returns true if `latest` is
 * strictly newer than `current`.
 */
function isNewer(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^[\^~]/, "")
      .split(".")
      .slice(0, 3)
      .map((n) => parseInt(n, 10) || 0);
  const [cMajor, cMinor, cPatch] = parse(current);
  const [lMajor, lMinor, lPatch] = parse(latest);
  if (lMajor !== cMajor) return lMajor > cMajor;
  if (lMinor !== cMinor) return lMinor > cMinor;
  return lPatch > cPatch;
}

/**
 * Reads katax-cli's own installed version from its package.json, for
 * self-update notices. Falls back to "0.0.0" if it can't be read (never
 * throws - this is only used for a non-critical version notice).
 */
export function cliVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export interface VersionCheckResult {
  name: string;
  current: string;
  latest: string | null;
  hasUpdate: boolean;
}

/**
 * Checks npm for the latest published version of each package, using a
 * ~1 day local cache (in the OS temp dir) so this doesn't hit the registry
 * on every CLI invocation. Never throws - a failed lookup for one package
 * just reports `latest: null` for it instead of aborting the whole check.
 */
export async function checkForUpdates(
  packages: Array<{ name: string; current: string }>,
): Promise<VersionCheckResult[]> {
  const cache = await readCache();
  const now = Date.now();
  let cacheDirty = false;

  const results = await Promise.all(
    packages.map(async ({ name, current }) => {
      let latest: string | null = null;
      const cached = cache[name];

      if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        latest = cached.latest;
      } else {
        latest = await fetchLatestVersion(name);
        if (latest) {
          cache[name] = { latest, fetchedAt: now };
          cacheDirty = true;
        }
      }

      return {
        name,
        current,
        latest,
        hasUpdate: latest !== null && isNewer(current, latest),
      };
    }),
  );

  if (cacheDirty) {
    await writeCache(cache);
  }

  return results;
}

/**
 * Reads katax-core/katax-service-manager's installed version range from the
 * target project's package.json (whichever are actually present), checks
 * npm for updates, and prints notices - alongside a katax-cli self-update
 * notice. Never throws: called from commands that just finished doing real
 * work (add-endpoint, generate-crud), so a failed/slow registry lookup must
 * not turn a successful command into an error.
 */
export async function checkAndNotifyProjectDependencyUpdates(projectDir: string): Promise<void> {
  try {
    const packageJsonPath = path.join(projectDir, "package.json");
    const packageJson = (await fs.readJson(packageJsonPath)) as {
      dependencies?: Record<string, string>;
    };
    const deps = packageJson.dependencies ?? {};

    const toCheck: Array<{ name: string; current: string }> = [
      { name: "katax-cli", current: cliVersion() },
    ];
    if (deps["katax-core"]) {
      toCheck.push({ name: "katax-core", current: deps["katax-core"] });
    }
    if (deps["katax-service-manager"]) {
      toCheck.push({ name: "katax-service-manager", current: deps["katax-service-manager"] });
    }

    const results = await checkForUpdates(toCheck);
    printUpdateNotices(results);
  } catch {
    // Non-critical: skip the notice rather than fail the command.
  }
}

/**
 * Prints a one-line notice per package with an available update. Silent
 * when there's nothing to report (everything up to date, or every check
 * failed/was skipped).
 */
export function printUpdateNotices(results: VersionCheckResult[]): void {
  const updates = results.filter((r) => r.hasUpdate);
  if (updates.length === 0) return;

  console.log();
  for (const { name, current, latest } of updates) {
    warning(`${name} ${current} -> ${latest} available (npm install ${name}@latest)`);
  }
  gray("  Run `katax info` in a project to see all versions at once.\n");
}
