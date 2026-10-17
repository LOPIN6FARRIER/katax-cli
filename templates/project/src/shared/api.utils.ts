import type { Request, Response, CookieOptions } from 'express';
import type { Schema } from 'katax-core';
import { validateSchema as coreValidateSchema } from 'katax-core';
import { katax } from 'katax-service-manager';
import {
  ERROR_CODES,
  GENERIC_ERROR_MESSAGE,
  VALIDATOR_FAILURE,
  internalErrorBody,
  isAppError,
  sanitizeValidationErrors,
  toPublicError,
  validationErrorBody
} from './errors.utils.js';
import type { FieldError } from './errors.utils.js';

// ==================== TYPES ====================

export interface ResponseCookie {
  name: string;
  value: string;
  options?: CookieOptions;
}

export interface PaginationMeta {
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  totalCount?: number;
  hasMorePages?: boolean;
}

/** What every controller returns. Controllers never touch req/res. */
export interface ControllerResult<T = unknown> extends PaginationMeta {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  details?: unknown;
  statusCode?: number;
  /** Cookies to set (or clear, with maxAge: 0) - applied by sendResponse(). */
  cookies?: ResponseCookie[];
}

export type ValidationError = FieldError;

export interface ValidationResult<T = unknown> {
  isValid: boolean;
  data?: T;
  errors?: ValidationError[];
  /** Validation could not run (DB down, validator threw) -> respond 500, not 422. */
  internalError?: boolean;
}

export interface SendResponseOptions<TValidation, TResponse> {
  /** Runs after a successful controller call, before the response is written. */
  onSuccess?: (params: {
    req: Request;
    res: Response;
    validData: TValidation;
    controllerResult: ControllerResult<TResponse>;
  }) => void | Promise<void>;
}

// ==================== RESULT BUILDERS ====================

export const createResponse = {
  success<T>(message: string, data?: T, statusCode = 200, pagination?: PaginationMeta): ControllerResult<T> {
    return { success: true, message, statusCode, ...(pagination ?? {}), data };
  },

  error(message: string, error = 'Request error', statusCode = 400, details?: unknown): ControllerResult<never> {
    return { success: false, message, error, statusCode, details };
  },

  unauthorized(message = 'Unauthorized', error: string = ERROR_CODES.UNAUTHORIZED): ControllerResult<never> {
    return { success: false, message, error, statusCode: 401 };
  },

  forbidden(message = 'Forbidden', error: string = ERROR_CODES.FORBIDDEN): ControllerResult<never> {
    return { success: false, message, error, statusCode: 403 };
  },

  notFound(resource = 'Resource'): ControllerResult<never> {
    return { success: false, message: `${resource} not found`, error: ERROR_CODES.NOT_FOUND, statusCode: 404 };
  },

  validation(errors: ValidationError[] = [], message?: string): ControllerResult<never> {
    const body = validationErrorBody(errors);
    return {
      success: false,
      message: message ?? body.message,
      error: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 422,
      details: body.details
    };
  },

  custom<T>(result: ControllerResult<T>): ControllerResult<T> {
    return result;
  }
};

/**
 * Turns any thrown error into a result that is safe to send:
 * - AppError (expected: not found, conflict...) -> its message/code/status.
 * - Anything else (pg error, bug) -> logged with full stack, client gets a generic 500.
 * Use it in every controller `catch`.
 */
export function toSafeErrorResult(error: unknown, logContext: Record<string, unknown> = {}): ControllerResult<never> {
  if (isAppError(error)) {
    return createResponse.error(error.message, error.code, error.statusCode);
  }
  katax.logger.error({ err: error, ...logContext, message: 'Unhandled error' });
  return createResponse.error(GENERIC_ERROR_MESSAGE, ERROR_CODES.INTERNAL_ERROR, 500);
}

// ==================== VALIDATION ====================

/**
 * Validates `data` with a katax-core schema. katax-core picks safeParse or
 * safeParseAsync (also for async rules nested inside objects/arrays).
 * - Issues -> 422 with friendly per-field messages.
 * - The validator itself failed (threw, or returned VALIDATOR_FAILURE) -> internalError (500).
 */
export async function validateSchema<T>(schema: Schema<T>, data: unknown): Promise<ValidationResult<T>> {
  let result: Awaited<ReturnType<typeof coreValidateSchema<T>>>;
  try {
    result = await coreValidateSchema(schema, data);
  } catch (error) {
    katax.logger.error({ err: error, message: 'Unexpected error while validating request' });
    return { isValid: false, internalError: true, errors: [] };
  }

  if (!result.success) {
    const issues = result.issues ?? [];
    if (issues.some((issue) => issue.message === VALIDATOR_FAILURE)) {
      return { isValid: false, internalError: true, errors: [] };
    }
    return {
      isValid: false,
      errors: sanitizeValidationErrors(
        issues.map((issue) => ({
          field: Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') : 'root',
          message: issue.message
        }))
      )
    };
  }

  return { isValid: true, data: result.data };
}

