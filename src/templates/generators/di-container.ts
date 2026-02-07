/**
 * Dependency Injection Container
 * Simple DI container for managing dependencies in generated projects
 */

import { CodeBuilder } from '../base/code-builder.js';

export function generateDIContainer(config: {
  hasDatabase: boolean;
  database?: 'postgresql' | 'mysql' | 'mongodb';
}): string {
  const builder = new CodeBuilder();

  builder
    .comment('Dependency Injection Container')
    .comment('Manages service instances and their dependencies')
    .line();

  // Imports
  builder
    .import(['Logger'], './shared/logger.utils.js');

  if (config.hasDatabase) {
    builder.importDefault('pool', './database/connection.js');
  }

  builder.line();

  // Container class
  builder
    .section('Container')
    .line('class Container {')
    .line('  private instances: Map<string, any> = new Map();')
    .line('  private factories: Map<string, () => any> = new Map();')
    .line()
    .comment('Register a factory function')
    .line('  register<T>(name: string, factory: () => T): void {')
    .line('    this.factories.set(name, factory);')
    .line('  }')
    .line()
    .comment('Register a singleton instance')
    .line('  registerSingleton<T>(name: string, factory: () => T): void {')
    .line('    this.register(name, () => {')
    .line('      if (!this.instances.has(name)) {')
    .line('        this.instances.set(name, factory());')
    .line('      }')
    .line('      return this.instances.get(name);')
    .line('    });')
    .line('  }')
    .line()
    .comment('Resolve a dependency')
    .line('  resolve<T>(name: string): T {')
    .line('    const factory = this.factories.get(name);')
    .line('    if (!factory) {')
    .line('      throw new Error(`Dependency "${name}" not registered`);')
    .line('    }')
    .line('    return factory();')
    .line('  }')
    .line()
    .comment('Clear all instances (useful for testing)')
    .line('  clear(): void {')
    .line('    this.instances.clear();')
    .line('  }')
    .line('}')
    .line();

  // Create container instance
  builder
    .section('Container Instance')
    .line('export const container = new Container();')
    .line();

  // Register core services
  builder
    .section('Register Core Services')
    .comment('Logger is a singleton')
    .line("container.registerSingleton('logger', () => {")
    .line("  const { logger } = require('./shared/logger.utils.js');")
    .line('  return logger;')
    .line('});')
    .line();

  if (config.hasDatabase) {
    builder
      .comment('Database pool is a singleton')
      .line("container.registerSingleton('database', () => {")
      .line("  const pool = require('./database/connection.js').default;")
      .line('  return pool;')
      .line('});')
      .line();
  }

  // Export helper functions
  builder
    .section('Helper Functions')
    .comment('Get logger instance')
    .line('export function getLogger(): Logger {')
    .line("  return container.resolve('logger');")
    .line('}')
    .line();

  if (config.hasDatabase) {
    builder
      .comment('Get database instance')
      .line('export function getDatabase() {')
      .line("  return container.resolve('database');")
      .line('}')
      .line();
  }

  // Export example registration helper
  builder
    .comment('Example: Register a repository')
    .comment('container.registerSingleton("userRepository", () => {')
    .comment('  const { PostgresUserRepository } = require("./api/user/user.repository.js");')
    .comment('  return new PostgresUserRepository(getDatabase(), getLogger());')
    .comment('});')
    .line();

  return builder.build();
}

/**
 * Generate DI-aware controller factory
 */
export function generateControllerFactory(resourceName: string): string {
  const builder = new CodeBuilder();
  const pascalName = toPascalCase(resourceName);

  builder
    .comment(`${pascalName} Controller Factory`)
    .comment('Creates controller instance with injected dependencies')
    .line()
    .import([`${pascalName}Controller`], `./${resourceName.toLowerCase()}.controller.js`)
    .import([`Postgres${pascalName}Repository`], `./${resourceName.toLowerCase()}.repository.js`)
    .import(['getLogger', 'getDatabase'], '../../container.js')
    .line()
    .comment('Create and export controller instance')
    .line(`const repository = new Postgres${pascalName}Repository(getDatabase(), getLogger());`)
    .line(`export const ${resourceName.toLowerCase()}Controller = new ${pascalName}Controller(`)
    .line('  repository,')
    .line('  getLogger()')
    .line(');')
    .line();

  return builder.build();
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
