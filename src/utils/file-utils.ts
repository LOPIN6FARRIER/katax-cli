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
