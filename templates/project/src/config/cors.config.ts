import type { CorsOptions } from 'cors';

/**
 * Allowed origins are read on every request (not at import time), so the
 * value from .env is used even though this module loads before katax.init().
 */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = (
      process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
        : ['http://localhost:3000', 'http://localhost:5173']
    ).filter(Boolean);

    // Requests without Origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // x-platform: native clients (mobile/desktop) that get the refresh token in the body
  allowedHeaders: ['Content-Type', 'Authorization', 'x-platform']
};
