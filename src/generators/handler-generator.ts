import { EndpointConfig } from '../types/index.js';
import { toPascalCase, toCamelCase } from '../utils/file-utils.js';

export function generateHandler(config: EndpointConfig): string {
  const { name, method } = config;
  const pascalName = toPascalCase(name);
  const camelName = toCamelCase(name);

  let content = "import { Request, Response } from 'express';\n";
  
  if (config.addValidation) {
    content += `import { validate${pascalName} } from './${name.toLowerCase()}.validator.js';\n`;
  }
  
  // Import controller functions
  switch (method) {
    case 'POST':
      content += `import { create${pascalName} } from './${name.toLowerCase()}.controller.js';\n`;
      break;
    case 'GET':
      content += `import { get${pascalName} } from './${name.toLowerCase()}.controller.js';\n`;
      break;
    case 'PUT':
    case 'PATCH':
      content += `import { update${pascalName} } from './${name.toLowerCase()}.controller.js';\n`;
      break;
    case 'DELETE':
      content += `import { delete${pascalName} } from './${name.toLowerCase()}.controller.js';\n`;
      break;
  }
  
  content += "import { sendResponse } from '../../shared/api.utils.js';\n\n";
  content += "// ==================== HANDLERS ====================\n\n";

  // Generate handler based on method
  content += generateHandlerFunction(method, pascalName, camelName, config.addValidation);

  return content;
}

function generateHandlerFunction(
  method: string, 
  pascalName: string, 
  camelName: string, 
  hasValidation: boolean
): string {
  const handlerName = getHandlerName(method, pascalName);
  
  let content = `/**\n * Handler for ${method} ${camelName}\n`;
  content += ` * Uses sendResponse utility for automatic validation and response handling\n */\n`;
  content += `export async function ${handlerName}(req: Request, res: Response): Promise<void> {\n`;
  content += `  await sendResponse(\n`;
  content += `    req,\n`;
  content += `    res,\n`;

  // Validator based on method
  if (hasValidation && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    content += `    () => validate${pascalName}(req.body),\n`;
  } else if (method === 'GET' || method === 'DELETE') {
    content += `    () => validate${pascalName}Id(req.params.id),\n`;
  } else {
    content += `    () => validate${pascalName}(req.body),\n`;
  }

  // Controller call based on method
  switch (method) {
    case 'POST':
      content += `    (validData) => create${pascalName}(validData)\n`;
      break;
    case 'GET':
      content += `    (validData) => get${pascalName}(validData)\n`;
      break;
    case 'PUT':
    case 'PATCH':
      content += `    (validData) => update${pascalName}(req.params.id, validData)\n`;
      break;
    case 'DELETE':
      content += `    (validData) => delete${pascalName}(validData)\n`;
      break;
  }
  
  content += `  );\n`;
  content += `}\n`;
  return content;
}

function getHandlerName(method: string, pascalName: string): string {
  switch (method) {
    case 'POST':
      return `create${pascalName}Handler`;
    case 'GET':
      return `get${pascalName}Handler`;
    case 'PUT':
    case 'PATCH':
      return `update${pascalName}Handler`;
    case 'DELETE':
      return `delete${pascalName}Handler`;
    default:
      return `handle${pascalName}${method}`;
  }
}
