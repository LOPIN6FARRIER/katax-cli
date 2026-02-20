import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

interface OpenAPIEndpoint {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  tags?: string[];
  requestBody?: any;
  responses?: any;
  parameters?: any[];
  handlerName?: string;
}

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, any>;
  components: {
    schemas: Record<string, any>;
  };
}

export interface OpenAPIGeneratorOptions {
  port?: string;
  productionUrl?: string;
}

/**
 * Service to generate OpenAPI 3.0 specification from project structure
 */
export class OpenAPIGenerator {
  private projectPath: string;
  private endpoints: OpenAPIEndpoint[] = [];
  private schemas: Record<string, any> = {};
  private validatorSchemaMap: Record<string, string> = {};
  private options: OpenAPIGeneratorOptions;

  constructor(projectPath: string, options: OpenAPIGeneratorOptions = {}) {
    this.projectPath = projectPath;
    this.options = options;
  }

  /**
   * Generate complete OpenAPI specification
   */
  async generate(): Promise<OpenAPISpec> {
    // Scan project structure
    await this.scanValidators();
    await this.scanRoutes();

    // Build OpenAPI spec
    return this.buildOpenAPISpec();
  }

  /**
   * Scan routes directory to find all endpoints
   */
  private async scanRoutes(): Promise<void> {
    const apiPath = path.join(this.projectPath, "src", "api");

    if (!this.directoryExists(apiPath)) {
      return;
    }

    const resources = readdirSync(apiPath);

    for (const resource of resources) {
      const resourcePath = path.join(apiPath, resource);
      const stat = statSync(resourcePath);

      if (stat.isDirectory()) {
        await this.scanResourceRoutes(resource, resourcePath);
      }
    }
  }

