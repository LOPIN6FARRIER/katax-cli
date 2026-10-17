import { k } from 'katax-core';
import { validateComposed } from './api.utils.js';
import type { ValidationResult } from './api.utils.js';
import type { WithId } from '../types/api.types.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Calendar date as a YYYY-MM-DD string. Use it instead of k.date() for
 * `date` columns: a JS Date carries a timezone and can shift the day.
 */
export const dateSchema = k.string().regex(DATE_REGEX, 'Date must be YYYY-MM-DD').describe('Calendar date as YYYY-MM-DD.');

/** Validates the `:id` param and the body separately and merges them (body + id). */
export async function validateWithId<TId extends string | number, T>(
  validateId: () => Promise<ValidationResult<{ id: TId }>>,
  validateBody: () => Promise<ValidationResult<T>>
): Promise<ValidationResult<WithId<T, TId>>> {
  return validateComposed(validateId, () => validateBody(), (params, body) => ({ ...body, id: params.id }));
}
