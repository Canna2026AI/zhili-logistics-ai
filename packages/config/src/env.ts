import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  S3_ENDPOINT: z.url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  SESSION_KEY: z.string().min(1),
  ENVELOPE_MASTER_KEY: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(logLevels).default('info'),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return appEnvSchema.parse(source);
}
