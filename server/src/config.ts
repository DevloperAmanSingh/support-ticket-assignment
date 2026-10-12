import { z } from '../../shared/zod.ts';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const EnvSchema = z.object({
  DATABASE_URL: z.url().default('postgres://app:app@localhost:5432/tickets'),
  TEST_DATABASE_URL: z.url().default('postgres://app:app@localhost:5432/tickets_test'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

const env = EnvSchema.parse(process.env);

export const config = {
  databaseUrl: env.DATABASE_URL,
  testDatabaseUrl: env.TEST_DATABASE_URL,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
} as const;

export type Config = typeof config;
