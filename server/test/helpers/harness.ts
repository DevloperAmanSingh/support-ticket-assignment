import type { Express } from 'express';
import pg from 'pg';
import { QueryTypes } from 'sequelize';

import type {
  AssignedReason,
  UpdateAgentBody,
  UpdateCoverageHoursBody,
} from '../../../shared/api-types.ts';
import { createApp } from '../../src/app.ts';
import type { Clock } from '../../src/clock.ts';
import { config } from '../../src/config.ts';
import { createDb, truncateAllTables } from '../../src/db/sequelize.ts';
import { Rule, TicketStatus } from '../../../shared/codes.ts';
import { DecisionOutcome } from '../../src/codes.ts';
import type { WeeklyWindow } from '../../src/domain/time.ts';
import { createLogger } from '../../src/logger.ts';
import { DEFAULT_LOCK_TIMEOUT_MS } from '../../src/services/deps.ts';
import { z } from '../../../shared/zod.ts';
import { agentId } from './ids.ts';
import { at, WEDNESDAY, window } from './time.ts';

/** Wednesday noon UTC: the instant most API tests run at. */
export const NOON = '2026-10-14T12:00:00Z';
/** A shift that contains NOON for an agent in UTC. */
export const DAY_SHIFT: WeeklyWindow[] = [window(WEDNESDAY, '09:00', '17:00')];
/** The same shift as a request body entry. */
export const DAY_SHIFT_BODY: UpdateAgentBody['shifts'] = [
  { weekday: WEDNESDAY, start: '09:00', end: '17:00' },
];
export type CoverageHoursBody = UpdateCoverageHoursBody['hours'];

const logger = createLogger('silent');

// The same budget as the real server, so the pool tests see the real limit.
export const db = createDb({
  url: config.testDatabaseUrl,
  logger,
  acquireTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
});
const pool = new pg.Pool({ connectionString: config.testDatabaseUrl });

/** Builds the real application on the test database. */
export function makeApp({
  clock,
  lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
}: {
  clock: Clock;
  lockTimeoutMs?: number;
}): Express {
  return createApp({ db, clock, logger, lockTimeoutMs });
}

/** Empties every table. */
export async function resetDb(): Promise<void> {
  await truncateAllTables(db.sequelize);
}

/** Closes the connections of this test file. */
export async function closeDb(): Promise<void> {
  await pool.end();
  await db.sequelize.close();
}

// ---- Fixtures ----

/** Adds a company. */
export async function addCompany({
  id = 'c1',
  timezone = 'UTC',
}: { id?: string; timezone?: string } = {}): Promise<void> {
  await db.models.Company.create({ id, name: `Company ${id}`, timezone });
}

/** Adds an agent with shifts. */
export async function addAgent({
  id,
  companyId = 'c1',
  timezone = 'UTC',
  ticketLimit = 5,
  shifts = DAY_SHIFT,
}: {
  id: string;
  companyId?: string;
  timezone?: string;
  ticketLimit?: number;
  shifts?: readonly WeeklyWindow[];
}): Promise<void> {
  await db.models.Agent.create({ id, companyId, name: id.toUpperCase(), timezone, ticketLimit });
  await db.models.Shift.bulkCreate(shifts.map((shift) => ({ agentId: id, ...shift })));
}

function fixtureReason(agent: string): AssignedReason {
  return {
    rule: Rule.FewestOpen,
    selected: { agent_id: agentId(agent), open: 0, limit: 5, last_assigned_at: null },
    rejected: [],
  };
}

/** Adds a ticket that an agent already has, open or closed. */
export async function addAssignedTicket({
  ticketId,
  agent,
  assignedAt,
  companyId = 'c1',
  closedAt = null,
}: {
  ticketId: string;
  agent: string;
  assignedAt: string;
  companyId?: string;
  closedAt?: string | null;
}): Promise<void> {
  const reason = fixtureReason(agent);
  const assigned = at(assignedAt).toJSDate();
  const decision = await db.models.Decision.create({
    companyId,
    ticketId,
    decidedAt: assigned,
    outcome: DecisionOutcome.Assigned,
    reason,
  });
  await db.models.Ticket.create({
    companyId,
    ticketId,
    status: closedAt === null ? TicketStatus.Open : TicketStatus.Closed,
    agentId: agent,
    createdAt: assigned,
    assignedAt: assigned,
    closedAt: closedAt === null ? null : at(closedAt).toJSDate(),
    decisionId: decision.id,
  });
}

