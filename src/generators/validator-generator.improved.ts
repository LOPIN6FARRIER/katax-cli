/**
 * Improved Validator Generator
 * Uses CodeBuilder for consistent code generation
 */

import { CodeBuilder } from '../templates/base/code-builder.js';
import { EndpointConfig, FieldConfig } from '../types/index.js';

export function generateValidatorImproved(config: EndpointConfig): string {
  const builder = new CodeBuilder();
  const { name, fields = [], method } = config;
  const pascalName = toPascalCase(name);
  const camelName = toCamelCase(name);

  // Imports
  builder
    .import(['k', 'kataxInfer'], 'katax-core')
    .line();

  // Generate Create schema for POST
  if (method === 'POST') {
    generateCreateSchema(builder, pascalName, camelName, fields);
  }

  // Generate Update schema for PUT/PATCH
  if (method === 'PUT' || method === 'PATCH') {
    generateUpdateSchema(builder, pascalName, camelName, fields);
  }

  // Generate Query schema for GET with query params
  if (method === 'GET' && fields.length > 0) {
    generateQuerySchema(builder, pascalName, camelName, fields);
  }

  // Generate ID validator
  generateIdValidator(builder, pascalName);

  // Generate validator functions
  builder.section('Validators');
  generateValidatorFunctions(builder, pascalName, camelName, method);

  return builder.build();
}

/**
 * Generate create schema
 */
function generateCreateSchema(
  builder: CodeBuilder,
  pascalName: string,
  camelName: string,
  fields: FieldConfig[]
): void {
  builder
    .section('Create Schema')
    .comment(`Schema for creating ${camelName}`)
    .line(`export const create${pascalName}Schema = k.object({`);

  fields.forEach((field, index) => {
    const isLast = index === fields.length - 1;
    const fieldDef = buildFieldDefinition(field);
    builder.line(`  ${field.name}: ${fieldDef}${isLast ? '' : ','}`);
  });

  builder
    .line('});')
    .line()
    .line(`export type Create${pascalName}Data = kataxInfer<typeof create${pascalName}Schema>;`)
    .line();
}

/**
 * Generate update schema (all fields optional)
 */
function generateUpdateSchema(
  builder: CodeBuilder,
  pascalName: string,
  camelName: string,
  fields: FieldConfig[]
): void {
  builder
    .section('Update Schema')
    .comment(`Schema for updating ${camelName}`)
    .line(`export const update${pascalName}Schema = k.object({`);

  fields.forEach((field, index) => {
    const isLast = index === fields.length - 1;
    const fieldDef = buildFieldDefinition(field, true); // All optional for updates
    builder.line(`  ${field.name}: ${fieldDef}${isLast ? '' : ','}`);
  });

  builder
    .line('});')
    .line()
    .line(`export type Update${pascalName}Data = kataxInfer<typeof update${pascalName}Schema>;`)
    .line();
}

/**
 * Generate query schema for GET requests
 */
function generateQuerySchema(
  builder: CodeBuilder,
  pascalName: string,
  camelName: string,
  fields: FieldConfig[]
): void {
  builder
    .section('Query Schema')
    .comment(`Schema for ${camelName} query parameters`)
    .line(`export const ${camelName}QuerySchema = k.object({`);

  // Common query params
  builder
    .line('  page: k.number().min(1).optional(),')
    .line('  limit: k.number().min(1).max(100).optional(),')
    .line('  sort: k.string().optional(),')
    .line('  order: k.enum(["asc", "desc"]).optional(),');

  // Add searchable fields
  fields
    .filter(f => f.type === 'string' || f.type === 'email')
    .forEach(field => {
      builder.line(`  ${field.name}: k.string().optional(),`);
    });

  builder
    .line('});')
    .line()
    .line(`export type ${pascalName}QueryData = kataxInfer<typeof ${camelName}QuerySchema>;`)
    .line();
}

/**
 * Generate ID validator
 */
function generateIdValidator(builder: CodeBuilder, pascalName: string): void {
  builder
    .section('ID Validator')
    .comment(`Schema for ${pascalName} ID validation`)
    .line(`export const ${pascalName.toLowerCase()}IdSchema = k.string().uuid();`)
    .line();
}

/**
 * Generate validator functions
 */
function generateValidatorFunctions(
  builder: CodeBuilder,
  pascalName: string,
  camelName: string,
  method: string
): void {
  if (method === 'POST') {
    builder
      .comment(`Validate create ${camelName} data`)
      .line(`export async function validate${pascalName}(data: unknown) {`)
      .line(`  return await create${pascalName}Schema.safeParse(data);`)
      .line('}')
      .line();
  }

  if (method === 'PUT' || method === 'PATCH') {
    builder
      .comment(`Validate update ${camelName} data`)
      .line(`export async function validate${pascalName}(data: unknown) {`)
      .line(`  return await update${pascalName}Schema.safeParse(data);`)
      .line('}')
      .line();
  }

  if (method === 'GET') {
    builder
      .comment(`Validate ${camelName} query parameters`)
      .line(`export async function validate${pascalName}Query(data: unknown) {`)
      .line(`  return await ${camelName}QuerySchema.safeParse(data);`)
      .line('}')
      .line();
  }

  // ID validator
  builder
    .comment(`Validate ${camelName} ID`)
    .line(`export async function validate${pascalName}Id(id: unknown) {`)
    .line(`  return await ${pascalName.toLowerCase()}IdSchema.safeParse(id);`)
    .line('}')
    .line();
}

/**
 * Build field definition with rules
 */
function buildFieldDefinition(field: FieldConfig, forceOptional: boolean = false): string {
  let def = '';

  // Base type
  switch (field.type) {
    case 'string':
      def = 'k.string()';
      break;
    case 'number':
      def = 'k.number()';
      break;
    case 'boolean':
      def = 'k.boolean()';
      break;
    case 'date':
      def = 'k.date()';
      break;
    case 'email':
      def = 'k.string().email()';
      break;
    case 'array':
      def = 'k.array(k.string())';
      break;
    case 'object':
      def = 'k.object({})';
      break;
    default:
      def = 'k.string()';
  }

  // Add rules
  if (field.rules && field.rules.length > 0) {
    field.rules.forEach(rule => {
      switch (rule.type) {
        case 'minLength':
          def += `.minLength(${rule.value})`;
          break;
        case 'maxLength':
          def += `.maxLength(${rule.value})`;
          break;
        case 'min':
          def += `.min(${rule.value})`;
          break;
        case 'max':
          def += `.max(${rule.value})`;
          break;
        case 'email':
          def += '.email()';
          break;
        case 'regex':
          if (rule.value) {
            def += `.regex(${rule.value})`;
          }
          break;
      }
    });
  }

  // Make optional if not required or if forceOptional
  if (!field.required || forceOptional) {
    def += '.optional()';
  }

  return def;
}

/**
 * Convert to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert to camelCase
 */
function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
