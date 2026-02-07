/**
 * Repository template generator
 * Generates type-safe repository pattern for database operations
 */

import { CodeBuilder } from '../base/code-builder.js';
import { FieldConfig } from '../../types/index.js';

export interface RepositoryConfig {
  name: string;
  tableName: string;
  fields: FieldConfig[];
  database: 'postgresql' | 'mysql' | 'mongodb';
  idType?: 'uuid' | 'integer' | 'objectid';
}

export class RepositoryTemplate {
  constructor(private config: RepositoryConfig) {}

  generate(): string {
    const builder = new CodeBuilder();
    const { name, tableName, fields, database } = this.config;
    const pascalName = this.toPascalCase(name);
    
    // Imports
    this.addImports(builder, database);
    
    // Types
    builder.section('Types');
    this.addTypes(builder, pascalName);
    
    // Interface
    builder.section('Repository Interface');
    this.addInterface(builder, pascalName);
    
    // Implementation
    builder.section('Repository Implementation');
    this.addImplementation(builder, pascalName, tableName, fields, database);
    
    return builder.build();
  }

  private addImports(builder: CodeBuilder, database: string): void {
    builder
      .import(['Result', 'ok', 'err', 'tryCatchAsync'], '../../core/result.js')
      .import(['DatabaseError', 'NotFoundError'], '../../core/errors.js')
      .import([`Create${this.toPascalCase(this.config.name)}Data`, `Update${this.toPascalCase(this.config.name)}Data`], `./${this.config.name.toLowerCase()}.validator.js`);
    
    if (database === 'postgresql') {
      builder.importDefault('pool', '../../database/connection.js');
      builder.import(['QueryResult'], 'pg');
    } else if (database === 'mysql') {
      builder.importDefault('pool', '../../database/connection.js');
      builder.import(['Pool', 'RowDataPacket'], 'mysql2/promise');
    } else if (database === 'mongodb') {
      builder.importDefault('client', '../../database/connection.js');
      builder.import(['ObjectId'], 'mongodb');
    }
    
    builder.line();
  }

  private addTypes(builder: CodeBuilder, pascalName: string): void {
    builder
      .line(`export interface ${pascalName} {`)
      .line(`  id: string;`);
    
    this.config.fields.forEach(field => {
      const optional = field.required ? '' : '?';
      const tsType = this.mapFieldType(field.type);
      builder.line(`  ${field.name}${optional}: ${tsType};`);
    });
    
    builder
      .line(`  createdAt: Date;`)
      .line(`  updatedAt: Date;`)
      .line(`}`)
      .line();
  }

  private addInterface(builder: CodeBuilder, pascalName: string): void {
    builder
      .line(`export interface ${pascalName}Repository {`)
      .line(`  findAll(): Promise<Result<${pascalName}[], DatabaseError>>;`)
      .line(`  findById(id: string): Promise<Result<${pascalName} | null, DatabaseError>>;`)
      .line(`  create(data: Create${pascalName}Data): Promise<Result<${pascalName}, DatabaseError>>;`)
      .line(`  update(id: string, data: Update${pascalName}Data): Promise<Result<${pascalName}, DatabaseError>>;`)
      .line(`  delete(id: string): Promise<Result<void, DatabaseError>>;`)
      .line(`  exists(id: string): Promise<Result<boolean, DatabaseError>>;`)
      .line(`}`)
      .line();
  }

  private addImplementation(
    builder: CodeBuilder,
    pascalName: string,
    tableName: string,
    fields: FieldConfig[],
    database: string
  ): void {
    if (database === 'postgresql') {
      this.addPostgresImplementation(builder, pascalName, tableName, fields);
    } else if (database === 'mysql') {
      this.addMySQLImplementation(builder, pascalName, tableName, fields);
    } else if (database === 'mongodb') {
      this.addMongoDBImplementation(builder, pascalName, tableName, fields);
    }
  }

