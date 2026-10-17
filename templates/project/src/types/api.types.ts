/** Body/query data plus the `:id` taken from the URL (validateWithId merges both). */
export type WithId<T, TId extends string | number = string> = T & { id: TId };
