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
    await this.scanRoutes();
    await this.scanValidators();

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
      { regex: /router\.get\s*\(\s*['"`]([^'"`]+)['"`]/g, method: "get" },
      { regex: /router\.post\s*\(\s*['"`]([^'"`]+)['"`]/g, method: "post" },
      { regex: /router\.put\s*\(\s*['"`]([^'"`]+)['"`]/g, method: "put" },
      { regex: /router\.patch\s*\(\s*['"`]([^'"`]+)['"`]/g, method: "patch" },
      { regex: /router\.delete\s*\(\s*['"`]([^'"`]+)['"`]/g, method: "delete" },
    ];

    for (const { regex, method } of routePatterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const routePath = match[1];
        const fullPath = `/api/${resourceName}${routePath === "/" ? "" : routePath}`;

        this.endpoints.push({
          path: fullPath,
          method: method.toUpperCase(),
          summary: this.generateSummary(method, resourceName, routePath),
          tags: [resourceName],
          ...this.extractEndpointDetails(
            content,
            match.index,
            method,
            resourceName,
          ),
        });
      }
    }
  }

  /**
   * Extract endpoint details from surrounding code
   */
  private extractEndpointDetails(
    content: string,
    matchIndex: number,
    method: string,
    resource: string,
  ): Partial<OpenAPIEndpoint> {
    const result: Partial<OpenAPIEndpoint> = {};

    // Extract comments above the route
    const beforeRoute = content.substring(
      Math.max(0, matchIndex - 200),
      matchIndex,
    );
    const commentMatch = beforeRoute.match(/\/\*\*[\s\S]*?\*\/|\/\/.*$/m);
    if (commentMatch) {
      result.description = commentMatch[0]
        .replace(/\/\*\*|\*\/|\/\/|\*/g, "")
        .trim();
    }

    // Detect if route has validation
    const afterRoute = content.substring(matchIndex, matchIndex + 300);
    const hasValidation = afterRoute.includes("validate(");

    if (hasValidation) {
      const validatorMatch = afterRoute.match(/validate\s*\(\s*(\w+)Validator/);
      if (validatorMatch) {
        const validatorName = validatorMatch[1];
        result.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${this.capitalize(validatorName)}`,
              },
            },
          },
        };
      }
    }

    // Detect route parameters
    const pathMatch = content
      .substring(matchIndex, matchIndex + 100)
      .match(/['"`]([^'"`]*:(\w+)[^'"`]*)['"`]/);
    if (pathMatch) {
      const params = pathMatch[0].match(/:(\w+)/g);
      if (params) {
        result.parameters = params.map((p) => ({
          name: p.substring(1),
          in: "path",
          required: true,
          schema: { type: "string" },
          description: `${this.capitalize(p.substring(1))} identifier`,
        }));
      }
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
        await this.extractSchemaFromValidator(resource, validatorFile);
      }
    }
  }

  /**
   * Extract schema from validator file
   */
  private async extractSchemaFromValidator(
    resource: string,
    validatorPath: string,
  ): Promise<void> {
    const content = readFileSync(validatorPath, "utf-8");

    // Extract katax-core schema definitions
    const schemaPattern =
      /(\w+):\s*k\.(string|number|boolean|object|array)\([^)]*\)/g;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    let match;
    while ((match = schemaPattern.exec(content)) !== null) {
      const [, fieldName, fieldType] = match;

      // Check if field is required (not optional)
      const fieldContext = content.substring(
        match.index,
        content.indexOf("\n", match.index),
      );
      const isOptional = fieldContext.includes(".optional()");

      if (!isOptional) {
        required.push(fieldName);
      }

      properties[fieldName] = this.mapKataxTypeToOpenAPI(
        fieldType,
        fieldContext,
      );
    }

    if (Object.keys(properties).length > 0) {
      this.schemas[this.capitalize(resource)] = {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }
  }

  /**
   * Map katax-core types to OpenAPI types
   */
  private mapKataxTypeToOpenAPI(kataxType: string, context: string): any {
    const baseMapping: Record<string, any> = {
      string: { type: "string" },
      number: { type: "number" },
      boolean: { type: "boolean" },
      object: { type: "object" },
      array: { type: "array", items: { type: "string" } },
    };

    const result = { ...(baseMapping[kataxType] || { type: "string" }) };

    // Extract additional constraints
    if (context.includes(".email()")) {
      result.format = "email";
    }
    if (context.includes(".uuid()")) {
      result.format = "uuid";
    }
    if (context.includes(".min(")) {
      const minMatch = context.match(/\.min\((\d+)\)/);
      if (minMatch) {
        result.minimum = parseInt(minMatch[1]);
      }
    }
    if (context.includes(".max(")) {
      const maxMatch = context.match(/\.max\((\d+)\)/);
      if (maxMatch) {
        result.maximum = parseInt(maxMatch[1]);
      }
    }

    return result;
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
