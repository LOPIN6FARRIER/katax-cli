/**
 * Type-safe Result pattern for error handling without exceptions
 * Based on Rust's Result<T, E> and functional programming principles
 */

/**
 * Success result with a value
 */
export type Ok<T> = {
  readonly ok: true;
  readonly value: T;
};

/**
 * Error result with an error
 */
export type Err<E> = {
  readonly ok: false;
  readonly error: E;
};

/**
 * Result type that can be either Ok or Err
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Create a success result
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create an error result
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Check if result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Check if result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/**
 * Map the value of an Ok result, leave Err unchanged
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Map the error of an Err result, leave Ok unchanged
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Chain Result-returning operations
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Get value or throw error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Get value or return default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Get value or compute default from error
 */
export function unwrapOrElse<T, E>(
  result: Result<T, E>,
  fn: (error: E) => T
): T {
  return result.ok ? result.value : fn(result.error);
}

/**
 * Wrap a function that might throw into a Result
 */
export function tryCatch<T, E = Error>(
  fn: () => T,
  mapError?: (error: unknown) => E
): Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    const mappedError = mapError ? mapError(error) : (error as E);
    return err(mappedError);
  }
}

/**
 * Wrap an async function that might throw into a Result
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    const mappedError = mapError ? mapError(error) : (error as E);
    return err(mappedError);
  }
}

/**
 * Combine multiple Results into one
 * Returns Ok with array of values if all are Ok, otherwise first Err
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  
  return ok(values);
}

/**
 * Execute a callback with the value if Ok, do nothing if Err
 */
export function ifOk<T, E>(
  result: Result<T, E>,
  fn: (value: T) => void
): void {
  if (result.ok) {
    fn(result.value);
  }
}

/**
 * Execute a callback with the error if Err, do nothing if Ok
 */
export function ifErr<T, E>(
  result: Result<T, E>,
  fn: (error: E) => void
): void {
  if (!result.ok) {
    fn(result.error);
  }
}

/**
 * Match on Result and execute corresponding callback
 */
export function match<T, E, R>(
  result: Result<T, E>,
  onOk: (value: T) => R,
  onErr: (error: E) => R
): R {
  return result.ok ? onOk(result.value) : onErr(result.error);
}
