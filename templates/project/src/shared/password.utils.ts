import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/** bcryptjs: pure JS (no native build step), same API as bcrypt. */
export async function hashPassword(password: string, saltRounds = 12): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Opaque random token (refresh-session ids, email verification links...). Store only its sha256. */
export function generateRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateNumericCode(digits = 6): string {
  return Array.from({ length: digits }, () => randomInt(0, 10)).join('');
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Constant-time string comparison (tokens, signatures). */
export function secureCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
