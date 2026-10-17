import type { Request, Response, NextFunction } from 'express';
import { katax } from 'katax-service-manager';
import { ERROR_CODES, defaultMessageFor, internalErrorBody, isAppError, toPublicError } from '../shared/errors.utils.js';

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

/** 404 for unknown /api routes, in the public error contract. Mount after the /api router. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: defaultMessageFor(404),
    error: ERROR_CODES.ROUTE_NOT_FOUND
  });
}

/**
 * Last-resort error handler (mount last in app.ts). Handlers that use
 * sendResponse() never reach it; it catches body-parser errors, CORS
 * rejections, thrown AppErrors and anything unexpected. The real cause is
 * logged, the client gets the public error contract.
 */
export function errorMiddleware(err: HttpError, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: "The request body isn't valid JSON.", error: ERROR_CODES.INVALID_JSON });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: defaultMessageFor(413), error: ERROR_CODES.PAYLOAD_TOO_LARGE });
    return;
  }
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({ success: false, message: defaultMessageFor(403), error: ERROR_CODES.FORBIDDEN });
    return;
  }
  if (isAppError(err)) {
    const { status, body } = toPublicError({ message: err.message, error: err.code, statusCode: err.statusCode });
    res.status(status).json(body);
    return;
  }

  katax.logger.error({ err, method: req.method, path: req.originalUrl, message: 'Unhandled error' });
  res.status(500).json(internalErrorBody());
}
