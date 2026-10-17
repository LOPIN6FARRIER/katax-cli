/**
 * Errors and the public error contract.
 *
 * Every non-2xx JSON response from /api has this shape:
 *   {
 *     success: false,
 *     message: string,                    // friendly sentence, safe to render as-is
 *     error:   string,                    // stable machine code (VALIDATION_ERROR, NOT_FOUND...)
 *     details?: { field, message }[]      // only for VALIDATION_ERROR
 *   }
 *
 * The real cause (stack, DB error, upstream payload) only goes to the logger,
 * never to the client.
 *
 * `AppError` is an EXPECTED error (not found, conflict, forbidden...) whose
 * message is written for the client. Anything else (a pg error, a bug) is
 * logged and replaced with GENERIC_ERROR_MESSAGE by toSafeErrorResult().
 */
import { katax } from 'katax-service-manager';
import { GENERIC_ERROR_MESSAGE, hasTechnicalContent } from './sanitize.utils.js';

export { GENERIC_ERROR_MESSAGE } from './sanitize.utils.js';

// ==================== CODES & DEFAULT MESSAGES ====================

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_JSON: 'INVALID_JSON',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT'
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | (string & {});

export interface FieldError {
  field: string;
  message: string;
}

export interface PublicErrorBody {
  success: false;
  message: string;
  error: ErrorCode;
  details?: FieldError[];
}

export const DEFAULT_MESSAGES: Record<number, string> = {
  400: "We couldn't process your request. Please check it and try again.",
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  405: "This action isn't supported.",
  408: 'The request took too long. Please try again.',
  409: 'This conflicts with existing data. Please refresh and try again.',
  413: 'The content you sent is too large.',
  415: "This file or content type isn't supported.",
  422: "Some of the information you entered isn't valid. Please review it and try again.",
  429: 'Too many requests. Please wait a moment and try again.',
  500: GENERIC_ERROR_MESSAGE,
  502: 'This service is temporarily unavailable. Please try again in a moment.',
  503: 'This service is temporarily unavailable. Please try again in a moment.',
  504: 'The service took too long to respond. Please try again.'
};

export function defaultMessageFor(status: number): string {
  return DEFAULT_MESSAGES[status] ?? (status >= 500 ? GENERIC_ERROR_MESSAGE : DEFAULT_MESSAGES[400]!);
}

export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ERROR_CODES.BAD_REQUEST;
    case 401:
      return ERROR_CODES.UNAUTHORIZED;
    case 403:
      return ERROR_CODES.FORBIDDEN;
    case 404:
      return ERROR_CODES.NOT_FOUND;
    case 409:
      return ERROR_CODES.CONFLICT;
    case 413:
      return ERROR_CODES.PAYLOAD_TOO_LARGE;
    case 422:
      return ERROR_CODES.VALIDATION_ERROR;
    case 429:
      return ERROR_CODES.RATE_LIMITED;
    case 502:
    case 503:
      return ERROR_CODES.SERVICE_UNAVAILABLE;
    case 504:
      return ERROR_CODES.TIMEOUT;
    default:
      return status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.BAD_REQUEST;
  }
}

// ==================== EXPECTED ERRORS (AppError) ====================

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 400, code: string = codeForStatus(statusCode)) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export const badRequestError = (message: string): AppError => new AppError(message, 400, ERROR_CODES.BAD_REQUEST);
export const unauthorizedError = (message = 'Invalid credentials'): AppError =>
  new AppError(message, 401, ERROR_CODES.UNAUTHORIZED);
export const forbiddenError = (message = "You don't have access to this resource"): AppError =>
  new AppError(message, 403, ERROR_CODES.FORBIDDEN);
export const notFoundError = (resource = 'Resource'): AppError =>
  new AppError(`${resource} not found`, 404, ERROR_CODES.NOT_FOUND);
export const conflictError = (message: string): AppError => new AppError(message, 409, ERROR_CODES.CONFLICT);
export const validationError = (message: string): AppError =>
  new AppError(message, 422, ERROR_CODES.VALIDATION_ERROR);

// ==================== PUBLIC ERROR CONTRACT ====================

