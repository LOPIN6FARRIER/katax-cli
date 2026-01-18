export interface ProjectConfig {
  name: string;
  description?: string;
  type: 'rest-api' | 'graphql';
  typescript: boolean;
  database?: 'postgresql' | 'mysql' | 'mongodb' | 'none';
  authentication?: 'jwt' | 'none';
  validation: 'katax-core' | 'none';
  orm?: 'none' | 'prisma' | 'typeorm';
  port: number;
  dbConfig?: {
    host?: string;
    port?: string;
    user?: string;
    password?: string;
    database?: string;
    useAuth?: boolean;
  };
}

export interface EndpointConfig {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  addValidation: boolean;
  fields?: FieldConfig[];
  addAsyncValidators: boolean;
  dbOperations?: ('create' | 'read' | 'update' | 'delete')[];
}

export interface FieldConfig {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'array' | 'object';
  required: boolean;
  rules?: ValidationRule[];
  asyncValidator?: {
    type: 'unique' | 'exists' | 'custom';
    table?: string;
    column?: string;
  };
}

export interface ValidationRule {
  type: 'minLength' | 'maxLength' | 'min' | 'max' | 'email' | 'regex' | 'oneOf' | 'custom';
  value?: any;
  message?: string;
}

export interface CRUDConfig {
  resourceName: string;
  tableName?: string;
  fields: FieldConfig[];
  addAuth: boolean;
}
