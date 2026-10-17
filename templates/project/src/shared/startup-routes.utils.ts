/**
 * Prints the endpoint map (grouped by domain, colored by method) once the
 * server is listening. Call it from index.ts after app.listen().
 * Private routes (behind requireAuth) are marked with a lock.
 */
import type { Application } from 'express';
import { domainOf, listEndpoints } from './route-map.utils.js';

// ANSI 256-color codes, one per method - readable on light and dark terminals.
const METHOD_COLOR: Record<string, string> = {
  GET: '\x1b[38;5;42m',
  POST: '\x1b[38;5;220m',
  PATCH: '\x1b[38;5;39m',
  PUT: '\x1b[38;5;213m',
  DELETE: '\x1b[38;5;203m'
};
const DEFAULT_METHOD_COLOR = '\x1b[38;5;250m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const DOMAIN_COLOR = '\x1b[38;5;177m';

export function printStartupRoutes(app: Application, title: string, baseUrl: string): void {
  const domains = new Map<string, Array<{ method: string; path: string; requiresAuth: boolean }>>();
  for (const endpoint of listEndpoints(app)) {
    const domain = domainOf(endpoint.path);
    const bucket = domains.get(domain) ?? [];
    bucket.push(endpoint);
    domains.set(domain, bucket);
  }

  const lines: string[] = ['', `${BOLD}${title} - endpoint map${RESET} ${DIM}(${baseUrl})${RESET}`];
  for (const [domain, routes] of [...domains.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`\n${DOMAIN_COLOR}${BOLD}${domain}${RESET}`);
    for (const { method, path, requiresAuth } of routes.sort((a, b) => a.path.localeCompare(b.path))) {
      const color = METHOD_COLOR[method] ?? DEFAULT_METHOD_COLOR;
      lines.push(`  ${color}${method.padEnd(7, ' ')}${RESET} ${path}${requiresAuth ? ` ${DIM}🔒${RESET}` : ''}`);
    }
  }
  lines.push('');
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}
