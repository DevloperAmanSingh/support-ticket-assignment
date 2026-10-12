import { createApp } from './app.ts';
import { systemClock } from './clock.ts';
import { config } from './config.ts';
import { createDb } from './db/sequelize.ts';
import { createLogger } from './logger.ts';
import { DEFAULT_LOCK_TIMEOUT_MS } from './services/deps.ts';

const logger = createLogger(config.logLevel);
// The wait for a connection and the wait for the company lock share one budget.
const db = createDb({
  url: config.databaseUrl,
  logger,
  acquireTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
});
const app = createApp({ db, clock: systemClock, logger, lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'server listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void db.sequelize.close();
    });
  });
}
