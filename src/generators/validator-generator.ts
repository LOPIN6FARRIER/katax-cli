import { EndpointConfig } from '../types/index.js';
import { toPascalCase, toCamelCase } from '../utils/file-utils.js';

export function generateValidator(config: EndpointConfig): string {
  const { name, fields = [], addAsyncValidators } = config;
  const pascalName = toPascalCase(name);
  const camelName = toCamelCase(name);

  let content = `import { k, kataxInfer } from 'katax-core';\n`;
  content += `import type { ValidationResult } from '../../shared/api.utils.js';\n`;

  if (addAsyncValidators) {
    content += `import type { AsyncValidator } from 'katax-core';\n`;
    content += `// import pool from '../../database/db.config.js'; // Uncomment if using database\n\n`;
  } else {
    content += '\n';
  }

  // Generate async validators if needed
  if (addAsyncValidators) {
    content += `// ==================== ASYNC VALIDATORS ====================\n\n`;
    
    fields.forEach(field => {
      if (field.asyncValidator) {
        content += `/**\n * Check if ${field.name} is unique\n */\n`;
        content += `export const ${field.name}UniqueValidator: AsyncValidator<string> = async (value, path) => {\n`;
        content += `  console.log(\`[ASYNC] Checking ${field.name}: \${value}\`);\n`;
        content += `  \n`;
        content += `  // TODO: Implement database check\n`;
        content += `  // const result = await pool.query(\n`;
        content += `  //   'SELECT id FROM ${field.asyncValidator.table || 'table_name'} WHERE ${field.asyncValidator.column || field.name} = $1',\n`;
        content += `  //   [value]\n`;
        content += `  // );\n`;
        content += `  // \n`;
        content += `  // if (result.rows.length > 0) {\n`;
        content += `  //   return [{ path, message: "This ${field.name} is already taken" }];\n`;
        content += `  // }\n`;
        content += `  \n`;
        content += `  return [];\n`;
        content += `};\n\n`;
      }
    });
  }

  // Generate schema
  content += `// ==================== SCHEMAS ====================\n\n`;
  content += `/**\n * Schema for ${name} ${config.method} request\n */\n`;
  content += `export const ${camelName}Schema = k.object({\n`;

  fields.forEach((field, index) => {
    const isLast = index === fields.length - 1;
    let fieldSchema = '';

    // Base type
    switch (field.type) {
      case 'string':
        fieldSchema = 'k.string()';
        break;
      case 'number':
        fieldSchema = 'k.number()';
        break;
      case 'boolean':
        fieldSchema = 'k.boolean()';
        break;
      case 'date':
        fieldSchema = 'k.date()';
        break;
      case 'email':
        fieldSchema = 'k.string().email()';
        break;
      case 'array':
        fieldSchema = 'k.array(k.string())';
        break;
      case 'object':
        fieldSchema = 'k.object({})';
        break;
      default:
        fieldSchema = 'k.string()';
    }

    // Add rules
    if (field.rules && field.rules.length > 0) {
      field.rules.forEach(rule => {
        switch (rule.type) {
          case 'minLength':
            fieldSchema += `\n    .minLength(${rule.value}, '${rule.message || `Must be at least ${rule.value} characters`}')`;
            break;
          case 'maxLength':
            fieldSchema += `\n    .maxLength(${rule.value}, '${rule.message || `Must not exceed ${rule.value} characters`}')`;
            break;
          case 'min':
            fieldSchema += `\n    .min(${rule.value}, '${rule.message || `Must be at least ${rule.value}`}')`;
            break;
          case 'max':
            fieldSchema += `\n    .max(${rule.value}, '${rule.message || `Must not exceed ${rule.value}`}')`;
            break;
          case 'email':
            fieldSchema += `\n    .email('${rule.message || 'Must be a valid email'}')`;
            break;
          case 'regex':
            fieldSchema += `\n    .regex(${rule.value}, '${rule.message || 'Invalid format'}')`;
            break;
        }
      });
    }

    // Add async validator
    if (field.asyncValidator && addAsyncValidators) {
      fieldSchema += `\n    .asyncRefine(${field.name}UniqueValidator)`;
    }

    // Add optional
    if (!field.required) {
      fieldSchema += `\n    .optional()`;
    }

    content += `  ${field.name}: ${fieldSchema}${isLast ? '' : ','}\n`;
  });

  content += `});\n\n`;

  // Generate type
  content += `/**\n * Inferred TypeScript type from schema\n */\n`;
  content += `export type ${pascalName}Data = kataxInfer<typeof ${camelName}Schema>;\n\n`;

  // Generate ID schema for GET/DELETE operations
  if (config.method === 'GET' || config.method === 'DELETE' || config.method === 'PUT' || config.method === 'PATCH') {
    content += `/**\n * Schema for ${name} ID validation\n */\n`;
    content += `export const ${camelName}IdSchema = k.string()\n`;
    content += `  .minLength(1, 'ID is required')\n`;
    content += `  .regex(/^[0-9a-fA-F-]{36}$|^\\d+$/, 'ID must be a valid UUID or integer');\n\n`;
    content += `export type ${pascalName}IdType = kataxInfer<typeof ${camelName}IdSchema>;\n\n`;
  }

  // Generate validation functions (ValidationResult is imported from api.utils)
  content += `/**\n * Validate ${name} data\n */\n`;
  content += `export async function validate${pascalName}(data: unknown): Promise<ValidationResult<${pascalName}Data>> {\n`;
  content += `  const result = ${addAsyncValidators ? 'await ' : ''}${camelName}Schema.safeParse${addAsyncValidators ? 'Async' : ''}(data);\n\n`;
  content += `  if (!result.success) {\n`;
  content += `    const errors = result.issues.map(issue => ({\n`;
  content += `      field: issue.path.join('.'),\n`;
  content += `      message: issue.message\n`;
  content += `    }));\n\n`;
  content += `    return {\n`;
  content += `      isValid: false,\n`;
  content += `      errors\n`;
  content += `    };\n`;
  content += `  }\n\n`;
  content += `  return {\n`;
  content += `    isValid: true,\n`;
  content += `    data: result.data\n`;
  content += `  };\n`;
  content += `}\n`;

  // Generate ID validation function for GET/DELETE
  if (config.method === 'GET' || config.method === 'DELETE' || config.method === 'PUT' || config.method === 'PATCH') {
    content += `\n/**\n * Validate ${name} ID\n */\n`;
    content += `export async function validate${pascalName}Id(id: string): Promise<ValidationResult<${pascalName}IdType>> {\n`;
    content += `  const result = ${camelName}IdSchema.safeParse(id);\n\n`;
    content += `  if (!result.success) {\n`;
    content += `    const errors = result.issues.map(issue => ({\n`;
    content += `      field: issue.path.join('.') || 'id',\n`;
    content += `      message: issue.message\n`;
    content += `    }));\n\n`;
    content += `    return {\n`;
    content += `      isValid: false,\n`;
    content += `      errors\n`;
    content += `    };\n`;
    content += `  }\n\n`;
    content += `  return {\n`;
    content += `    isValid: true,\n`;
    content += `    data: result.data\n`;
    content += `  };\n`;
    content += `}\n`;
  }

  return content;
}