/**
 * Runs two validators in order (e.g. URL params, then body) and combines
 * their data. The second one only runs when the first passes.
 */
export async function validateComposed<TFirst, TSecond, TResult>(
  firstValidator: () => Promise<ValidationResult<TFirst>>,
  secondValidator: (firstData: TFirst) => Promise<ValidationResult<TSecond>>,
  compose: (firstData: TFirst, secondData: TSecond) => TResult
): Promise<ValidationResult<TResult>> {
  const first = await firstValidator();
  if (!first.isValid || first.data === undefined) {
    return { isValid: false, errors: first.errors, internalError: first.internalError };
  }
  const second = await secondValidator(first.data);
  if (!second.isValid || second.data === undefined) {
    return { isValid: false, errors: second.errors, internalError: second.internalError };
  }
  return { isValid: true, data: compose(first.data, second.data) };
}

// ==================== RESPONSES ====================

function requestPath(req: Request): string {
  return req.originalUrl ?? req.path;
}

/** Writes the public error envelope for a failed validation (422, or 500 if the validator broke). */
export function sendValidationFailure(req: Request, res: Response, validation: ValidationResult<unknown>): void {
  if (validation.internalError) {
    res.status(500).json(internalErrorBody());
    return;
  }
  katax.logger.warn({ method: req.method, path: requestPath(req), errors: validation.errors, message: 'Validation failed' });
  res.status(422).json(validationErrorBody(validation.errors ?? []));
}

/** Writes a failed ControllerResult as the public error envelope (friendly message + stable code). */
export function sendFailure(req: Request, res: Response, result: ControllerResult<unknown>): void {
  const { status, body } = toPublicError(result);
  const log = {
    method: req.method,
    path: requestPath(req),
    statusCode: status,
    controllerMessage: result.message,
    controllerError: result.error
  };
  if (status >= 500) katax.logger.error({ ...log, message: 'Request failed with server error' });
  else katax.logger.info({ ...log, message: 'Request rejected' });
  res.status(status).json(body);
}

function applyCookies(res: Response, cookies: ResponseCookie[] | undefined): void {
  for (const cookie of cookies ?? []) {
    if (cookie.options) res.cookie(cookie.name, cookie.value, cookie.options);
    else res.cookie(cookie.name, cookie.value);
  }
}

/**
 * The only way handlers answer: validate -> controller -> HTTP response.
 * Failures go through the public error contract; unexpected exceptions become
 * a generic 500 (the real cause is logged).
 */
export async function sendResponse<TValidation, TResponse = unknown>(
  req: Request,
  res: Response,
  validator: () => Promise<ValidationResult<TValidation>>,
  controller: (validData: TValidation) => Promise<ControllerResult<TResponse>>,
  options?: SendResponseOptions<TValidation, TResponse>
): Promise<void> {
  try {
    const validation = await validator();
    if (!validation.isValid) {
      sendValidationFailure(req, res, validation);
      return;
    }

    const result = await controller(validation.data as TValidation);
    applyCookies(res, result.cookies);

    if (!result.success) {
      sendFailure(req, res, result as ControllerResult<unknown>);
      return;
    }

    await options?.onSuccess?.({ req, res, validData: validation.data as TValidation, controllerResult: result });

    const statusCode = result.statusCode && result.statusCode < 400 ? result.statusCode : 200;
    if (statusCode === 204) {
      res.status(204).end();
      return;
    }

    const body: { success: true; message: string; data?: TResponse } & PaginationMeta = {
      success: true,
      message: result.message
    };
    if (result.currentPage !== undefined) body.currentPage = result.currentPage;
    if (result.totalPages !== undefined) body.totalPages = result.totalPages;
    if (result.totalItems !== undefined) body.totalItems = result.totalItems;
    if (result.totalCount !== undefined) body.totalCount = result.totalCount;
    if (result.hasMorePages !== undefined) body.hasMorePages = result.hasMorePages;
    if (result.data !== undefined) body.data = result.data;

    res.status(statusCode).json(body);
  } catch (error) {
    katax.logger.error({ err: error, method: req.method, path: requestPath(req), message: 'Unhandled error in request pipeline' });
    if (!res.headersSent) res.status(500).json(internalErrorBody());
  }
}

// ==================== COOKIES (outside the controller-result flow) ====================

export function setCookie(res: Response, name: string, value: string, options?: CookieOptions): void {
  if (options) res.cookie(name, value, options);
  else res.cookie(name, value);
}

/** Options must match the ones used to set the cookie, or the browser keeps it. */
export function clearCookie(res: Response, name: string, options?: CookieOptions): void {
  res.clearCookie(name, options);
}
