/**
 * Test Generator
 * Generates Jest tests for repositories, controllers, and handlers
 */

import { CodeBuilder } from '../base/code-builder.js';
import { FieldConfig } from '../../types/index.js';

/**
 * Generate repository tests
 */
export function generateRepositoryTests(config: {
  name: string;
  fields: FieldConfig[];
  database: 'postgresql' | 'mysql' | 'mongodb';
}): string {
  const builder = new CodeBuilder();
  const pascalName = toPascalCase(config.name);
  const camelName = toCamelCase(config.name);

  builder
    .section('Repository Tests')
    .import([`${config.database === 'postgresql' ? 'Postgres' : config.database === 'mysql' ? 'MySQL' : 'Mongo'}${pascalName}Repository`], `./${camelName}.repository.js`)
    .import(['ok', 'err'], '../../core/result.js')
    .import(['DatabaseError'], '../../core/errors.js')
    .line();

  // Mock database
  builder
    .section('Mocks')
    .line('const mockDatabase = {')
    .line('  query: jest.fn(),')
    .line('  collection: jest.fn(),')
    .line('};')
    .line()
    .line('const mockLogger = {')
    .line('  error: jest.fn(),')
    .line('  info: jest.fn(),')
    .line('  warn: jest.fn(),')
    .line('  debug: jest.fn(),')
    .line('};')
    .line();

  // Test suite
  builder
    .section('Test Suite')
    .line(`describe('${pascalName}Repository', () => {`)
    .line(`  let repository: ${config.database === 'postgresql' ? 'Postgres' : config.database === 'mysql' ? 'MySQL' : 'Mongo'}${pascalName}Repository;`)
    .line()
    .line('  beforeEach(() => {')
    .line('    jest.clearAllMocks();')
    .line(`    repository = new ${config.database === 'postgresql' ? 'Postgres' : config.database === 'mysql' ? 'MySQL' : 'Mongo'}${pascalName}Repository(mockDatabase as any, mockLogger as any);`)
    .line('  });')
    .line();

  // Test: findAll
  builder
    .section('findAll tests')
    .line(`  describe('findAll', () => {`)
    .line(`    it('should return all ${camelName}s successfully', async () => {`)
    .line('      const mockData = [')
    .line('        { id: "1", name: "Test 1" },')
    .line('        { id: "2", name: "Test 2" }')
    .line('      ];')
    .line()
    .line(`      mockDatabase.query.mockResolvedValue({ rows: mockData });`)
    .line()
    .line('      const result = await repository.findAll();')
    .line()
    .line('      expect(result.ok).toBe(true);')
    .line('      if (result.ok) {')
    .line('        expect(result.value).toEqual(mockData);')
    .line('      }')
    .line('    });')
    .line()
    .line('    it("should return error on database failure", async () => {')
    .line('      mockDatabase.query.mockRejectedValue(new Error("Connection failed"));')
    .line()
    .line('      const result = await repository.findAll();')
    .line()
    .line('      expect(result.ok).toBe(false);')
    .line('      if (!result.ok) {')
    .line('        expect(result.error).toBeInstanceOf(DatabaseError);')
    .line('      }')
    .line('    });')
    .line('  });')
    .line();

  // Test: findById
  builder
    .section('findById tests')
    .line('  describe("findById", () => {')
    .line('    it("should find entity by id", async () => {')
    .line('      const mockEntity = { id: "1", name: "Test" };')
    .line('      mockDatabase.query.mockResolvedValue({ rows: [mockEntity] });')
    .line()
    .line('      const result = await repository.findById("1");')
    .line()
    .line('      expect(result.ok).toBe(true);')
    .line('      if (result.ok) {')
    .line('        expect(result.value).toEqual(mockEntity);')
    .line('      }')
    .line('    });')
    .line()
    .line('    it("should return null for non-existent id", async () => {')
    .line('      mockDatabase.query.mockResolvedValue({ rows: [] });')
    .line()
    .line('      const result = await repository.findById("999");')
    .line()
    .line('      expect(result.ok).toBe(true);')
    .line('      if (result.ok) {')
    .line('        expect(result.value).toBeNull();')
    .line('      }')
    .line('    });')
    .line('  });')
    .line();

  // Test: create
  builder
    .section('create tests')
    .line('  describe("create", () => {')
    .line('    it("should create new entity", async () => {')
    .line('      const newData = { name: "New Test" };')
    .line('      const created = { id: "new-id", ...newData };')
    .line('      mockDatabase.query.mockResolvedValue({ rows: [created] });')
    .line()
    .line('      const result = await repository.create(newData);')
    .line()
    .line('      expect(result.ok).toBe(true);')
    .line('      if (result.ok) {')
    .line('        expect(result.value).toEqual(created);')
    .line('      }')
    .line('    });')
    .line('  });')
    .line();

  // Close describe
  builder.line('});');

  return builder.build();
}