/** Counts the rows of the two tables that assignment writes. */
export async function countRows(): Promise<{ tickets: number; decisions: number }> {
  return { tickets: await db.models.Ticket.count(), decisions: await db.models.Decision.count() };
}

// ---- Locks held by the test ----

const WaitingSchema = z.tuple([z.object({ waiting: z.number().int() })]);

/** Waits until this many transactions wait for an advisory lock. */
export async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const result = await pool.query(
      "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
    );
    const [{ waiting }] = WaitingSchema.parse(result.rows);
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No ${count} lock waiters appeared`);
}

/** A promise the test resolves to let waiting transactions go. */
export function makeBarrier(): { promise: Promise<void>; open: () => void } {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  return {
    promise,
    open: () => {
      resolve(undefined);
    },
  };
}

/** A lock the test holds. `released` settles after the barrier opens and the lock is gone. */
export type HeldLock = { readonly released: Promise<void> };

async function holdAdvisoryLock({
  companyId,
  barrier,
  beforeRelease,
}: {
  companyId: string;
  barrier: Promise<void>;
  beforeRelease: (client: pg.PoolClient) => Promise<void>;
}): Promise<HeldLock> {
  const client = await pool.connect();
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [companyId]);
  const released = barrier.then(async () => {
    try {
      await beforeRelease(client);
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [companyId]);
    } finally {
      client.release();
    }
  });
  return { released };
}

/** Holds the lock of a company on a second connection until the barrier opens. */
export async function holdCompanyLock(
  companyId: string,
  barrier: Promise<void>,
): Promise<HeldLock> {
  return holdAdvisoryLock({ companyId, barrier, beforeRelease: () => Promise.resolve() });
}

const ADD_OPEN_TICKET_SQL = `
  WITH decision AS (
    INSERT INTO decisions (company_id, ticket_id, decided_at, outcome, reason)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  )
  INSERT INTO tickets (company_id, ticket_id, status, agent_id, created_at, assigned_at, decision_id)
  SELECT $1, $2, $6, $7, $3, $3, id FROM decision`;

/**
 * Holds the lock of a company on a second connection. When the barrier opens, the same connection
 * commits a new open ticket for an agent and then lets the lock go.
 */
export async function holdCompanyLockThenAddOpenTicket({
  companyId,
  barrier,
  ticketId,
  agent,
  assignedAt,
}: {
  companyId: string;
  barrier: Promise<void>;
  ticketId: string;
  agent: string;
  assignedAt: string;
}): Promise<HeldLock> {
  return holdAdvisoryLock({
    companyId,
    barrier,
    beforeRelease: async (client) => {
      await client.query(ADD_OPEN_TICKET_SQL, [
        companyId,
        ticketId,
        at(assignedAt).toJSDate(),
        DecisionOutcome.Assigned,
        JSON.stringify(fixtureReason(agent)),
        TicketStatus.Open,
        agent,
      ]);
    },
  });
}

const DatabaseNameSchema = z.tuple([z.object({ name: z.string() })]);
const IsolationSchema = z.tuple([z.object({ level: z.string() })]);

export const REPEATABLE_READ = 'repeatable read';

/**
 * Sets the isolation level that new connections to the test database start with.
 * Null puts back the server default. Connections that are already open keep their level.
 */
export async function setDefaultIsolation(level: typeof REPEATABLE_READ | null): Promise<void> {
  const [{ name }] = DatabaseNameSchema.parse(
    (await pool.query('SELECT current_database() AS name')).rows,
  );
  const database = pg.escapeIdentifier(name);
  await pool.query(
    level === null
      ? `ALTER DATABASE ${database} RESET default_transaction_isolation`
      : `ALTER DATABASE ${database} SET default_transaction_isolation = '${level}'`,
  );
}

/** Reads the isolation level that the connections of the application start with. */
export async function appDefaultIsolation(): Promise<string> {
  const rows = await db.sequelize.query(
    "SELECT current_setting('default_transaction_isolation') AS level",
    { type: QueryTypes.SELECT },
  );
  const [{ level }] = IsolationSchema.parse(rows);
  return level;
}

/** Holds a row lock on one ticket on a second connection until the barrier opens. */
export async function holdTicketRowLock(
  { companyId, ticketId }: { companyId: string; ticketId: string },
  barrier: Promise<void>,
): Promise<HeldLock> {
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query(
    'SELECT 1 FROM tickets WHERE company_id = $1 AND ticket_id = $2 FOR UPDATE',
    [companyId, ticketId],
  );
  const released = barrier.then(async () => {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
  return { released };
}
