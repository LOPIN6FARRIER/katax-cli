import { EndpointConfig } from '../types/index.js';
import { toPascalCase, toCamelCase } from '../utils/file-utils.js';

export function generateRoute(config: EndpointConfig): string {
  const { name, method, path } = config;
  const pascalName = toPascalCase(name);

  let content = "import { Router } from 'express';\n";

  // Import handler function
  const handlerName = getHandlerName(method, pascalName);
  content += `import { ${handlerName} } from './${name.toLowerCase()}.handler.js';\n\n`;

  content += `const router = Router();\n\n`;
  content += `// ==================== ROUTES ====================\n\n`;

  // Generate route
  const routePath = path.replace(/^\/api/, '');
  
  content += `/**\n`;
  content += ` * @route ${method} ${path}\n`;
  content += ` * @desc ${getRouteDescription(method, pascalName)}\n`;
  content += ` */\n`;
  content += `router.${method.toLowerCase()}('${routePath}', ${handlerName});\n\n`;

  content += `export default router;\n`;

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

function getRouteDescription(method: string, name: string): string {
  switch (method) {
    case 'POST':
      return `Create a new ${name}`;
    case 'GET':
      return `Get ${name}(s)`;
    case 'PUT':
    case 'PATCH':
      return `Update ${name}`;
    case 'DELETE':
      return `Delete ${name}`;
    default:
      return `Handle ${method} request for ${name}`;
  }
}
