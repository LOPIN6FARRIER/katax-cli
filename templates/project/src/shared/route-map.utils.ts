/**
 * Walks the live Express router tree and returns every endpoint with its
 * full path, its handlers and whether requireAuth protects it.
 *
 * Used by startup-routes.utils.ts (prints the endpoint map at boot) and by
 * openapi.utils.ts (builds the OpenAPI document). Nothing to update when a
 * resource is added: new routers show up automatically on the next boot.
 *
 * Express 4 never stores the literal mount path of `router.use(path, sub)` -
 * only the compiled regexp + param keys - so decompileLayerPath() reverses
 * the regexp back into a template ("/habits/:habitId/reminders").
 */
import type { Application, RequestHandler } from 'express';

interface ExpressLayer {
  name?: string;
  handle?: RequestHandler & { stack?: ExpressLayer[] };
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: RequestHandler }>;
  };
  regexp: RegExp & { fast_slash?: boolean };
  keys?: Array<{ name: string | number }>;
}

export interface DiscoveredEndpoint {
  method: string;
  /** Express-style path: /api/habits/:id */
  path: string;
  /** Route-level handlers in order (docs() metadata, limiters, the handler). */
  handlers: RequestHandler[];
  /** true when a requireAuth layer runs before this route. */
  requiresAuth: boolean;
}

/** Name of the auth middleware function; routers mounted after it are private. */
const AUTH_MIDDLEWARE_NAMES = new Set(['requireAuth']);

function decompileLayerPath(layer: ExpressLayer): string {
  if (layer.regexp.fast_slash) return '';

  const keys = layer.keys ?? [];
  let source = layer.regexp.source;

  source = source.replace(/^\^/, '');
  source = source.replace(/\\\/\?\(\?=\\\/\|\$\)$/, '');
  source = source.replace(/\(\?=\\\/\|\$\)$/, '');

  let keyIndex = 0;
  source = source.replace(/\(\[\^\/\]\+\?\)/g, () => {
    const key = keys[keyIndex++];
    return key ? `:${key.name}` : '';
  });

  source = source.replace(/\(\?:/g, '(').replace(/[()]/g, '');
  source = source.replace(/\\\//g, '/');
  return source;
}

function walk(stack: ExpressLayer[], prefix: string, secured: boolean, out: DiscoveredEndpoint[]): void {
  let requiresAuth = secured;
  for (const layer of stack) {
    if (layer.route) {
      const path = prefix + (layer.route.path === '/' ? '' : layer.route.path);
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push({
          method: method.toUpperCase(),
          path: path || '/',
          handlers: layer.route.stack.map((s) => s.handle),
          requiresAuth
        });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      walk(layer.handle.stack, prefix + decompileLayerPath(layer), requiresAuth, out);
    } else if (layer.name && AUTH_MIDDLEWARE_NAMES.has(layer.name)) {
      requiresAuth = true;
    }
  }
}

export function listEndpoints(app: Application): DiscoveredEndpoint[] {
  const out: DiscoveredEndpoint[] = [];
  const router = (app as unknown as { _router?: { stack: ExpressLayer[] } })._router;
  if (router?.stack) walk(router.stack, '', false, out);
  return out;
}

/** "/api/habits/:habitId/reminders" -> "habits"; "/health" -> "health". */
export function domainOf(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  return segments[apiIndex + 1] ?? segments[0] ?? '/';
}
