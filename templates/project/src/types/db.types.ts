/**
 * Row types mirroring the SQL schema exactly (table + column names).
 * Every db().query<T>() in every repository uses one of these (or a
 * Pick/composite of them) - never `any` or an inline object type.
 * Nullable columns are `T | null`, never optional (`?`).
 * `date` columns are selected with ::text, so they are strings (YYYY-MM-DD).
 */
export {};