  private addPostgresImplementation(
    builder: CodeBuilder,
    pascalName: string,
    tableName: string,
    fields: FieldConfig[]
  ): void {
    builder
      .line(`export class Postgres${pascalName}Repository implements ${pascalName}Repository {`)
      .line(`  async findAll(): Promise<Result<${pascalName}[], DatabaseError>> {`)
      .line(`    return tryCatchAsync(`)
      .line(`      async () => {`)
      .line(`        const result = await pool.query<${pascalName}>(`)
      .line(`          'SELECT * FROM ${tableName} ORDER BY created_at DESC'`)
      .line(`        );`)
      .line(`        return result.rows;`)
      .line(`      },`)
      .line(`      (error) => DatabaseError.fromError(error as Error, 'findAll')`)
      .line(`    );`)
      .line(`  }`)
      .line()
      .line(`  async findById(id: string): Promise<Result<${pascalName} | null, DatabaseError>> {`)
      .line(`    return tryCatchAsync(`)
      .line(`      async () => {`)
      .line(`        const result = await pool.query<${pascalName}>(`)
      .line(`          'SELECT * FROM ${tableName} WHERE id = $1',`)
      .line(`          [id]`)
      .line(`        );`)
      .line(`        return result.rows[0] || null;`)
      .line(`      },`)
      .line(`      (error) => DatabaseError.fromError(error as Error, 'findById')`)
      .line(`    );`)
      .line(`  }`)
      .line()
      .line(`  async create(data: Create${pascalName}Data): Promise<Result<${pascalName}, DatabaseError>> {`)
      .line(`    const fieldNames = [${fields.map(f => `'${f.name}'`).join(', ')}];`)
      .line(`    const fieldValues = [${fields.map(f => `data.${f.name}`).join(', ')}];`)
      .line(`    const placeholders = fieldNames.map((_, i) => \`$\${i + 1}\`).join(', ');`)
      .line()
      .line(`    return tryCatchAsync(`)
      .line(`      async () => {`)
      .line(`        const result = await pool.query<${pascalName}>(`)
      .line(`          'INSERT INTO ${tableName} (' + fieldNames.join(', ') + ', created_at, updated_at)'`)
      .line(`            + ' VALUES (' + placeholders + ', NOW(), NOW()) RETURNING *',`)
      .line(`          fieldValues`)
      .line(`        );`)
      .line(`        return result.rows[0];`)
      .line(`      },`)
      .line(`      (error) => DatabaseError.fromError(error as Error, 'create')`)
      .line(`    );`)
      .line(`  }`)
      .line()
      .line(`  async update(id: string, data: Update${pascalName}Data): Promise<Result<${pascalName}, DatabaseError>> {`)
      .line(`    const updates = Object.entries(data)`)
      .line(`      .filter(([_, value]) => value !== undefined)`)
      .line(`      .map(([key], index) => \`\${key} = $\${index + 1}\`)`)
      .line(`      .join(', ');`)
      .line()
      .line(`    if (!updates) {`)
      .line(`      return err(new DatabaseError('No fields to update', 'update'));`)
      .line(`    }`)
      .line()
      .line(`    const values = Object.values(data).filter(v => v !== undefined);`)
      .line(`    values.push(id);`)
      .line()
      .line(`    return tryCatchAsync(`)
      .line(`      async () => {`)
      .line(`        const result = await pool.query<${pascalName}>(`)
      .line(`          'UPDATE ${tableName} SET ' + updates + ', updated_at = NOW() WHERE id = $' + values.length + ' RETURNING *',`)
      .line(`          values`)
      .line(`        );`)
      .line(`        if (result.rows.length === 0) {`)
      .line(`          throw NotFoundError.forResource('${pascalName}', id);`)
      .line(`        }`)
      .line(`        return result.rows[0];`)
      .line(`      },`)
      .line(`      (error) => DatabaseError.fromError(error as Error, 'update')`)
      .line(`    );`)
      .line(`  }`)
      .line()
      .line(`  async delete(id: string): Promise<Result<void, DatabaseError>> {`)
      .line(`    return tryCatchAsync(`)
      .line(`      async () => {`)
      .line(`        const result = await pool.query(`)
      .line(`          'DELETE FROM ${tableName} WHERE id = $1 RETURNING id',`)
      .line(`          [id]`)
      .line(`        );`)
      .line(`        if (result.rowCount === 0) {`)
      .line(`          throw NotFoundError.forResource('${pascalName}', id);`)
      .line(`        }`)
      .line(`      },`)
      .line(`      (error) => DatabaseError.fromError(error as Error, 'delete')`)
      .line(`    );`)
      .line(`  }`)
      .line()
      .line(`  async exists(id: string): Promise<Result<boolean, DatabaseError>> {`)
      .line(`    return tryCatchAsync(`)
      .line(`      async () => {`)
      .line(`        const result = await pool.query(`)
      .line(`          'SELECT EXISTS(SELECT 1 FROM ${tableName} WHERE id = $1) as exists',`)
      .line(`          [id]`)
      .line(`        );`)
      .line(`        return result.rows[0].exists;`)
      .line(`      },`)
      .line(`      (error) => DatabaseError.fromError(error as Error, 'exists')`)
      .line(`    );`)
      .line(`  }`)
      .line(`}`);
  }

  private addMySQLImplementation(
    builder: CodeBuilder,
    pascalName: string,
    tableName: string,
    fields: FieldConfig[]
  ): void {
    builder
      .line(`export class MySQL${pascalName}Repository implements ${pascalName}Repository {`)
      .line(`  async findAll(): Promise<Result<${pascalName}[], DatabaseError>> {`)
      .line(`    return tryCatchAsync(`)
      .line(`      async () => {`)
      .line(`        const [rows] = await pool.query<RowDataPacket[]>(`)
      .line(`          'SELECT * FROM ${tableName} ORDER BY created_at DESC'`)
      .line(`        );`)
      .line(`        return rows as ${pascalName}[];`)
      .line(`      },`)
      .line(`      (error) => DatabaseError.fromError(error as Error, 'findAll')`)
      .line(`    );`)
      .line(`  }`)
      .line()
      .line(`  // ... similar implementation for other methods`)
      .line(`}`);
  }

  private addMongoDBImplementation(
    builder: CodeBuilder,
    pascalName: string,
    tableName: string,
    fields: FieldConfig[]
  ): void {
    builder
      .line(`export class MongoDB${pascalName}Repository implements ${pascalName}Repository {`)
      .line(`  private get collection() {`)
      .line(`    return client.db().collection<${pascalName}>('${tableName}');`)
      .line(`  }`)
      .line()
      .line(`  async findAll(): Promise<Result<${pascalName}[], DatabaseError>> {`)
      .line(`    return tryCatchAsync(`)
      .line(`      async () => {`)
      .line(`        const docs = await this.collection.find().sort({ createdAt: -1 }).toArray();`)
      .line(`        return docs.map(doc => ({ ...doc, id: doc._id.toString() }));`)
      .line(`      },`)
      .line(`      (error) => DatabaseError.fromError(error as Error, 'findAll')`)
      .line(`    );`)
      .line(`  }`)
      .line()
      .line(`  // ... similar implementation for other methods`)
      .line(`}`);
  }

  private mapFieldType(type: string): string {
    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      date: 'Date',
      email: 'string',
      array: 'any[]',
      object: 'Record<string, any>'
    };
    return typeMap[type] || 'any';
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
}