  /**
   * Scan a specific resource directory for routes
   */
  private async scanResourceRoutes(
    resourceName: string,
    resourcePath: string,
  ): Promise<void> {
    const routesFile = path.join(resourcePath, `${resourceName}.routes.ts`);

    if (!this.fileExists(routesFile)) {
      return;
    }

    const content = readFileSync(routesFile, "utf-8");

    // Extract endpoints from routes file
    const routePatterns = [
      {
        regex:
          /router\.get\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([\s\S]*?)\);/g,
        method: "get",
      },
      {
        regex:
          /router\.post\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([\s\S]*?)\);/g,
        method: "post",
      },
      {
        regex:
          /router\.put\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([\s\S]*?)\);/g,
        method: "put",
      },
      {
        regex:
          /router\.patch\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([\s\S]*?)\);/g,
        method: "patch",
      },
      {
        regex:
          /router\.delete\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([\s\S]*?)\);/g,
        method: "delete",
      },
    ];

    for (const { regex, method } of routePatterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const routePath = match[1];
        const handlerArgs = match[2] || "";
        const handlerName = this.extractHandlerName(handlerArgs);
        const fullPath = `/api/${resourceName}${routePath === "/" ? "" : routePath}`;

        this.endpoints.push({
          path: fullPath,
          method: method.toUpperCase(),
          summary: this.generateSummary(method, resourceName, routePath),
          tags: [resourceName],
          handlerName,
          ...this.extractEndpointDetails(
            content,
            resourcePath,
            resourceName,
            routePath,
            handlerName,
            match.index,
            method,
          ),
        });
      }
    }
  }

  /**
   * Extract endpoint details from surrounding code
   */
  private extractEndpointDetails(
    routesContent: string,
    resourcePath: string,
    resourceName: string,
    routePath: string,
    handlerName: string | undefined,
    matchIndex: number,
    method: string,
  ): Partial<OpenAPIEndpoint> {
    const result: Partial<OpenAPIEndpoint> = {};

    // Extract JSDoc comment above route
    const commentBlock = this.extractRouteCommentBlock(routesContent, matchIndex);
    const annotations = this.parseRouteAnnotations(commentBlock);

    if (annotations.desc) {
      result.description = annotations.desc;
    }

    if (annotations.desc) {
      result.summary = annotations.desc;
    }

    const parameters: any[] = [];

    // Path parameters from route path
    const pathParams = routePath.match(/:(\w+)/g) ?? [];
    for (const rawParam of pathParams) {
      const paramName = rawParam.slice(1);
      parameters.push({
        name: paramName,
        in: "path",
        required: true,
        schema: { type: "string" },
        description: `${this.capitalize(paramName)} identifier`,
      });
    }

    // Infer validation sources from handler implementation
    const handlerValidation = handlerName
      ? this.extractHandlerValidation(resourcePath, resourceName, handlerName)
      : null;

    if (handlerValidation?.paramsValidator) {
      const schemaName = this.validatorSchemaMap[handlerValidation.paramsValidator];
      parameters.push(...this.schemaToParameters(schemaName, "path", true));
    }

    if (handlerValidation?.queryValidator) {
      const schemaName = this.validatorSchemaMap[handlerValidation.queryValidator];
      parameters.push(...this.schemaToParameters(schemaName, "query", false));
    }

    if (annotations.queryFields.length > 0) {
      for (const field of annotations.queryFields) {
        if (!parameters.some((param) => param.name === field && param.in === "query")) {
          parameters.push({
            name: field,
            in: "query",
            required: false,
            schema: { type: "string" },
          });
        }
      }
    }

    if (annotations.paramsFields.length > 0) {
      for (const field of annotations.paramsFields) {
        if (!parameters.some((param) => param.name === field && param.in === "path")) {
          parameters.push({
            name: field,
            in: "path",
            required: true,
            schema: { type: "string" },
          });
        }
      }
    }

    if (parameters.length > 0) {
      result.parameters = this.deduplicateParameters(parameters);
    }

    // Request body from validator schema or @body annotation
    if (handlerValidation?.bodyValidator) {
      const schemaName = this.validatorSchemaMap[handlerValidation.bodyValidator];
      if (schemaName) {
        result.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${schemaName}`,
              },
            },
          },
        };
      }
    }

    if (!result.requestBody && annotations.bodyFields.length > 0) {
      result.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: Object.fromEntries(
                annotations.bodyFields.map((field) => [field, { type: "string" }]),
              ),
              required: annotations.bodyFields,
            },
          },
        },
      };
    }

    // Standard responses
    result.responses = this.generateResponses(method);

    return result;
  }

  /**
   * Scan validators directory to extract schemas
   */
  private async scanValidators(): Promise<void> {
    const apiPath = path.join(this.projectPath, "src", "api");

    if (!this.directoryExists(apiPath)) {
      return;
    }

    const resources = readdirSync(apiPath);

    for (const resource of resources) {
      const validatorFile = path.join(
        apiPath,
        resource,
        `${resource}.validator.ts`,
      );

      if (this.fileExists(validatorFile)) {
        await this.extractSchemaFromValidator(validatorFile);
      }
    }
  }

  /**
   * Extract schema from validator file
   */
  private async extractSchemaFromValidator(validatorPath: string): Promise<void> {
    const content = readFileSync(validatorPath, "utf-8");

    // Map validator functions to schema names
    const validatorFnPattern =
      /export\s+async\s+function\s+(validate\w+)\s*\([^)]*\)\s*:\s*Promise<[^>]*>\s*\{[\s\S]*?const\s+result\s*=\s*(\w+)\.safeParse\(/g;
    let validatorMatch;
    while ((validatorMatch = validatorFnPattern.exec(content)) !== null) {
      const validatorName = validatorMatch[1];
      const schemaName = validatorMatch[2];
      this.validatorSchemaMap[validatorName] = schemaName;
    }

    // Extract exported schema objects
    const objectSchemaPattern = /export\s+const\s+(\w+)\s*=\s*k\.object\s*\(\s*\{([\s\S]*?)\}\s*\);/g;
    let schemaMatch;
    while ((schemaMatch = objectSchemaPattern.exec(content)) !== null) {
      const schemaName = schemaMatch[1];
      const schemaBody = schemaMatch[2];
      const properties: Record<string, any> = {};
      const required: string[] = [];

      const fieldPattern = /^\s*(\w+)\s*:\s*([^,\n]+(?:\([^\)]*\))?(?:\.[^,\n]+)*)\s*,?$/gm;
      let fieldMatch;
      while ((fieldMatch = fieldPattern.exec(schemaBody)) !== null) {
        const fieldName = fieldMatch[1];
        const expression = fieldMatch[2].trim();
        const mappedSchema = this.mapKataxExpressionToOpenAPI(expression);
        properties[fieldName] = mappedSchema;

        if (!expression.includes(".optional()")) {
          required.push(fieldName);
        }
      }

      this.schemas[schemaName] = {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
  }

  /**
   * Map katax expression chains (k.string().email().optional()) to OpenAPI schema
   */
  private mapKataxExpressionToOpenAPI(expression: string): any {
    const normalized = expression.replace(/\s+/g, "");
    const result: Record<string, any> = { type: "string" };

    if (normalized.includes("k.number(")) {
      result.type = "number";
    } else if (normalized.includes("k.boolean(")) {
      result.type = "boolean";
    } else if (normalized.includes("k.array(")) {
      result.type = "array";
      result.items = { type: "string" };
    } else if (normalized.includes("k.object(")) {
      result.type = "object";
    } else if (normalized.includes("k.date(")) {
      result.type = "string";
      result.format = "date-time";
    } else {
      result.type = "string";
    }

    // Extract additional constraints
    if (normalized.includes(".email()")) {
      result.format = "email";
    }
    if (normalized.includes(".uuid()")) {
      result.format = "uuid";
    }
    if (normalized.includes(".min(")) {
      const minMatch = normalized.match(/\.min\((\d+)\)/);
      if (minMatch) {
        result.minimum = parseInt(minMatch[1]);
      }
    }
    if (normalized.includes(".max(")) {
      const maxMatch = normalized.match(/\.max\((\d+)\)/);
      if (maxMatch) {
        result.maximum = parseInt(maxMatch[1]);
      }
    }
    if (normalized.includes(".minLength(")) {
      const minLengthMatch = normalized.match(/\.minLength\((\d+)\)/);
      if (minLengthMatch) {
        result.minLength = parseInt(minLengthMatch[1]);
      }
    }
    if (normalized.includes(".maxLength(")) {
      const maxLengthMatch = normalized.match(/\.maxLength\((\d+)\)/);
      if (maxLengthMatch) {
        result.maxLength = parseInt(maxLengthMatch[1]);
      }
    }

    return result;
  }

  private extractHandlerName(handlerArgs: string): string | undefined {
    const tokens = handlerArgs.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    const candidate = [...tokens].reverse().find((token) => /Handler$/.test(token));
    return candidate;
  }

  private extractRouteCommentBlock(content: string, matchIndex: number): string {
    const beforeRoute = content.substring(0, matchIndex);
    const commentStart = beforeRoute.lastIndexOf("/**");
    const commentEnd = beforeRoute.lastIndexOf("*/");

    if (commentStart === -1 || commentEnd === -1 || commentEnd < commentStart) {
      return "";
    }

    const between = beforeRoute.slice(commentEnd + 2).trim();
    if (between.length > 0 && between.split("\n").length > 2) {
      return "";
    }

    return beforeRoute.slice(commentStart, commentEnd + 2);
  }

  private parseRouteAnnotations(commentBlock: string): {
    desc?: string;
    bodyFields: string[];
    queryFields: string[];
    paramsFields: string[];
  } {
    const descMatch = commentBlock.match(/@desc\s+([^\n\r*]+)/i);

    return {
      desc: descMatch?.[1]?.trim(),
      bodyFields: this.extractAnnotationFields(commentBlock, "body"),
      queryFields: this.extractAnnotationFields(commentBlock, "query"),
      paramsFields: this.extractAnnotationFields(commentBlock, "params"),
    };
  }

  private extractAnnotationFields(commentBlock: string, tag: string): string[] {
    const regex = new RegExp(`@${tag}\\s*\\{([^}]*)\\}`, "i");
    const match = commentBlock.match(regex);
    if (!match?.[1]) {
      return [];
    }

    return match[1]
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  private extractHandlerValidation(
    resourcePath: string,
    resourceName: string,
    handlerName: string,
  ): {
    bodyValidator?: string;
    queryValidator?: string;
    paramsValidator?: string;
  } | null {
    const handlerPath = path.join(resourcePath, `${resourceName}.handler.ts`);
    if (!this.fileExists(handlerPath)) {
      return null;
    }

    const content = readFileSync(handlerPath, "utf-8");
    const functionStart = content.indexOf(`function ${handlerName}`);
    if (functionStart === -1) {
      return null;
    }

    const nextFunctionStart = content.indexOf("export async function", functionStart + 1);
    const functionBlock =
      nextFunctionStart === -1
        ? content.slice(functionStart)
        : content.slice(functionStart, nextFunctionStart);

    const validationPattern = /(validate\w+)\s*\(\s*req\.(body|query|params)\s*\)/g;
    const result: {
      bodyValidator?: string;
      queryValidator?: string;
      paramsValidator?: string;
    } = {};

    let match;
    while ((match = validationPattern.exec(functionBlock)) !== null) {
      const validatorFn = match[1];
      const source = match[2];

      if (source === "body") {
        result.bodyValidator = validatorFn;
      } else if (source === "query") {
        result.queryValidator = validatorFn;
      } else if (source === "params") {
        result.paramsValidator = validatorFn;
      }
    }

    return result;
  }

  private schemaToParameters(
    schemaName: string | undefined,
    location: "path" | "query",
    requiredByDefault: boolean,
  ): any[] {
    if (!schemaName) {
      return [];
    }

    const schema = this.schemas[schemaName];
    if (!schema?.properties) {
      return [];
    }

    const requiredList: string[] = schema.required ?? [];

    return Object.entries(schema.properties).map(([name, propertySchema]: [string, any]) => ({
      name,
      in: location,
      required: location === "path" ? true : requiredByDefault || requiredList.includes(name),
      schema: propertySchema?.type
        ? propertySchema
        : {
            type: "string",
          },
    }));
  }

  private deduplicateParameters(parameters: any[]): any[] {
    const unique = new Map<string, any>();
    for (const parameter of parameters) {
      unique.set(`${parameter.in}:${parameter.name}`, parameter);
    }
    return Array.from(unique.values());
  }

  /**
   * Build complete OpenAPI specification
   */
  private buildOpenAPISpec(): OpenAPISpec {
    const paths: Record<string, any> = {};

    // Group endpoints by path
    for (const endpoint of this.endpoints) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }

      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        tags: endpoint.tags,
        summary: endpoint.summary,
        description: endpoint.description,
        parameters: endpoint.parameters,
        requestBody: endpoint.requestBody,
        responses: endpoint.responses,
      };
    }

    const port = this.options.port || "3000";
    const productionUrl = this.options.productionUrl;

    const servers: Array<{ url: string; description: string }> = [
      {
        url: `http://localhost:${port}`,
        description: "Development server",
      },
    ];

    if (productionUrl) {
      servers.push({
        url: productionUrl,
        description: "Production server",
      });
    }

    return {
      openapi: "3.0.0",
      info: {
        title: "API Documentation",
        version: "1.0.0",
        description: "Auto-generated API documentation by Katax CLI",
      },
      servers,
      paths,
      components: {
        schemas: this.schemas,
      },
    };
  }

  /**
   * Generate responses for a method
   */
  private generateResponses(method: string): any {
    const baseResponses = {
      "400": {
        description: "Bad Request - Invalid input",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean", example: false },
                message: { type: "string" },
                errors: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      "500": {
        description: "Internal Server Error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean", example: false },
                message: { type: "string", example: "Internal server error" },
              },
            },
          },
        },
      },
    };

    switch (method.toLowerCase()) {
      case "post":
        return {
          "201": {
            description: "Created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          ...baseResponses,
        };
      case "delete":
        return {
          "200": {
            description: "Deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "404": {
            description: "Resource not found",
          },
          ...baseResponses,
        };
      default:
        return {
          "200": {
            description: "Successful operation",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          ...baseResponses,
        };
    }
  }

  /**
   * Generate summary from method and resource
   */
  private generateSummary(
    method: string,
    resource: string,
    path: string,
  ): string {
    const hasId = path.includes(":id");

    switch (method.toLowerCase()) {
      case "get":
        return hasId ? `Get ${resource} by ID` : `Get all ${resource}`;
      case "post":
        return `Create new ${resource}`;
      case "put":
      case "patch":
        return `Update ${resource}`;
      case "delete":
        return `Delete ${resource}`;
      default:
        return `${method.toUpperCase()} ${resource}`;
    }
  }

  // Helper methods
  private directoryExists(dir: string): boolean {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }

  private fileExists(file: string): boolean {
    try {
      return statSync(file).isFile();
    } catch {
      return false;
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
