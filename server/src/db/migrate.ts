import { config } from '../config.ts';
import { createLogger } from '../logger.ts';
import { createDb, runMigrations, SCRIPT_ACQUIRE_TIMEOUT_MS } from './sequelize.ts';

const logger = createLogger(config.logLevel);
const db = createDb({
  url: config.databaseUrl,
  logger,
  acquireTimeoutMs: SCRIPT_ACQUIRE_TIMEOUT_MS,
});
try {
  const applied = await runMigrations(db.sequelize);
  logger.info({ applied }, 'migrations applied');
} finally {
  await db.sequelize.close();
}
