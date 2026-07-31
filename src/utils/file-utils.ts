import fs from 'fs-extra';
import path from 'path';
import ejs from 'ejs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the templates directory path
 */
export function getTemplatesDir(): string {
  // In development: ../../templates
  // In production: ../templates (dist folder)
  const devPath = path.join(__dirname, '..', '..', 'templates');
  const prodPath = path.join(__dirname, '..', 'templates');
  
  return fs.existsSync(devPath) ? devPath : prodPath;
}

/**
 * Render an EJS template
 */
export async function renderTemplate(templatePath: string, data: any): Promise<string> {
  const fullPath = path.join(getTemplatesDir(), templatePath);
  const templateContent = await fs.readFile(fullPath, 'utf-8');
  return ejs.render(templateContent, data);
}

/**
 * Copy template file to destination
 */
export async function copyTemplate(
  templatePath: string,
  destinationPath: string,
  data?: any
): Promise<void> {
  const sourcePath = path.join(getTemplatesDir(), templatePath);
  
  await fs.ensureDir(path.dirname(destinationPath));
  
  if (data) {
    const rendered = await renderTemplate(templatePath, data);
    await fs.writeFile(destinationPath, rendered, 'utf-8');
  } else {
    await fs.copy(sourcePath, destinationPath);
  }
}

/**
 * Write a file with content
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Check if directory exists
 */
export function directoryExists(dirPath: string): boolean {
  return fs.existsSync(dirPath);
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Create directory if it doesn't exist
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

const SAFE_PATH_SEGMENT = /^[a-z0-9_-]+$/;

/**
 * Split a user-supplied resource/endpoint name (e.g. "admin/users") into safe
 * path segments, rejecting anything that could escape the target directory
 * (`..`, absolute paths, empty segments, or characters outside [a-z0-9_-]).
 *
 * This is the single point of validation used by init/add-endpoint/
 * generate-crud/generate-repository - previously each command re-implemented
 * its own splitting logic without filtering `..`, which allowed
 * `katax add endpoint "../../../../etc/foo"` to write outside the project.
 */
export function resolveSafePathSegments(input: string, kind = "name"): string[] {
  const segments = input
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error(`${kind} is required`);
  }

  for (const segment of segments) {
    if (!SAFE_PATH_SEGMENT.test(segment)) {
      throw new Error(
        `Invalid ${kind} "${input}": segment "${segment}" may only contain letters, ` +
          `numbers, "-" and "_" (no "..", "/", spaces, or other special characters).`,
      );
    }
  }

  return segments;
}

/**
 * Join `segments` onto `root` and verify the resolved path did not escape
 * `root`. Defense in depth alongside resolveSafePathSegments(): even if a
 * caller passes already-split segments without going through the segment
 * validator, this still refuses to write outside the intended directory.
 */
export function resolveWithinRoot(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing to write outside of "${resolvedRoot}"`);
  }
  return resolved;
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}
