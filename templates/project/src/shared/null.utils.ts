import type { Schema } from 'katax-core';
import { validateSchema } from './api.utils.js';
import type { ValidationResult } from './api.utils.js';

/**
 * `null` handling for request input.
 *
 * Clients (MCP clients like Claude especially) often send `null` for an
 * optional field they don't want to set. Validators accept it with
 * `.nullish()`, and this module turns those nulls into `undefined`
 * ("not provided") before the data reaches a controller.
 *
 * The keys passed as `keep` are the exceptions: there `null` is a real value
 * ("remove the reward", "no due date") and must reach the repository as NULL.
 */
export type NullsToUndefined<T, Keep extends string = never> = T extends readonly (infer U)[]
  ? NullsToUndefined<U, Keep>[]
  : T extends Date
    ? T
    : T extends object
      ? { [K in keyof T]: K extends Keep ? T[K] : NullsToUndefined<T[K], Keep> }
      : T extends null
        ? undefined
        : T;

export function dropNulls<T, Keep extends string = never>(
  value: T,
  keep: ReadonlySet<string> = new Set()
): NullsToUndefined<T, Keep> {
  if (Array.isArray(value)) {
    return value.map((item) => dropNulls(item, keep)) as NullsToUndefined<T, Keep>;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === null && !keep.has(key)) continue;
      out[key] = dropNulls(item, keep);
    }
    return out as NullsToUndefined<T, Keep>;
  }
  return value as NullsToUndefined<T, Keep>;
}

/** validateSchema + null normalisation. Use it in every validate* helper. */
export async function validateNormalized<T, Keep extends string = never>(
  schema: Schema<T>,
  data: unknown,
  keep: readonly Keep[] = []
): Promise<ValidationResult<NullsToUndefined<T, Keep>>> {
  const result = await validateSchema(schema, data);
  if (!result.isValid || result.data === undefined) {
    return { isValid: false, errors: result.errors, internalError: result.internalError };
  }
  return { isValid: true, data: dropNulls<T, Keep>(result.data, new Set<string>(keep)) };
}
