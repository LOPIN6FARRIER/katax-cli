import { EndpointConfig } from '../types/index.js';
import { toPascalCase, toCamelCase } from '../utils/file-utils.js';

export function generateController(config: EndpointConfig): string {
  const { name, method, fields = [] } = config;
  const pascalName = toPascalCase(name);
  const camelName = toCamelCase(name);

  let content = '';

  // Imports
  if (config.addValidation) {
    content += `import { ${pascalName}Data } from './${name.toLowerCase()}.validator.js';\n`;
  }
  content += `import {\n`;
  content += `  ControllerResult,\n`;
  content += `  createSuccessResult,\n`;
  content += `  createErrorResult\n`;
  content += `} from '../../shared/api.utils.js';\n`;
  content += `// import pool from '../../database/db.config.js'; // Uncomment if using database\n\n`;

  // Generate controller function based on method
  switch (method) {
    case 'POST':
      content += generateCreateController(pascalName, camelName, fields);
      break;
    case 'GET':
      content += generateGetController(pascalName, camelName);
      break;
    case 'PUT':
    case 'PATCH':
      content += generateUpdateController(pascalName, camelName, fields);
      break;
    case 'DELETE':
      content += generateDeleteController(pascalName, camelName);
      break;
    default:
      content += generateGenericController(pascalName, camelName, method);
  }

  return content;
}

function generateCreateController(pascalName: string, camelName: string, fields: any[]): string {
  return `/**
 * Create a new ${camelName}
 */
export async function create${pascalName}(
  data: ${pascalName}Data
): Promise<ControllerResult<any>> {
  try {
    console.log(\`[${pascalName.toUpperCase()}] Creating ${camelName}:\`, data);

    // TODO: Implement database insertion
    // const result = await pool.query(
    //   'INSERT INTO ${camelName}s (${fields.map(f => f.name).join(', ')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *',
    //   [${fields.map(f => `data.${f.name}`).join(', ')}]
    // );
    // const new${pascalName} = result.rows[0];

    // Mock response for now
    const new${pascalName} = {
      id: Math.floor(Math.random() * 1000),
      ...data,
      createdAt: new Date().toISOString()
    };

    return createSuccessResult(
      '${pascalName} created successfully',
      new${pascalName},
      undefined,
      201
    );
  } catch (error) {
    console.error(\`[${pascalName.toUpperCase()}] Error creating ${camelName}:\`, error);
    return createErrorResult(
      'Failed to create ${camelName}',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}
`;
}

function generateGetController(pascalName: string, camelName: string): string {
  return `/**
 * Get ${camelName}(s)
 */
export async function get${pascalName}(
  id?: string
): Promise<ControllerResult<any>> {
  try {
    console.log(\`[${pascalName.toUpperCase()}] Getting ${camelName}\`, id ? \`with id: \${id}\` : '(all)');

    // TODO: Implement database query
    // if (id) {
    //   const result = await pool.query('SELECT * FROM ${camelName}s WHERE id = $1', [id]);
    //   if (result.rows.length === 0) {
    //     return createErrorResult('${pascalName} not found', undefined, 404);
    //   }
    //   return createSuccessResult('${pascalName} retrieved', result.rows[0]);
    // } else {
    //   const result = await pool.query('SELECT * FROM ${camelName}s');
    //   return createSuccessResult('${pascalName}s retrieved', result.rows);
    // }

    // Mock response for now
    const mock${pascalName} = {
      id: id || 1,
      name: 'Sample ${pascalName}',
      createdAt: new Date().toISOString()
    };

    return createSuccessResult(
      '${pascalName} retrieved successfully',
      id ? mock${pascalName} : [mock${pascalName}]
    );
  } catch (error) {
    console.error(\`[${pascalName.toUpperCase()}] Error getting ${camelName}:\`, error);
    return createErrorResult(
      'Failed to get ${camelName}',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}
`;
}

function generateUpdateController(pascalName: string, camelName: string, fields: any[]): string {
  return `/**
 * Update ${camelName}
 */
export async function update${pascalName}(
  id: string,
  data: Partial<${pascalName}Data>
): Promise<ControllerResult<any>> {
  try {
    console.log(\`[${pascalName.toUpperCase()}] Updating ${camelName} \${id}:\`, data);

    // TODO: Implement database update
    // const result = await pool.query(
    //   'UPDATE ${camelName}s SET ... WHERE id = $1 RETURNING *',
    //   [id, ...]
    // );
    // if (result.rows.length === 0) {
    //   return createErrorResult('${pascalName} not found', undefined, 404);
    // }

    // Mock response for now
    const updated${pascalName} = {
      id: parseInt(id),
      ...data,
      updatedAt: new Date().toISOString()
    };

    return createSuccessResult(
      '${pascalName} updated successfully',
      updated${pascalName}
    );
  } catch (error) {
    console.error(\`[${pascalName.toUpperCase()}] Error updating ${camelName}:\`, error);
    return createErrorResult(
      'Failed to update ${camelName}',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}
`;
}

function generateDeleteController(pascalName: string, camelName: string): string {
  return `/**
 * Delete ${camelName}
 */
export async function delete${pascalName}(
  id: string
): Promise<ControllerResult<void>> {
  try {
    console.log(\`[${pascalName.toUpperCase()}] Deleting ${camelName} \${id}\`);

    // TODO: Implement database deletion
    // const result = await pool.query('DELETE FROM ${camelName}s WHERE id = $1 RETURNING id', [id]);
    // if (result.rows.length === 0) {
    //   return createErrorResult('${pascalName} not found', undefined, 404);
    // }

    return createSuccessResult(
      '${pascalName} deleted successfully',
      undefined,
      undefined,
      200
    );
  } catch (error) {
    console.error(\`[${pascalName.toUpperCase()}] Error deleting ${camelName}:\`, error);
    return createErrorResult(
      'Failed to delete ${camelName}',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}
`;
}

function generateGenericController(pascalName: string, camelName: string, method: string): string {
  return `/**
 * Handle ${method} request for ${camelName}
 */
export async function handle${pascalName}${method}(
  data?: any
): Promise<ControllerResult<any>> {
  try {
    console.log(\`[${pascalName.toUpperCase()}] Handling ${method} request\`, data);

    // TODO: Implement your logic here

    return createSuccessResult(
      'Request processed successfully',
      { message: '${method} ${camelName} endpoint' }
    );
  } catch (error) {
    console.error(\`[${pascalName.toUpperCase()}] Error:\`, error);
    return createErrorResult(
      'Failed to process request',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}
`;
}
