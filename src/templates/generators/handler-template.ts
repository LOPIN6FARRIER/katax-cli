/**
 * Improved handler template generator
 * Simplified Express handlers that delegate to controllers
 */

import { CodeBuilder } from '../base/code-builder.js';
import { EndpointConfig } from '../../types/index.js';

export class HandlerTemplate {
  constructor(private config: EndpointConfig) {}

  generate(): string {
    const builder = new CodeBuilder();
    const { name, method } = this.config;
    const pascalName = this.toPascalCase(name);
    
    // Imports
    this.addImports(builder, pascalName);
    
    // Handler functions
    builder.section(`${pascalName} Handlers`);
    this.addHandlers(builder, pascalName, method);
    
    return builder.build();
  }

  private addImports(builder: CodeBuilder, pascalName: string): void {
    builder
      .import(['Request', 'Response'], 'express')
      .import(['sendResult', 'sendResponse', 'sendValidationError'], '../../shared/response.utils.js')
      .import([`${pascalName}Controller`], `./${this.config.name.toLowerCase()}.controller.js`);
    
    if (this.config.addValidation) {
      const validators = [`validate${pascalName}`, `validate${pascalName}Id`];
      if (this.config.method === 'GET' && this.config.fields && this.config.fields.length > 0) {
        validators.push(`validate${pascalName}Query`);
      }
      builder.import(validators, `./${this.config.name.toLowerCase()}.validator.js`);
    }
    
    builder
      .import(['logger'], '../../shared/logger.utils.js')
      .line();
    
    // Controller instance comment
    builder
      .comment('Controller instance will be injected via DI container')
      .comment('For now, import and instantiate it directly')
      .line(`// import { ${this.toCamelCase(this.config.name)}Controller } from './index.js';`)
      .line();
  }

  private addHandlers(builder: CodeBuilder, pascalName: string, method: string): void {
    const camelName = this.toCamelCase(this.config.name);
    
    switch (method) {
      case 'GET':
        this.addGetHandlers(builder, pascalName, camelName);
        break;
      case 'POST':
        this.addCreateHandler(builder, pascalName, camelName);
        break;
      case 'PUT':
      case 'PATCH':
        this.addUpdateHandler(builder, pascalName, camelName);
        break;
      case 'DELETE':
        this.addDeleteHandler(builder, pascalName, camelName);
        break;
    }
  }

  private addGetHandlers(builder: CodeBuilder, pascalName: string, camelName: string): void {
    // Get all handler
    builder
      .comment(`Get all ${camelName}s handler - Uses sendResponse for automatic validation + response`)
      .line(`export async function getAll${pascalName}Handler(`)
      .line(`  controller: ${pascalName}Controller`)
      .line(`): Promise<(req: Request, res: Response) => Promise<void>> {`)
      .line(`  return async (req: Request, res: Response) => {`);
    
    if (this.config.addValidation && this.config.fields && this.config.fields.length > 0) {
      // With query validation
      builder
        .line(`    await sendResponse(req, res, {`)
        .line(`      validator: validate${pascalName}Query,`)
        .line(`      controller: (data) => controller.getAll(data),`)
        .line(`      dataSource: 'query',`)
        .line(`      successMessage: '${pascalName} list retrieved'`)
        .line(`    });`);
    } else {
      // Without validation (simple result)
      builder
        .line(`    const result = await controller.getAll();`)
        .line(`    sendResult(res, result);`);
    }
    
    builder
      .line(`  };`)
      .line(`}`)
      .line();
    
    // Get by ID handler
    builder
      .comment(`Get ${camelName} by ID handler - Simplified with sendResponse`)
      .line(`export async function get${pascalName}ByIdHandler(`)
      .line(`  controller: ${pascalName}Controller`)
      .line(`): Promise<(req: Request, res: Response) => Promise<void>> {`)
      .line(`  return async (req: Request, res: Response) => {`);
    
    if (this.config.addValidation) {
      builder
        .line(`    // Validate and execute with sendResponse`)
        .line(`    await sendResponse(req, res, {`)
        .line(`      validator: (data) => validate${pascalName}Id(data.id),`)
        .line(`      controller: (data) => controller.getById(data.id),`)
        .line(`      dataSource: 'params',`)
        .line(`      successMessage: '${pascalName} retrieved'`)
        .line(`    });`);
    } else {
      builder
        .line(`    const result = await controller.getById(req.params.id);`)
        .line(`    sendResult(res, result);`);
    }
    
    builder
      .line(`  };`)
      .line(`}`)
      .line();
  }

