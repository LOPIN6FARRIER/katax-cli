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
  
  content += "import { sendResponse, sendResult } from '../../shared/response.utils.js';\n\n";
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

  switch (method) {
    case 'POST':
      content += `  await sendResponse(req, res, {\n`;
      if (hasValidation) {
        content += `    validator: validate${pascalName},\n`;
      }
      content += `    controller: (data) => create${pascalName}(data),\n`;
      content += `    dataSource: 'body',\n`;
      content += `    successStatus: 201\n`;
      content += `  });\n`;
      break;

    case 'GET':
      content += `  await sendResponse(req, res, {\n`;
      if (hasValidation) {
        content += `    validator: (data) => validate${pascalName}Id(data.id),\n`;
      }
      content += `    controller: (data) => get${pascalName}(data.id),\n`;
      content += `    dataSource: 'params'\n`;
      content += `  });\n`;
      break;

    case 'PUT':
    case 'PATCH':
      content += `  await sendResponse(req, res, {\n`;
      if (hasValidation) {
        content += `    validator: validate${pascalName},\n`;
      }
      content += `    controller: (data) => update${pascalName}(req.params.id, data),\n`;
      content += `    dataSource: 'body'\n`;
      content += `  });\n`;
      break;

    case 'DELETE':
      content += `  await sendResponse(req, res, {\n`;
      if (hasValidation) {
        content += `    validator: (data) => validate${pascalName}Id(data.id),\n`;
      }
      content += `    controller: (data) => delete${pascalName}(data.id),\n`;
      content += `    dataSource: 'params',\n`;
      content += `    successStatus: 204\n`;
      content += `  });\n`;
      break;

    default:
      content += `  // TODO: Implement handler for ${method}\n`;
      content += `  res.status(501).json({ error: 'Not implemented' });\n`;
  }
  
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
