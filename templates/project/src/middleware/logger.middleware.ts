import type { Request, Response, NextFunction } from 'express';
import { katax } from 'katax-service-manager';

/** Logs every request when the response finishes (method, full path, status, duration). */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  // originalUrl, not url: nested routers rewrite req.url to their own relative path.
  const path = req.originalUrl || req.url;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    katax.logger.info({
      message: `${req.method} ${path} - ${res.statusCode} (${duration}ms)`,
      method: req.method,
      url: path,
      statusCode: res.statusCode,
      duration
    });
  });

  next();
}