  private addCreateHandler(builder: CodeBuilder, pascalName: string, camelName: string): void {
    builder
      .comment(`Create ${camelName} handler - Simplified with sendResponse`)
      .line(`export async function create${pascalName}Handler(`)
      .line(`  controller: ${pascalName}Controller`)
      .line(`): Promise<(req: Request, res: Response) => Promise<void>> {`)
      .line(`  return async (req: Request, res: Response) => {`);
    
    if (this.config.addValidation) {
      builder
        .line(`    // Single line: validate body + create + respond`)
        .line(`    await sendResponse(req, res, {`)
        .line(`      validator: validate${pascalName},`)
        .line(`      controller: (data) => controller.create(data),`)
        .line(`      dataSource: 'body',`)
        .line(`      successMessage: '${pascalName} created successfully',`)
        .line(`      successStatus: 201`)
        .line(`    });`);
    } else {
      builder
        .line(`    const result = await controller.create(req.body);`)
        .line(`    sendResult(res, result, '${pascalName} created', 201);`);
    }
    
    builder
      .line(`  };`)
      .line(`}`)
      .line();
  }

  private addUpdateHandler(builder: CodeBuilder, pascalName: string, camelName: string): void {
    builder
      .comment(`Update ${camelName} handler - Validates ID + body with sendResponse`)
      .line(`export async function update${pascalName}Handler(`)
      .line(`  controller: ${pascalName}Controller`)
      .line(`): Promise<(req: Request, res: Response) => Promise<void>> {`)
      .line(`  return async (req: Request, res: Response) => {`)
      .line(`    const { id } = req.params;`)
      .line();
    
    if (this.config.addValidation) {
      builder
        .line(`    // Validate ID first`)
        .line(`    const idValidation = await validate${pascalName}Id(id);`)
        .line(`    if (!idValidation.success) {`)
        .line(`      return sendValidationError(res, idValidation.errors, 'Invalid ID');`)
        .line(`    }`)
        .line()
        .line(`    // Validate body and execute`)
        .line(`    await sendResponse(req, res, {`)
        .line(`      validator: validate${pascalName},`)
        .line(`      controller: (data) => controller.update(id, data),`)
        .line(`      dataSource: 'body',`)
        .line(`      successMessage: '${pascalName} updated successfully'`)
        .line(`    });`);
    } else {
      builder
        .line(`    const result = await controller.update(id, req.body);`)
        .line(`    sendResult(res, result);`);
    }
    
    builder
      .line(`  };`)
      .line(`}`)
      .line();
  }

  private addDeleteHandler(builder: CodeBuilder, pascalName: string, camelName: string): void {
    builder
      .comment(`Delete ${camelName} handler - Simplified with sendResponse`)
      .line(`export async function delete${pascalName}Handler(`)
      .line(`  controller: ${pascalName}Controller`)
      .line(`): Promise<(req: Request, res: Response) => Promise<void>> {`)
      .line(`  return async (req: Request, res: Response) => {`);
    
    if (this.config.addValidation) {
      builder
        .line(`    // Validate ID and delete`)
        .line(`    await sendResponse(req, res, {`)
        .line(`      validator: (data) => validate${pascalName}Id(data.id),`)
        .line(`      controller: (data) => controller.delete(data.id),`)
        .line(`      dataSource: 'params',`)
        .line(`      successMessage: '${pascalName} deleted successfully',`)
        .line(`      successStatus: 204`)
        .line(`    });`);
    } else {
      builder
        .line(`    const result = await controller.delete(req.params.id);`)
        .line(`    sendResult(res, result, '${pascalName} deleted', 204);`);
    }
    
    builder
      .line(`  };`)
      .line(`}`)
      .line();
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  private toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
}
