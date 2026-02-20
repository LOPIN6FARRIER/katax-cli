import { katax } from "../config/katax.instance.js";

/**
 * Lazy logger proxy - forwards calls to katax.logger after init()
 * This allows importing { logger } without causing errors before init()
 */
export const logger = new Proxy({} as typeof katax.logger, {
  get(_, prop: string) {
    return (katax.logger as any)[prop];
  },
});

/**
 * Log HTTP request
 */
export function logRequest(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
): void {
  katax.logger.info({
    message: `${method} ${url} - ${statusCode} (${duration}ms)`,
    method,
    url,
    statusCode,
    duration: `${duration}ms`,
  });
}

/**
 * Log error with context
 */
export function logError(error: Error, context?: Record<string, any>): void {
  katax.logger.error({
    message: error.message,
    err: error,
    ...context,
  });
}

/**
 * Log info message
 */
export function logInfo(message: string, data?: Record<string, any>): void {
  katax.logger.info({ message, ...data });
}

/**
 * Log warning message
 */
export function logWarning(message: string, data?: Record<string, any>): void {
  katax.logger.warn({ message, ...data });
}

/**
 * Log debug message
 */
export function logDebug(message: string, data?: Record<string, any>): void {
  katax.logger.debug({ message, ...data });
}