const CODE_RE = /^[A-Z][A-Z0-9_]{2,}$/;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Copy that is fine for logs but awkward for people ("with id ...", raw snake_case keys...). */
const DEV_ONLY_RE = /\b([Ww]ith (?:id|ID|Id)|[a-z]+_[a-z_]+|[A-Z]+_[A-Z_]+)\b/;

export function isErrorCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_RE.test(value.trim());
}

function toSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  const capitalized = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/** True when a string is safe *and* pleasant to show to a person. */
export function isDisplayable(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t || t.length > 240) return false;
  if (isErrorCode(t)) return false;
  if (UUID_RE.test(t) || DEV_ONLY_RE.test(t)) return false;
  if (hasTechnicalContent(t)) return false;
  // Bare generic titles add nothing over the defaults.
  if (/^(unauthorized|forbidden|internal server error|request error|invalid data|validation failed|bad request|error)$/i.test(t)) {
    return false;
  }
  return true;
}

/** Picks the best user-facing sentence out of a result's `message` (title) and `error` (description). */
function pickMessage(status: number, title?: string, description?: string): string {
  // 500 is always generic: whatever is in there came from an exception.
  if (status === 500 || status > 504) return defaultMessageFor(status);

  // A 401 that talks about tokens/headers means "session expired" to a person.
  const tokenTalk = (s?: string): boolean => !!s && /\b(token|authorization|access token)\b/i.test(s);

  const chosen = [description, title]
    .filter((candidate) => !(status === 401 && tokenTalk(candidate)))
    .filter(isDisplayable)
    .sort((a, b) => b.length - a.length)[0];
  return chosen ? toSentence(chosen) : defaultMessageFor(status);
}

export function normalizeStatus(status: unknown): number {
  const n = Number(status);
  return Number.isInteger(n) && n >= 400 && n <= 599 ? n : 500;
}

/** Normalizes any failed result ({ message, error, statusCode, details }) into the public error contract. */
export function toPublicError(
  result: { message?: string; error?: string; statusCode?: number; details?: unknown },
  fallbackStatus = 400
): { status: number; body: PublicErrorBody } {
  const status = normalizeStatus(result.statusCode ?? fallbackStatus);

  // The explicit code can live in either field.
  const explicitCode = isErrorCode(result.error) ? result.error : isErrorCode(result.message) ? result.message : undefined;
  const title = isErrorCode(result.message) ? undefined : result.message;
  const description = isErrorCode(result.error) ? undefined : result.error;

  const code =
    status >= 500 && ![501, 502, 503, 504].includes(status)
      ? ERROR_CODES.INTERNAL_ERROR
      : (explicitCode ?? codeForStatus(status));

  const body: PublicErrorBody = { success: false, message: pickMessage(status, title, description), error: code };

  if (code === ERROR_CODES.VALIDATION_ERROR && Array.isArray(result.details)) {
    body.details = sanitizeValidationErrors(result.details as FieldError[]);
    if (body.details.length > 0 && !isDisplayable(title) && !isDisplayable(description)) {
      body.message = body.details[0]!.message;
    }
  }

  return { status, body };
}

// ==================== VALIDATION MESSAGES ====================

/** Field labels that the generic humanizer gets wrong. Add your own domain names here. */
export const FIELD_LABELS: Record<string, string> = {
  id: 'Identifier',
  email: 'Email',
  password: 'Password',
  new_password: 'New password',
  current_password: 'Current password',
  refresh_token: 'Session'
};

export function humanizeField(path: string): string {
  if (!path || path === 'root' || path === 'unknown') return '';
  const last = path.split('.').filter((p) => !/^\d+$/.test(p)).pop() ?? path;
  if (FIELD_LABELS[last]) return FIELD_LABELS[last]!;
  const words = last
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\bid\b/i, '')
    .trim()
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'This field';
}

