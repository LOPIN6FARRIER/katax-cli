/**
 * Swagger UI Template Generator
 * Generates swagger setup file for the API project
 */

export function generateSwaggerSetup(defaultPort: string = "3000"): string {
  return `import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Setup Swagger UI documentation
 */
export function setupSwagger(app: Express): void {
  try {
    const swaggerPath = path.join(__dirname, '../openapi.json');
    
    if (!fs.existsSync(swaggerPath)) {
      console.warn('⚠️  OpenAPI spec not found. Run: katax generate docs');
      return;
    }

    const swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, 'utf-8'));

    // Swagger UI options
    const options = {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API Documentation',
    };

    // Setup Swagger UI
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));

    // JSON endpoint
    app.get('/openapi.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerDocument);
    });

    const configuredServer = swaggerDocument?.servers?.[0]?.url as string | undefined;
    const configuredPortMatch = configuredServer?.match(/localhost:(\\d+)/);
    const port = process.env.PORT || configuredPortMatch?.[1] || '${defaultPort}';
    console.log(\`📖 API Documentation available at: http://localhost:\${port}/docs\`);
  } catch (error) {
    console.error('Failed to setup Swagger:', error);
  }
}
`;
}

export function generateSwaggerReadme(defaultPort: string = "3000"): string {
  return `# API Documentation

## Swagger UI

Interactive API documentation is available at:

- **Development**: http://localhost:${defaultPort}/docs
- **OpenAPI Spec**: http://localhost:${defaultPort}/openapi.json

## Features

✅ Interactive API testing
✅ Auto-generated from code
✅ Request/Response examples
✅ Schema validation docs
✅ Export to Postman

## Usage

### View Documentation

\`\`\`bash
# Start your API
npm run dev

# Open browser
open http://localhost:${defaultPort}/docs
\`\`\`

### Regenerate Documentation

\`\`\`bash
# Auto-regenerates when you generate endpoints
katax generate crud users
katax add endpoint products

# Or manually regenerate
katax generate docs
katax generate docs --force
\`\`\`

### Export to Postman

1. Open http://localhost:${defaultPort}/openapi.json
2. Copy the JSON
3. In Postman: File → Import → Raw Text → Paste
4. ✅ All endpoints imported!

## Customization

Edit \`src/config/swagger.config.ts\` to customize:
- API title and description
- Server URLs
- Authentication schemes
- Contact information

## Maintaining Docs

Documentation is automatically updated when you:
- Generate CRUD resources
- Add new endpoints
- Update validators

The documentation reads directly from your:
- Route files (\`*.routes.ts\`)
- Validator files (\`*.validator.ts\`)
- Katax-core schemas

**No manual updates needed!** 🎉
`;
}
