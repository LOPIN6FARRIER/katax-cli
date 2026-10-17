/**
 * OpenAPI 3.1 built at runtime from the real routes and the katax-core
 * validators (schema.toJsonSchema() - JSON Schema draft 2020-12).
 *
 * Each route declares its docs next to the handler with docs():
 *
 *   router.get('/', docs({ summary: 'List habits', query: listHabitsQuerySchema }), listHabitsHandler);
 *
 * docs() is a no-op middleware carrying metadata. At boot the router tree is
 * walked (route-map.utils.ts), so the document always matches the code: no
 * generation step, no openapi.json to copy into dist/.
 */
import type { Application, Request, RequestHandler, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { domainOf, listEndpoints } from './route-map.utils.js';

interface JsonSchemaSource {
  toJsonSchema(): unknown;
}

type JsonSchema = Record<string, unknown> & {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
};

export interface RouteDoc {
  summary: string;
  description?: string;
  /** Defaults to the resource segment after /api. */
  tags?: string[];
  /** URL params schema (e.g. the `:id` validator). */
  params?: JsonSchemaSource;
  /** Query string schema. */
  query?: JsonSchemaSource;
  /** JSON body schema. */
  body?: JsonSchemaSource;
  /** Schema of `data` in the success envelope (katax schema or plain JSON Schema). */
  response?: JsonSchemaSource | JsonSchema;
  /** Success status code (default 200, 201 for POST). */
  status?: number;
  deprecated?: boolean;
}

const DOC_KEY = '__kataxRouteDoc';

type DocHandler = RequestHandler & { [DOC_KEY]?: RouteDoc };

/** Attaches OpenAPI metadata to a route. Does nothing at request time. */
export function docs(meta: RouteDoc): RequestHandler {
  const handler: DocHandler = (_req, _res, next) => next();
  handler[DOC_KEY] = meta;
  return handler;
}

function toSchema(source: JsonSchemaSource | JsonSchema | undefined): JsonSchema | undefined {
  if (!source) return undefined;
  if (typeof (source as JsonSchemaSource).toJsonSchema === 'function') {
    return (source as JsonSchemaSource).toJsonSchema() as JsonSchema;
  }
  return source as JsonSchema;
}

function toParameters(location: 'path' | 'query', schema: JsonSchema | undefined): Record<string, unknown>[] {
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, property]) => {
    const { description, ...propertySchema } = property;
    return {
      name,
      in: location,
      required: location === 'path' ? true : required.has(name),
      ...(typeof description === 'string' ? { description } : {}),
      schema: propertySchema
    };
  });
}

const ERROR_RESPONSE = { $ref: '#/components/responses/Error' };

export interface OpenApiOptions {
  title: string;
  version: string;
  description?: string;
  /** Public base URL (e.g. https://api.example.com). Defaults to the request's own origin. */
  serverUrl?: string;
  /** Only paths starting with this prefix are documented. Default '/api'. */
  pathPrefix?: string;
}

export function buildOpenApiDocument(app: Application, options: OpenApiOptions): Record<string, unknown> {
  const prefix = options.pathPrefix ?? '/api';
  const paths: Record<string, Record<string, unknown>> = {};

  for (const endpoint of listEndpoints(app)) {
    if (!endpoint.path.startsWith(prefix)) continue;
    const doc = endpoint.handlers.map((h) => (h as DocHandler)[DOC_KEY]).find(Boolean);

    const openApiPath = endpoint.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const pathParamNames = [...endpoint.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
    const method = endpoint.method.toLowerCase();

    const documentedParams = toParameters('path', toSchema(doc?.params));
    const documentedNames = new Set(documentedParams.map((p) => p.name));
    const parameters = [
      ...documentedParams.filter((p) => pathParamNames.includes(p.name as string)),
      ...pathParamNames
        .filter((name) => !documentedNames.has(name))
        .map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
      ...toParameters('query', toSchema(doc?.query))
    ];

    const status = String(doc?.status ?? (endpoint.method === 'POST' ? 201 : 200));
    const dataSchema = toSchema(doc?.response);
    const operation: Record<string, unknown> = {
      tags: doc?.tags ?? [domainOf(endpoint.path)],
      summary: doc?.summary ?? `${endpoint.method} ${endpoint.path}`,
      ...(doc?.description ? { description: doc.description } : {}),
      ...(doc?.deprecated ? { deprecated: true } : {}),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(doc?.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: toSchema(doc.body) } } } }
        : {}),
      ...(endpoint.requiresAuth ? { security: [{ bearerAuth: [] }] } : {}),
      responses: {
        [status]: {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['success', 'message'],
                properties: {
                  success: { const: true },
                  message: { type: 'string' },
                  ...(dataSchema ? { data: dataSchema } : {})
                }
              }
            }
          }
        },
        ...(doc?.body || doc?.query || doc?.params ? { '422': ERROR_RESPONSE } : {}),
        ...(endpoint.requiresAuth ? { '401': ERROR_RESPONSE } : {}),
        ...(pathParamNames.length > 0 ? { '404': ERROR_RESPONSE } : {}),
        '500': ERROR_RESPONSE
      }
    };

    paths[openApiPath] = { ...(paths[openApiPath] ?? {}), [method]: operation };
  }

  return {
    openapi: '3.1.0',
    info: { title: options.title, version: options.version, ...(options.description ? { description: options.description } : {}) },
    ...(options.serverUrl ? { servers: [{ url: options.serverUrl }] } : {}),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      responses: {
        Error: {
          description: 'Error (public error contract)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['success', 'message', 'error'],
                properties: {
                  success: { const: false },
                  message: { type: 'string', description: 'Friendly sentence, safe to show to users.' },
                  error: { type: 'string', description: 'Stable code: VALIDATION_ERROR, NOT_FOUND, UNAUTHORIZED...' },
                  details: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['field', 'message'],
                      properties: { field: { type: 'string' }, message: { type: 'string' } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Serves the document at /openapi.json and Swagger UI at /docs.
 * Call it in app.ts BEFORE the /api router; the document is built on the
 * first request (when every route is already registered) and cached.
 */
export function mountApiDocs(app: Application, options: OpenApiOptions): void {
  let cached: Record<string, unknown> | null = null;
  const getDocument = (): Record<string, unknown> => (cached ??= buildOpenApiDocument(app, options));

  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(getDocument());
  });
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: `${options.title} - API docs`,
      swaggerOptions: { url: '/openapi.json', persistAuthorization: true }
    })
  );
}
