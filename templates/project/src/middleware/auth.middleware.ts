import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../shared/jwt.utils.js';
import { ERROR_CODES } from '../shared/errors.utils.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth (mounted once in api/routes.ts before every private router). */
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Reads `Authorization: Bearer <access_token>`, verifies it and sets
 * req.user. Mounted once in api/routes.ts: `router.use(requireAuth)`;
 * every router mounted after it is private.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const payload = token ? verifyAccessToken(token) : null;

  if (!payload) {
    res.status(401).json({
      success: false,
      message: 'Your session has expired. Please sign in again.',
      error: ERROR_CODES.UNAUTHORIZED
    });
    return;
  }

  req.user = { id: payload.userId, email: payload.email, role: payload.role };
  next();
}

/** Use after requireAuth: `router.delete('/:id', requireRole('admin'), handler)`. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "You don't have permission to do that.",
        error: ERROR_CODES.FORBIDDEN
      });
      return;
    }
    next();
  };
}
