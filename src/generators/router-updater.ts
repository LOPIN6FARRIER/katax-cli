import path from 'path';
import { fileExists, writeFile } from '../utils/file-utils.js';
import { EndpointConfig } from '../types/index.js';

export async function updateMainRouter(name: string, config: EndpointConfig): Promise<void> {
  const routesPath = path.join(process.cwd(), 'src', 'api', 'routes.ts');

  let content: string;

  if (fileExists(routesPath)) {
    // Read existing routes.ts
    const fs = await import('fs');
    content = await fs.promises.readFile(routesPath, 'utf-8');

    // Check if import already exists
    const importStatement = `import ${name.toLowerCase()}Router from './${name.toLowerCase()}/${name.toLowerCase()}.routes.js';`;
    if (!content.includes(importStatement)) {
      // Add import after last import
      const lastImportIndex = content.lastIndexOf('import ');
      const endOfLineIndex = content.indexOf('\n', lastImportIndex);
      content = content.slice(0, endOfLineIndex + 1) + importStatement + '\n' + content.slice(endOfLineIndex + 1);
    }

    // Add route registration
    const routePath = config.path.replace(/^\/api/, '');
    const basePath = routePath.split('/')[1] || name.toLowerCase();
    const routeStatement = `router.use('/${basePath}', ${name.toLowerCase()}Router);`;
    
    if (!content.includes(routeStatement)) {
      // Add before export default
      const exportIndex = content.lastIndexOf('export default router;');
      if (exportIndex !== -1) {
        content = content.slice(0, exportIndex) + routeStatement + '\n\n' + content.slice(exportIndex);
      } else {
        content += `\n${routeStatement}\n`;
      }
    }
  } else {
    // Create new routes.ts
    content = `import { Router } from 'express';\n`;
    content += `import ${name.toLowerCase()}Router from './${name.toLowerCase()}/${name.toLowerCase()}.routes.js';\n\n`;
    content += `const router = Router();\n\n`;
    content += `// Health check\n`;
    content += `router.get('/health', (req, res) => {\n`;
    content += `  res.json({ status: 'ok', timestamp: new Date().toISOString() });\n`;
    content += `});\n\n`;
    const routePath = config.path.replace(/^\/api/, '');
    const basePath = routePath.split('/')[1] || name.toLowerCase();
    content += `router.use('/${basePath}', ${name.toLowerCase()}Router);\n\n`;
    content += `export default router;\n`;
  }

  await writeFile(routesPath, content);
}
