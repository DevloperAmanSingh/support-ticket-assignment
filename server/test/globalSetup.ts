import { config } from '../src/config.ts';
import { createDb, runMigrations, SCRIPT_ACQUIRE_TIMEOUT_MS } from '../src/db/sequelize.ts';
import { createLogger } from '../src/logger.ts';

/** Applies the migrations to the test database once, before any test file runs. */
export default async function setup(): Promise<void> {
  const db = createDb({
    url: config.testDatabaseUrl,
    logger: createLogger('silent'),
    acquireTimeoutMs: SCRIPT_ACQUIRE_TIMEOUT_MS,
  });
  try {
    await runMigrations(db.sequelize);
  } finally {
    await db.sequelize.close();
  }
}
