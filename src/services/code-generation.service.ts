/**
 * Code generation service
 * Coordinates template generation and file writing
 */

import path from 'path';
import { writeFile, ensureDir } from '../utils/file-utils.js';
import { EndpointConfig } from '../types/index.js';
import { RepositoryTemplate, RepositoryConfig } from '../templates/generators/repository-template.js';
import { ControllerTemplate } from '../templates/generators/controller-template.js';
import { HandlerTemplate } from '../templates/generators/handler-template.js';
import { generateValidatorImproved } from '../generators/validator-generator.improved.js';
import { generateControllerFactory } from '../templates/generators/di-container.js';
import { generateRoute } from '../generators/route-generator.js';
import { astRouterUpdater } from './ast-router-updater.js';
import { success, error, info, gray } from '../utils/logger.js';

export interface GeneratedFiles {
  validator?: string;
  repository?: string;
  controller: string;
  handler: string;
  routes: string;
}

export class CodeGenerationService {
  /**
   * Generate complete endpoint with all layers
   */
  async generateEndpoint(
    config: EndpointConfig,
    projectPath: string,
    database?: 'postgresql' | 'mysql' | 'mongodb'
  ): Promise<GeneratedFiles> {
    const basePath = path.join(projectPath, 'src', 'api', config.name.toLowerCase());
    await ensureDir(basePath);

    const files: GeneratedFiles = {
      controller: '',
      handler: '',
      routes: ''
    };

    info(`Generating endpoint: ${config.name}`);

    // 1. Generate validator
    if (config.addValidation) {
      const validatorPath = path.join(basePath, `${config.name.toLowerCase()}.validator.ts`);
      const validatorContent = generateValidatorImproved(config);
      await writeFile(validatorPath, validatorContent);
      files.validator = validatorPath;
      info(`✓ Generated validator`);
    }

    // 2. Generate repository (if database is configured)
    if (database && config.fields && config.fields.length > 0) {
      const repositoryConfig: RepositoryConfig = {
        name: config.name,
        tableName: `${config.name.toLowerCase()}s`,
        fields: config.fields,
        database,
        idType: 'uuid'
      };

      const repositoryTemplate = new RepositoryTemplate(repositoryConfig);
      const repositoryPath = path.join(basePath, `${config.name.toLowerCase()}.repository.ts`);
      const repositoryContent = repositoryTemplate.generate();
      await writeFile(repositoryPath, repositoryContent);
      files.repository = repositoryPath;
      info(`✓ Generated repository`);
    }

    // 3. Generate controller
    const controllerTemplate = new ControllerTemplate(config);
    const controllerPath = path.join(basePath, `${config.name.toLowerCase()}.controller.ts`);
    const controllerContent = controllerTemplate.generate();
    await writeFile(controllerPath, controllerContent);
    files.controller = controllerPath;
    info(`✓ Generated controller`);

    // 4. Generate handler
    const handlerTemplate = new HandlerTemplate(config);
    const handlerPath = path.join(basePath, `${config.name.toLowerCase()}.handler.ts`);
    const handlerContent = handlerTemplate.generate();
    await writeFile(handlerPath, handlerContent);
    files.handler = handlerPath;
    info(`✓ Generated handler`);

    // 5. Generate routes
    const routesPath = path.join(basePath, `${config.name.toLowerCase()}.routes.ts`);
    const routesContent = generateRoute(config);
    await writeFile(routesPath, routesContent);
    files.routes = routesPath;
    info(`✓ Generated routes`);

    // 6. Generate controller factory (DI)
    if (database && config.fields && config.fields.length > 0) {
      const factoryPath = path.join(basePath, `${config.name.toLowerCase()}.factory.ts`);
      const factoryContent = generateControllerFactory(config.name);
      await writeFile(factoryPath, factoryContent);
      info(`✓ Generated controller factory`);
    }

    // 7. Update main router
    await this.updateMainRouter(projectPath, config);
    info(`✓ Updated main router`);

    return files;
  }

  /**
   * Generate CRUD endpoints
   */
  async generateCRUD(
    resourceName: string,
    fields: any[],
    projectPath: string,
    database?: 'postgresql' | 'mysql' | 'mongodb',
    addAuth: boolean = false
  ): Promise<void> {
    info(`Generating CRUD for: ${resourceName}`);

    // Generate each CRUD operation
    const operations = [
      { name: `${resourceName}`, method: 'POST', path: `/api/${resourceName.toLowerCase()}` },
      { name: `${resourceName}`, method: 'GET', path: `/api/${resourceName.toLowerCase()}` },
      { name: `${resourceName}`, method: 'PUT', path: `/api/${resourceName.toLowerCase()}/:id` },
      { name: `${resourceName}`, method: 'DELETE', path: `/api/${resourceName.toLowerCase()}/:id` }
    ];

    for (const operation of operations) {
      const config: EndpointConfig = {
        name: resourceName,
        method: operation.method as any,
        path: operation.path,
        addValidation: true,
        fields,
        addAsyncValidators: false
      };

      await this.generateEndpoint(config, projectPath, database);
    }

    info(`✓ CRUD generation complete`);
  }

  /**
   * Update main router using AST
   */
  private async updateMainRouter(projectPath: string, config: EndpointConfig): Promise<void> {
    const routesFilePath = path.join(projectPath, 'src', 'api', 'routes.ts');
    const routerName = `${config.name.toLowerCase()}Router`;
    const importPath = `./${config.name.toLowerCase()}/${config.name.toLowerCase()}.routes.js`;
    const routePath = config.path.replace(/^\/api/, '') || `/${config.name.toLowerCase()}`;

    // Check if already exists
    const importExists = await astRouterUpdater.importExists(routesFilePath, routerName);
    const routeExists = await astRouterUpdater.routeExists(routesFilePath, routePath);

    if (importExists && routeExists) {
      gray(`Route ${routePath} already exists, skipping...`);
      return;
    }

    await astRouterUpdater.addRoute(routesFilePath, {
      routerName,
      importPath,
      routePath
    });
  }
}

/**
 * Export singleton instance
 */
export const codeGenerationService = new CodeGenerationService();
