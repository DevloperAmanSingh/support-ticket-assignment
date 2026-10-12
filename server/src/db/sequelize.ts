import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

import type { Logger } from '../logger.ts';
import { initModels } from './models/index.ts';
import type { Models } from './models/index.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
const POOL_SIZE = 10;

/** The wait for a connection in a script. No caller waits on a deadline there. */
export const SCRIPT_ACQUIRE_TIMEOUT_MS = 30_000;

export type Db = { readonly sequelize: Sequelize; readonly models: Models };

/** A wait for a connection past `acquireTimeoutMs` fails. */
export function createDb({
  url,
  logger,
  acquireTimeoutMs,
}: {
  url: string;
  logger: Logger;
  acquireTimeoutMs: number;
}): Db {
  const sequelize = new Sequelize(url, {
    dialect: 'postgres',
    pool: { max: POOL_SIZE, acquire: acquireTimeoutMs },
    logging: (sql) => {
      logger.debug({ sql }, 'sql');
    },
  });
  return { sequelize, models: initModels(sequelize) };
}

export async function runMigrations(sequelize: Sequelize): Promise<string[]> {
  const umzug = new Umzug({
    migrations: {
      glob: ['*.sql', { cwd: MIGRATIONS_DIR }],
      resolve: ({ name, path }) => ({
        name,
        up: async () => {
          if (path === undefined) throw new Error(`Migration ${name} has no file path`);
          const sql = await readFile(path, 'utf8');
          await sequelize.transaction((transaction) => sequelize.query(sql, { transaction }));
        },
      }),
    },
    storage: new SequelizeStorage({ sequelize }),
    logger: undefined,
  });
  const applied = await umzug.up();
  return applied.map((migration) => migration.name);
}

export async function truncateAllTables(sequelize: Sequelize): Promise<void> {
  await sequelize.query(
    'TRUNCATE tickets, decisions, shifts, coverage_hours, agents, companies RESTART IDENTITY CASCADE',
  );
}
