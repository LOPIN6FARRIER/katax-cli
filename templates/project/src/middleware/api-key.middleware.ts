import type { Request, Response, NextFunction } from 'express';
import { katax } from 'katax-service-manager';
import { ERROR_CODES, internalErrorBody } from '../shared/errors.utils.js';

export interface ApiKeyPayload {
  userId: string;
  keyId: string;
  scopes: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by authenticateApiKey(). */
      apiKey?: ApiKeyPayload;
    }
  }
}

/** Reads the key from `x-api-key` or `Authorization: ApiKey <key>`. */
export function getApiKeyFromRequest(req: Request): string | undefined {
  const header = req.headers['x-api-key'];
  if (header) return (Array.isArray(header) ? header[0] : header)?.trim();

  const auth = req.headers.authorization;
  if (auth?.startsWith('ApiKey ')) return auth.slice('ApiKey '.length).trim();
  return undefined;
}

/**
 * Authenticates with an API key. `resolveApiKey` looks the key up (hash it and
 * search your api_keys table through a repository) and returns its payload or null.
 */
export function authenticateApiKey(resolveApiKey: (key: string) => Promise<ApiKeyPayload | null>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = getApiKeyFromRequest(req);
      const payload = key ? await resolveApiKey(key) : null;
      if (!payload) {
        res.status(401).json({ success: false, message: 'A valid API key is required.', error: ERROR_CODES.UNAUTHORIZED });
        return;
      }
      req.apiKey = payload;
      next();
    } catch (error) {
      katax.logger.error({ err: error, message: 'API key authentication failed' });
      res.status(500).json(internalErrorBody());
    }
  };
}
