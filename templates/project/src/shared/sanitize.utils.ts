/**
 * Detects strings that would leak implementation details (DB errors, stack
 * traces, network internals, file paths...) if shown to an end user.
 *
 * Patterns are word-bounded on purpose: plain substring matching flags
 * perfectly friendly copy ("orm" inside "format", "port" inside "support",
 * "at " inside "at least").
 */
const TECHNICAL_PATTERNS: RegExp[] = [
  // Databases / ORMs
  /\b(sql|postgres(ql)?|pg|mysql|mongo(db)?|redis|elasticsearch|sqlite)\b/i,
  /\b(prisma|typeorm|sequelize|knex|orm)\b/i,
  /\b(query failed|syntax error|relation|column|table|schema|constraint)\b/i,
  /\b(foreign key|primary key|unique constraint|duplicate key|duplicate entry)\b/i,
  /\b(deadlock|lock wait timeout|rollback|transaction)\b/i,
  /\b(select|insert into|update \w+ set|delete from|inner join|left join)\b.*\b(from|where|values|set)\b/i,
  /\bviolates\b/i,
  // Network / infra
  /\b(econnrefused|econnreset|etimedout|enotfound|eai_again|epipe|getaddrinfo)\b/i,
  /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)\b/,
  /\b(connection (refused|reset|terminated|string)|socket hang up|handshake|pooler?)\b/i,
  /\b(ssl|tls|docker|container)\b/i,
  // JS runtime errors / stack traces
  /\bat .+\(.+:\d+:\d+\)/,
  /\n\s+at /,
  /\b(TypeError|ReferenceError|RangeError|SyntaxError|EvalError)\b/,
  /\bcannot read propert(y|ies) of\b/i,
  /\bis not (a function|defined|iterable)\b/i,
  /\bunexpected token\b/i,
  /\bundefined\b|\bnull\b|\bNaN\b/,
  /\bstack\b/i,
  // Paths / internals
  /[a-z]:\\|\/(home|usr|var|opt|srv|root)\//i,
  /\.(ts|js|mjs|cjs)\b/i,
  /\b(transform error|promise rejected during validation)\b/i,
  /\b(jwt|bearer|jsonwebtoken|bcrypt|argon2)\b/i
];

export const GENERIC_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';

export function hasTechnicalContent(message: string): boolean {
  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(message));
}
