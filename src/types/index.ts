export interface ProjectConfig {
  name: string;
  description: string;
  port: number;
  database: "postgresql" | "none";
  dbConfig?: {
    host?: string;
    port?: string;
    user?: string;
    password?: string;
    database?: string;
  };
  useRedis: boolean;
  redisConfig?: {
    host?: string;
    port?: string;
    password?: string;
    db?: string;
  };
  authentication: "jwt" | "none";
  useWebSocket: boolean;
  useSeparateSocketPort: boolean;
  socketPort: number;
  useRegistry: boolean;
  registryMode: "none" | "url" | "handler";
  registryUrl?: string;
  useLifecycleHooks: boolean;
  /** Print the endpoint map when the server starts (shared/startup-routes.utils.ts). */
  listRoutes: boolean;
  packageManager: "npm" | "pnpm";
  ignoreInstallScripts: boolean;
  createNpmrcForIgnoreScripts: boolean;
  initGit: boolean;
}
