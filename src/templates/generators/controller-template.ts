/**
 * Improved controller template generator
 * Uses Repository pattern and Result type for type-safe error handling
 */

import { CodeBuilder } from '../base/code-builder.js';
import { EndpointConfig, FieldConfig } from '../../types/index.js';

export class ControllerTemplate {
  constructor(private config: EndpointConfig) {}

  generate(): string {
    const builder = new CodeBuilder();
    const { name, method } = this.config;
    const pascalName = this.toPascalCase(name);
    
    // Imports
    this.addImports(builder, pascalName, method);
    
    // Controller class
    builder.section(`${pascalName} Controller`);
    this.addControllerClass(builder, pascalName, method);
    
    return builder.build();
  }

  private addImports(builder: CodeBuilder, pascalName: string, method: string): void {
    builder
      .import(['Result', 'ok', 'err', 'map'], '../../core/result.js')
      .import(['AppError', 'NotFoundError', 'ValidationError'], '../../core/errors.js')
      .import([`${pascalName}`, `${pascalName}Repository`], `./${this.config.name.toLowerCase()}.repository.js`);
    
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const dataType = method === 'POST' ? 'Create' : 'Update';
      builder.import([`${dataType}${pascalName}Data`], `./${this.config.name.toLowerCase()}.validator.js`);
    }
    
    builder
      .import(['Logger'], '../../shared/logger.utils.js')
      .line();
  }

  private addControllerClass(builder: CodeBuilder, pascalName: string, method: string): void {
    const camelName = this.toCamelCase(this.config.name);
    
    builder
      .comment(`${pascalName} controller with dependency injection`)
      .line(`export class ${pascalName}Controller {`)
      .line(`  constructor(`)
      .line(`    private repository: ${pascalName}Repository,`)
      .line(`    private logger: Logger`)
      .line(`  ) {}`)
      .line();
    
    // Generate methods based on HTTP method
    switch (method) {
      case 'GET':
        this.addGetMethods(builder, pascalName, camelName);
        break;
      case 'POST':
        this.addCreateMethod(builder, pascalName, camelName);
        break;
      case 'PUT':
      case 'PATCH':
        this.addUpdateMethod(builder, pascalName, camelName);
        break;
      case 'DELETE':
        this.addDeleteMethod(builder, pascalName, camelName);
        break;
    }
    
    builder.line(`}`);
  }

  private addGetMethods(builder: CodeBuilder, pascalName: string, camelName: string): void {
    // Get all
    builder
      .comment(`Get all ${camelName}s`)
      .line(`  async getAll(): Promise<Result<${pascalName}[], AppError>> {`)
      .line(`    this.logger.info('Fetching all ${camelName}s');`)
      .line()
      .line(`    const result = await this.repository.findAll();`)
      .line()
      .line(`    if (!result.ok) {`)
      .line(`      this.logger.error('Failed to fetch ${camelName}s', { error: result.error });`)
      .line(`      return result;`)
      .line(`    }`)
      .line()
      .line(`    this.logger.info('Successfully fetched ${camelName}s', { count: result.value.length });`)
      .line(`    return result;`)
      .line(`  }`)
      .line();
    
    // Get by ID
    builder
      .comment(`Get ${camelName} by ID`)
      .line(`  async getById(id: string): Promise<Result<${pascalName}, AppError>> {`)
      .line(`    this.logger.info('Fetching ${camelName}', { id });`)
      .line()
      .line(`    const result = await this.repository.findById(id);`)
      .line()
      .line(`    if (!result.ok) {`)
      .line(`      this.logger.error('Failed to fetch ${camelName}', { id, error: result.error });`)
      .line(`      return result;`)
      .line(`    }`)
      .line()
      .line(`    if (result.value === null) {`)
      .line(`      this.logger.warn('${pascalName} not found', { id });`)
      .line(`      return err(NotFoundError.forResource('${pascalName}', id));`)
      .line(`    }`)
      .line()
      .line(`    this.logger.info('Successfully fetched ${camelName}', { id });`)
      .line(`    return ok(result.value);`)
      .line(`  }`)
      .line();
  }

  private addCreateMethod(builder: CodeBuilder, pascalName: string, camelName: string): void {
    builder
      .comment(`Create a new ${camelName}`)
      .line(`  async create(data: Create${pascalName}Data): Promise<Result<${pascalName}, AppError>> {`)
      .line(`    this.logger.info('Creating ${camelName}', { data });`)
      .line()
      .line(`    // Business logic validation can go here`)
      .line(`    // Example: check for duplicates, validate relationships, etc.`)
      .line()
      .line(`    const result = await this.repository.create(data);`)
      .line()
      .line(`    if (!result.ok) {`)
      .line(`      this.logger.error('Failed to create ${camelName}', { data, error: result.error });`)
      .line(`      return result;`)
      .line(`    }`)
      .line()
      .line(`    this.logger.info('Successfully created ${camelName}', { id: result.value.id });`)
      .line(`    return result;`)
      .line(`  }`)
      .line();
  }

  private addUpdateMethod(builder: CodeBuilder, pascalName: string, camelName: string): void {
    builder
      .comment(`Update ${camelName}`)
      .line(`  async update(id: string, data: Update${pascalName}Data): Promise<Result<${pascalName}, AppError>> {`)
      .line(`    this.logger.info('Updating ${camelName}', { id, data });`)
      .line()
      .line(`    // Check if exists`)
      .line(`    const existsResult = await this.repository.exists(id);`)
      .line(`    if (!existsResult.ok) {`)
      .line(`      return err(existsResult.error);`)
      .line(`    }`)
      .line()
      .line(`    if (!existsResult.value) {`)
      .line(`      this.logger.warn('${pascalName} not found for update', { id });`)
      .line(`      return err(NotFoundError.forResource('${pascalName}', id));`)
      .line(`    }`)
      .line()
      .line(`    const result = await this.repository.update(id, data);`)
      .line()
      .line(`    if (!result.ok) {`)
      .line(`      this.logger.error('Failed to update ${camelName}', { id, error: result.error });`)
      .line(`      return result;`)
      .line(`    }`)
      .line()
      .line(`    this.logger.info('Successfully updated ${camelName}', { id });`)
      .line(`    return result;`)
      .line(`  }`)
      .line();
  }

  private addDeleteMethod(builder: CodeBuilder, pascalName: string, camelName: string): void {
    builder
      .comment(`Delete ${camelName}`)
      .line(`  async delete(id: string): Promise<Result<void, AppError>> {`)
      .line(`    this.logger.info('Deleting ${camelName}', { id });`)
      .line()
      .line(`    // Check if exists`)
      .line(`    const existsResult = await this.repository.exists(id);`)
      .line(`    if (!existsResult.ok) {`)
      .line(`      return err(existsResult.error);`)
      .line(`    }`)
      .line()
      .line(`    if (!existsResult.value) {`)
      .line(`      this.logger.warn('${pascalName} not found for deletion', { id });`)
      .line(`      return err(NotFoundError.forResource('${pascalName}', id));`)
      .line(`    }`)
      .line()
      .line(`    const result = await this.repository.delete(id);`)
      .line()
      .line(`    if (!result.ok) {`)
      .line(`      this.logger.error('Failed to delete ${camelName}', { id, error: result.error });`)
      .line(`      return result;`)
      .line(`    }`)
      .line()
      .line(`    this.logger.info('Successfully deleted ${camelName}', { id });`)
      .line(`    return result;`)
      .line(`  }`)
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
