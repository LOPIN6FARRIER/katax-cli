/**
 * Application error hierarchy with typed errors
 */

/**
 * Base application error with status code and error code
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly timestamp: Date;

  constructor(
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp.toISOString()
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string = 'Validation failed',
    public readonly fields?: Record<string, string[]>
  ) {
    super(message, { fields });
  }

  static fromFields(fields: Record<string, string[]>): ValidationError {
    return new ValidationError('Validation failed', fields);
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly code = 'AUTHENTICATION_ERROR';

  constructor(message: string = 'Authentication required') {
    super(message);
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  readonly statusCode = 403;
  readonly code = 'AUTHORIZATION_ERROR';

  constructor(
    message: string = 'Insufficient permissions',
    public readonly requiredRole?: string
  ) {
    super(message, { requiredRole });
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(
    message: string = 'Resource not found',
    public readonly resource?: string,
    public readonly id?: string | number
  ) {
    super(message, { resource, id });
  }

  static forResource(resource: string, id: string | number): NotFoundError {
    return new NotFoundError(
      `${resource} with id ${id} not found`,
      resource,
      id
    );
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(
    message: string = 'Resource conflict',
    public readonly field?: string
  ) {
    super(message, { field });
  }

  static duplicate(field: string, value: any): ConflictError {
    return new ConflictError(
      `${field} '${value}' already exists`,
      field
    );
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  readonly statusCode = 500;
  readonly code = 'DATABASE_ERROR';

  constructor(
    message: string = 'Database operation failed',
    public readonly operation?: string,
    public readonly originalError?: Error
  ) {
    super(message, { operation, originalError: originalError?.message });
  }

  static fromError(error: Error, operation?: string): DatabaseError {
    return new DatabaseError(
      `Database error: ${error.message}`,
      operation,
      error
    );
  }
}

/**
 * External service error (502/503)
 */
export class ExternalServiceError extends AppError {
  readonly statusCode = 503;
  readonly code = 'EXTERNAL_SERVICE_ERROR';

  constructor(
    message: string = 'External service unavailable',
    public readonly service?: string
  ) {
    super(message, { service });
  }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends AppError {
  readonly statusCode = 500;
  readonly code = 'INTERNAL_SERVER_ERROR';

  constructor(
    message: string = 'Internal server error',
    public readonly originalError?: Error
  ) {
    super(message, { originalError: originalError?.message });
  }

  static fromError(error: Error): InternalServerError {
    return new InternalServerError(error.message, error);
  }
}

/**
 * Bad request error (400)
 */
export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code = 'BAD_REQUEST';

  constructor(message: string = 'Bad request') {
    super(message);
  }
}

/**
 * Type guard to check if error is AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convert unknown error to AppError
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return InternalServerError.fromError(error);
  }

  return new InternalServerError(String(error));
}
