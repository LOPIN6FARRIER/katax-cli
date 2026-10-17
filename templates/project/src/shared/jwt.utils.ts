import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

/**
 * Access/refresh JWTs. Secrets come from the environment only - there is no
 * fallback secret: a missing JWT_SECRET fails loudly instead of signing
 * tokens with a value anyone can read in this file.
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

interface TypedPayload extends JwtPayload {
  typ: 'access' | 'refresh';
}

function secret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const ACCESS_TOKEN_EXPIRY = (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'];
const REFRESH_TOKEN_EXPIRY = (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, typ: 'access' }, secret('JWT_SECRET'), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, typ: 'refresh' }, secret('JWT_REFRESH_SECRET'), { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
  return { accessToken: generateAccessToken(payload), refreshToken: generateRefreshToken(payload) };
}

function verify(token: string, key: string, typ: TypedPayload['typ']): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, key) as Partial<TypedPayload>;
    // The `typ` claim stops a refresh token from being used as an access token (and vice versa).
    if (decoded.typ !== typ || !decoded.userId) return null;
    return { userId: decoded.userId, email: decoded.email ?? '', role: decoded.role ?? 'user' };
  } catch {
    return null;
  }
}

export function verifyAccessToken(token: string): JwtPayload | null {
  return verify(token, secret('JWT_SECRET'), 'access');
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  return verify(token, secret('JWT_REFRESH_SECRET'), 'refresh');
}