/** Rewrites katax-core's default issue messages into friendly copy. */
export function humanizeIssue(field: string, raw: string): string {
  const label = humanizeField(field) || 'This field';
  const msg = (raw ?? '').trim();
  let m: RegExpMatchArray | null;

  if (!msg || (hasTechnicalContent(msg) && !/received (undefined|null)/i.test(msg))) {
    return `${label} is not valid.`;
  }
  if (/received (undefined|null)|is required|cannot be empty|must not be empty/i.test(msg)) {
    return field === 'root' || !field ? 'Some required information is missing.' : `${label} is required.`;
  }
  if (/^Expected object, received/i.test(msg) && (!field || field === 'root')) {
    return "The request couldn't be read. Please try again.";
  }
  if (/^Unknown keys?:/i.test(msg)) return 'The request contains fields that are not allowed.';
  if (/^(Expected|Cannot coerce)/i.test(msg) && !/one of/i.test(msg)) {
    return `${label} has an invalid format.`;
  }
  if ((m = msg.match(/^Expected one of:\s*(.+)$/i))) {
    return `${label} must be one of: ${m[1]!.replace(/"/g, '')}.`;
  }
  if (/invalid email/i.test(msg)) return 'Please enter a valid email address.';
  if (/valid (uuid|cuid2|ulid)/i.test(msg)) return `${label} is not valid.`;
  if (/^String must be at least 1 characters?/i.test(msg)) return `${label} is required.`;
  if ((m = msg.match(/^String must be at least (\d+) characters?/i))) {
    return `${label} must be at least ${m[1]} characters.`;
  }
  if ((m = msg.match(/^String must be at most (\d+) characters?/i))) {
    return `${label} must be ${m[1]} characters or fewer.`;
  }
  if ((m = msg.match(/^String must be exactly (\d+) characters?/i))) {
    return `${label} must be exactly ${m[1]} characters.`;
  }
  if ((m = msg.match(/^Array must have at least (\d+) elements?/i))) {
    return `${label} must include at least ${m[1]} item${m[1] === '1' ? '' : 's'}.`;
  }
  if ((m = msg.match(/^Array must have at most (\d+) elements?/i))) {
    return `${label} can include at most ${m[1]} item${m[1] === '1' ? '' : 's'}.`;
  }
  if ((m = msg.match(/^(String|Number|Value|Date|Array|Boolean)\s+(must|cannot)\s+(.+)$/i))) {
    return toSentence(`${label} ${m[2]!.toLowerCase()} ${m[3]}`);
  }
  if (/^Invalid (url|date|phone|base64)/i.test(msg)) return `${label} has an invalid format.`;

  // Custom copy written in your own validators ("Date must be YYYY-MM-DD").
  if (isDisplayable(msg)) return toSentence(msg);
  return `${label} is not valid.`;
}

export function sanitizeValidationErrors(errors: FieldError[]): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const e of errors ?? []) {
    const field = typeof e?.field === 'string' ? e.field : '';
    const message = humanizeIssue(field, typeof e?.message === 'string' ? e.message : '');
    const key = `${field}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ field, message });
  }
  return out;
}

export function validationErrorBody(errors: FieldError[] = []): PublicErrorBody {
  const details = sanitizeValidationErrors(errors);
  return {
    success: false,
    message: details[0]?.message ?? DEFAULT_MESSAGES[422]!,
    error: ERROR_CODES.VALIDATION_ERROR,
    details
  };
}

export function internalErrorBody(): PublicErrorBody {
  return { success: false, message: GENERIC_ERROR_MESSAGE, error: ERROR_CODES.INTERNAL_ERROR };
}

// ==================== VALIDATOR / INFRA FAILURES ====================

/**
 * Marker an async validator returns when *it* failed (DB down, query error).
 * validateSchema() turns it into a 500 instead of a misleading 422.
 */
export const VALIDATOR_FAILURE = '__VALIDATOR_FAILURE__';

/**
 * Use inside an asyncRefine catch: logs the real cause and flags a server error.
 *
 *   .asyncRefine(async (value, path) => {
 *     try { return (await usersRepository.emailExists(value)) ? [{ path, message: 'Email already registered' }] : []; }
 *     catch (error) { return validatorFailure(path, 'users.emailExists', error); }
 *   })
 */
export function validatorFailure(
  path: (string | number)[],
  context: string,
  error?: unknown
): { path: (string | number)[]; message: string }[] {
  katax.logger.error({ err: error, message: `Validator failed: ${context}` });
  return [{ path, message: VALIDATOR_FAILURE }];
}
