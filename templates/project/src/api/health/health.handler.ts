import type { Request, Response } from 'express';
import { katax } from 'katax-service-manager';

/** GET /api/health - service status (databases, sockets, cron) + app metadata. */
export async function healthCheckHandler(_req: Request, res: Response): Promise<void> {
  try {
    const health = await katax.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 500;
    res.status(statusCode).json({
      ...health,
      environment: katax.nodeEnv,
      app: { name: katax.appName, version: katax.version }
    });
  } catch (error) {
    katax.logger.error({ err: error, message: 'Health check failed' });
    res.status(500).json({ status: 'unhealthy', timestamp: Date.now() });
  }
}