/**
 * Generate controller tests
 */
export function generateControllerTests(config: {
  name: string;
  fields: FieldConfig[];
}): string {
  const builder = new CodeBuilder();
  const pascalName = toPascalCase(config.name);
  const camelName = toCamelCase(config.name);

  builder
    .section('Controller Tests')
    .import([`${pascalName}Controller`], `./${camelName}.controller.js`)
    .import(['ok', 'err'], '../../core/result.js')
    .import(['NotFoundError', 'ValidationError'], '../../core/errors.js')
    .line();

  // Mocks
  builder
    .section('Mocks')
    .line('const mockRepository = {')
    .line('  findAll: jest.fn(),')
    .line('  findById: jest.fn(),')
    .line('  create: jest.fn(),')
    .line('  update: jest.fn(),')
    .line('  delete: jest.fn(),')
    .line('  exists: jest.fn(),')
    .line('};')
    .line()
    .line('const mockLogger = {')
    .line('  error: jest.fn(),')
    .line('  info: jest.fn(),')
    .line('  warn: jest.fn(),')
    .line('  debug: jest.fn(),')
    .line('};')
    .line();

  // Test suite
  builder
    .section('Test Suite')
    .line(`describe('${pascalName}Controller', () => {`)
    .line(`  let controller: ${pascalName}Controller;`)
    .line()
    .line('  beforeEach(() => {')
    .line('    jest.clearAllMocks();')
    .line(`    controller = new ${pascalName}Controller(mockRepository as any, mockLogger as any);`)
    .line('  });')
    .line();

  // Test: getAll
  builder
    .line('  describe("getAll", () => {')
    .line('    it("should return all items", async () => {')
    .line('      const mockData = [{ id: "1", name: "Test" }];')
    .line('      mockRepository.findAll.mockResolvedValue(ok(mockData));')
    .line()
    .line('      const result = await controller.getAll();')
    .line()
    .line('      expect(result.ok).toBe(true);')
    .line('      if (result.ok) {')
    .line('        expect(result.value).toEqual(mockData);')
    .line('      }')
    .line('    });')
    .line('  });')
    .line();

  // Test: getById
  builder
    .line('  describe("getById", () => {')
    .line('    it("should return item by id", async () => {')
    .line('      const mockItem = { id: "1", name: "Test" };')
    .line('      mockRepository.findById.mockResolvedValue(ok(mockItem));')
    .line()
    .line('      const result = await controller.getById("1");')
    .line()
    .line('      expect(result.ok).toBe(true);')
    .line('      if (result.ok) {')
    .line('        expect(result.value).toEqual(mockItem);')
    .line('      }')
    .line('    });')
    .line()
    .line('    it("should return error when not found", async () => {')
    .line('      mockRepository.findById.mockResolvedValue(ok(null));')
    .line()
    .line('      const result = await controller.getById("999");')
    .line()
    .line('      expect(result.ok).toBe(false);')
    .line('      if (!result.ok) {')
    .line('        expect(result.error).toBeInstanceOf(NotFoundError);')
    .line('      }')
    .line('    });')
    .line('  });')
    .line();

  builder.line('});');

  return builder.build();
}

/**
 * Helper functions
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
