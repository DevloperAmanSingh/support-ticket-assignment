import type { DateTime } from 'luxon';

import { systemClock } from '../clock.ts';
import type { Clock } from '../clock.ts';
import { DecisionKind } from '../codes.ts';
import { config } from '../config.ts';
import { AgentIdSchema, TicketIdSchema } from '../../../shared/ids.ts';
import type { AgentId, TicketId } from '../../../shared/ids.ts';
import { createLogger } from '../logger.ts';
import type { Logger } from '../logger.ts';
import { assignTicket } from '../services/assign.ts';
import { closeTicket } from '../services/close.ts';
import type { ServiceDeps } from '../services/deps.ts';
import { ACME_ID, buildSampleData, GLOBEX_ID, lastAcmeGapDay } from './seedData.ts';
import type { SeedCompany } from './seedData.ts';
import { createDb, SCRIPT_ACQUIRE_TIMEOUT_MS, truncateAllTables } from './sequelize.ts';
import type { Db } from './sequelize.ts';

/** The first sample ticket is T-101. */
const FIRST_TICKET_NUMBER = 101;
/** Two tickets arrive on the last gap day at these New York times, when nobody is on shift. */
const WAITING_TICKET_TIMES = [
  { hour: 10, minute: 0 },
  { hour: 11, minute: 15 },
] as const;
/** Eleven tickets arrive today, one each ten minutes. The last arrives ten minutes before the seed. */
const TODAY_TICKET_COUNT = 11;
const MINUTES_BETWEEN_TICKETS = 10;
/** Priya closes her two oldest tickets and Emma her oldest, whichever tickets the service gave them. */
const CLOSES = [
  { agentId: AgentIdSchema.parse('a1'), count: 2 },
  { agentId: AgentIdSchema.parse('a5'), count: 1 },
] as const;
/** The first close is eight minutes before the seed. Each later close is two minutes later. */
const FIRST_CLOSE_MINUTES_BEFORE = 8;
const MINUTES_BETWEEN_CLOSES = 2;

/** A clock the seed sets by hand, so each sample ticket arrives at its own instant. */
class SeedClock implements Clock {
  #current: DateTime;

  constructor(start: DateTime) {
    this.#current = start;
  }

  now(): DateTime {
    return this.#current;
  }

  set(instant: DateTime): void {
    this.#current = instant;
  }
}

async function insertCompany(db: Db, company: SeedCompany): Promise<void> {
  const { Company, Agent, Shift, CoverageHour } = db.models;
  await Company.create({ id: company.id, name: company.name, timezone: company.timezone });
  await CoverageHour.bulkCreate(
    company.hours.map((window) => ({ companyId: company.id, ...window })),
  );
  for (const agent of company.agents) {
    await Agent.create({
      id: agent.id,
      companyId: company.id,
      name: agent.name,
      timezone: agent.timezone,
      ticketLimit: agent.ticketLimit,
    });
    await Shift.bulkCreate(agent.shifts.map((shift) => ({ agentId: agent.id, ...shift })));
  }
}

/**
 * Sends the sample tickets of Acme through the assignment and the close of the service, each at
 * its own instant. The service picks every agent and writes every reason: the seed writes no
 * ticket row and no decision row itself.
 *
 * The result at `now`: two tickets wait with no agent, the agents on shift have different open
 * counts, one of them is at the ticket limit, and three tickets are closed.
 */
async function sendAcmeTickets({
  deps,
  clock,
  now,
}: {
  deps: ServiceDeps;
  clock: SeedClock;
  now: DateTime;
}): Promise<void> {
  let ticketNumber = FIRST_TICKET_NUMBER;
  const nextTicketId = (): TicketId => {
    const ticketId = TicketIdSchema.parse(`T-${ticketNumber}`);
    ticketNumber += 1;
    return ticketId;
  };

  // Nobody is on shift on the gap day, so these two tickets stay unassigned.
  const gapDay = lastAcmeGapDay(now);
  for (const time of WAITING_TICKET_TIMES) {
    clock.set(gapDay.set(time));
    await assignTicket(deps, { companyId: ACME_ID, ticketId: nextTicketId() });
  }

  // Today the agents on shift share the tickets by the rule of the service.
  const ticketsOf = new Map<AgentId, TicketId[]>();
  for (let index = 0; index < TODAY_TICKET_COUNT; index += 1) {
    clock.set(now.minus({ minutes: (TODAY_TICKET_COUNT - index) * MINUTES_BETWEEN_TICKETS }));
    const decision = await assignTicket(deps, { companyId: ACME_ID, ticketId: nextTicketId() });
    if (decision.kind === DecisionKind.Assigned) {
      const { id } = decision.agent;
      ticketsOf.set(id, [...(ticketsOf.get(id) ?? []), decision.ticketId]);
    }
  }

  // Two agents close their oldest tickets, so the open counts differ and closed tickets exist.
  const toClose = CLOSES.flatMap(({ agentId, count }) =>
    (ticketsOf.get(agentId) ?? []).slice(0, count),
  );
  for (const [index, ticketId] of toClose.entries()) {
    clock.set(now.minus({ minutes: FIRST_CLOSE_MINUTES_BEFORE - index * MINUTES_BETWEEN_CLOSES }));
    await closeTicket(deps, { companyId: ACME_ID, ticketId });
  }
}

/**
 * Replaces all data with the sample data: two companies, twelve agents, and the Acme tickets.
 * The shifts are built around `now`, so the seed gives the same team state at any hour of any day.
 */
export async function seedDatabase({
  db,
  now,
  logger,
}: {
  db: Db;
  now: DateTime;
  logger: Logger;
}): Promise<void> {
  await truncateAllTables(db.sequelize);
  for (const company of buildSampleData(now)) {
    await insertCompany(db, company);
  }
  const clock = new SeedClock(now);
  const deps: ServiceDeps = { db, clock, logger, lockTimeoutMs: SCRIPT_ACQUIRE_TIMEOUT_MS };
  await sendAcmeTickets({ deps, clock, now });
}

if (import.meta.main) {
  const logger = createLogger(config.logLevel);
  const db = createDb({
    url: config.databaseUrl,
    logger,
    acquireTimeoutMs: SCRIPT_ACQUIRE_TIMEOUT_MS,
  });
  try {
    await seedDatabase({ db, now: systemClock.now(), logger });
    logger.info({ companies: [ACME_ID, GLOBEX_ID] }, 'seed loaded');
  } finally {
    await db.sequelize.close();
  }
}
