import type { Clock } from '../clock.ts';
import type { Db } from '../db/sequelize.ts';
import type { Logger } from '../logger.ts';

/** Shared budget for obtaining a connection and the company lock. */
export const DEFAULT_LOCK_TIMEOUT_MS = 750;

export type ServiceDeps = {
  readonly db: Db;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly lockTimeoutMs: number;
};
