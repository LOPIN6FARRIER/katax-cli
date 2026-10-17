import { k } from 'katax-core';
import type { PaginationMeta as ResponsePaginationMeta } from './api.utils.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Query fields shared by every list endpoint (query strings are strings: coerce). */
export const pageField = k.coerce.number().integer().min(1).optional().describe('1-based page number. Defaults to 1.');
export const limitField = k.coerce
  .number()
  .integer()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .optional()
  .describe(`Items per page (max ${MAX_PAGE_SIZE}). Defaults to ${DEFAULT_PAGE_SIZE}.`);

export type PaginationMeta = Required<ResponsePaginationMeta>;

export interface PageWindow {
  page: number;
  limit: number;
  offset: number;
}

export function resolvePage(page?: number, limit?: number): PageWindow {
  const safePage = page && page > 0 ? Math.floor(page) : 1;
  const safeLimit = limit && limit > 0 ? Math.min(Math.floor(limit), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

export function buildPaginationMeta(page: number, limit: number, totalCount: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  return { currentPage: page, totalPages, totalItems: totalCount, totalCount, hasMorePages: page < totalPages };
}
