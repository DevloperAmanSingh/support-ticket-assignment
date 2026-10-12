import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedDatabase } from '../../src/db/seed.ts';
import {
  ErrorCode,
  RejectionCode,
  RetryOutcome,
  Rule,
  TicketStatus,
} from '../../../shared/codes.ts';
import { createLogger } from '../../src/logger.ts';
import { assigned, client } from '../helpers/api.ts';
import type { Client } from '../helpers/api.ts';
import { FakeClock } from '../helpers/fakeClock.ts';
import { closeDb, db, makeApp, resetDb } from '../helpers/harness.ts';
import { at } from '../helpers/time.ts';

const logger = createLogger('silent');
const HOUR_MS = 3_600_000;
const NOT_ON_SHIFT = [RejectionCode.NotOnShift, RejectionCode.NotOnShift, RejectionCode.NotOnShift];

/** The seed must give the same team state at any hour of any day. */
const SEED_TIMES = [
  { label: 'a weekday at 11:00 in New York', now: '2026-10-14T15:00:00Z', gapDate: '2026-10-17' },
  { label: 'a weekday at 23:30 in New York', now: '2026-10-15T03:30:00Z', gapDate: '2026-10-17' },
  { label: 'a Saturday inside the usual gap', now: '2026-10-17T14:00:00Z', gapDate: '2026-10-18' },
  { label: 'a Sunday at 01:00 in New York', now: '2026-10-18T05:00:00Z', gapDate: '2026-10-17' },
  { label: 'a winter weekday, after the clocks changed', now: '2026-12-01T20:00:00Z', gapDate: '2026-12-05' },
] as const;

afterAll(closeDb);

describe.each(SEED_TIMES)('seed on $label', ({ now, gapDate }) => {
  let api: Client;
  let clock: FakeClock;

  // One seed for the read-only checks of this instant. The tests that write come last.
  beforeAll(async () => {
    await resetDb();
    await seedDatabase({ db, now: at(now), logger });
    clock = new FakeClock(now);
    api = client(makeApp({ clock }));
  });

  it('loads Acme with seven agents and Globex with five, each across three timezones', async () => {
    const { companies } = await api.companies();
    expect(companies.map((company) => company.id)).toEqual(['acme', 'globex']);

    const acme = await api.agents('acme');
    expect(acme.agents.map((agent) => agent.name)).toEqual([
      'Priya',
      'Sam',
      'Lee',
      'Rahul',
      'Emma',
      'Aisha',
      'Carlos',
    ]);
    const globex = await api.agents('globex');
    expect(globex.agents).toHaveLength(5);
    for (const { agents } of [acme, globex]) {
      expect(new Set(agents.map((agent) => agent.timezone)).size).toBe(3);
    }
    expect((await api.tickets('', 'globex')).tickets).toEqual([]);
  });

  it('has four Acme agents on shift with different loads, one of them at the ticket limit', async () => {
    const { agents } = await api.agents('acme');

    expect(
      agents.map((agent) => [agent.id, agent.on_shift, agent.open_count, agent.ticket_limit]),
    ).toEqual([
      ['a1', true, 1, 5],
      ['a2', true, 3, 5],
      ['a3', true, 2, 2],
      ['a4', false, 0, 4],
      ['a5', true, 2, 4],
      ['a6', false, 0, 3],
      ['a7', false, 0, 5],
    ]);
  });

  it('gives Rahul an overnight shift', async () => {
    const { agents } = await api.agents('acme');
    const rahul = agents.find((agent) => agent.name === 'Rahul');

    expect(rahul?.shifts.length).toBeGreaterThan(0);
    expect(rahul?.shifts.every((shift) => shift.start === '22:00' && shift.end === '06:00')).toBe(
      true,
    );
  });

  it('has eight open tickets, two that wait, and three closed, all from the past', async () => {
    const { tickets } = await api.tickets('', 'acme');

    const count = (status: TicketStatus) =>
      tickets.filter((ticket) => ticket.status === status).length;
    expect(tickets).toHaveLength(13);
    expect(count(TicketStatus.Open)).toBe(8);
    expect(count(TicketStatus.Unassigned)).toBe(2);
    expect(count(TicketStatus.Closed)).toBe(3);
    for (const ticket of tickets) {
      expect(at(ticket.created_at) < at(now), ticket.ticket_id).toBe(true);
    }
  });

  it('has the reasons that the service wrote, not fixed ones', async () => {
    const { tickets } = await api.tickets('', 'acme');
    const ticketWith = (id: string) => tickets.find((ticket) => ticket.ticket_id === id);

    // The two oldest tickets arrived when nobody was on shift.
    for (const ticketId of ['T-101', 'T-102']) {
      const waiting = ticketWith(ticketId);
      expect(waiting).toMatchObject({
        status: TicketStatus.Unassigned,
        reason: { rule: Rule.NoAgentOnShift, selected: null },
      });
      expect(waiting?.reason.rejected.map((rejected) => rejected.code)).toEqual([
        ...NOT_ON_SHIFT,
        ...NOT_ON_SHIFT,
        RejectionCode.NotOnShift,
      ]);
    }
    // The first ticket of today went to the lowest id among agents who never had a ticket.
    expect(ticketWith('T-103')).toMatchObject({
      agent: { id: 'a1', name: 'Priya' },
      reason: { selected: { agent_id: 'a1', open: 0, limit: 5, last_assigned_at: null } },
    });
    // The last one went to Emma when Lee was full and the others had more open tickets.
    expect(ticketWith('T-113')).toMatchObject({
      status: TicketStatus.Open,
      agent: { id: 'a5', name: 'Emma' },
      reason: {
        rule: Rule.FewestOpen,
        selected: { agent_id: 'a5', open: 2, limit: 4 },
        rejected: [
          { agent_id: 'a1', code: RejectionCode.MoreOpen, open: 3 },
          { agent_id: 'a2', code: RejectionCode.MoreOpen, open: 3 },
          { agent_id: 'a3', code: RejectionCode.AtLimit, open: 2 },
          { agent_id: 'a4', code: RejectionCode.NotOnShift },
          { agent_id: 'a6', code: RejectionCode.NotOnShift },
          { agent_id: 'a7', code: RejectionCode.NotOnShift },
        ],
      },
    });
  });

  it('has one coverage gap in the week of the seed, 09:00 to 13:00 on a day that is not today', async () => {
    const weekStart = at(now).setZone('America/New_York').startOf('week').toISODate() ?? '';

    const { gaps } = await api.coverage(weekStart, 'acme');

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.start.startsWith(`${gapDate}T09:00:00`)).toBe(true);
    expect(gaps[0]?.end.startsWith(`${gapDate}T13:00:00`)).toBe(true);
  });

  it('accepts every seeded agent unchanged through the agent update', async () => {
    for (const company of ['acme', 'globex']) {
      const { agents } = await api.agents(company);
      for (const agent of agents) {
        const saved = await api.updateAgent(
          agent.id,
          { timezone: agent.timezone, ticket_limit: agent.ticket_limit, shifts: agent.shifts },
          company,
        );
        expect(saved.shifts).toHaveLength(agent.shifts.length);
      }
    }
  });

  it('keeps the same agents on shift five hours after the seed', async () => {
    const later = client(makeApp({ clock: new FakeClock(at(now).plus(5 * HOUR_MS).toISO() ?? now) }));

    const { agents } = await later.agents('acme');

    expect(agents.filter((agent) => agent.on_shift).map((agent) => agent.id)).toEqual([
      'a1',
      'a2',
      'a3',
      'a5',
    ]);
  });

  it('assigns a new ticket to the agent with the fewest open tickets, with every other agent rejected for a cause', async () => {
    const response = assigned(await api.assign('T-200', 'acme'));

    expect(response.agent).toEqual({ id: 'a1', name: 'Priya' });
    expect(response.reason.selected).toMatchObject({ agent_id: 'a1', open: 1, limit: 5 });
    // The service lists the rejected agents by id.
    expect(response.reason.rejected).toEqual([
      { agent_id: 'a2', code: RejectionCode.MoreOpen, open: 3 },
      { agent_id: 'a3', code: RejectionCode.AtLimit, open: 2 },
      { agent_id: 'a4', code: RejectionCode.NotOnShift },
      { agent_id: 'a5', code: RejectionCode.MoreOpen, open: 2 },
      { agent_id: 'a6', code: RejectionCode.NotOnShift },
      { agent_id: 'a7', code: RejectionCode.NotOnShift },
    ]);
  });

  it('assigns the two waiting tickets again, oldest first', async () => {
    const { results } = await api.retry({ all: true }, 'acme');

    expect(results.map((result) => [result.ticket_id, result.outcome])).toEqual([
      ['T-101', RetryOutcome.Assigned],
      ['T-102', RetryOutcome.Assigned],
    ]);
    expect((await api.tickets(`?status=${TicketStatus.Unassigned}`, 'acme')).tickets).toEqual([]);
  });

  it('reports a ticket that is not in the seed as failed', async () => {
    const { results } = await api.retry({ ticket_id: 'T-999' }, 'acme');

    expect(results).toMatchObject([
      { outcome: RetryOutcome.Failed, error: { code: ErrorCode.TicketNotFound } },
    ]);
  });
});

describe('seed timing', () => {
  it('returns an eligible assignment in under one second', async () => {
    const now = '2026-10-14T15:00:00Z';
    await resetDb();
    await seedDatabase({ db, now: at(now), logger });
    const api = client(makeApp({ clock: new FakeClock(now) }));

    const started = performance.now();
    const response = await api.assign('T-300', 'acme');
    const elapsedMs = performance.now() - started;

    expect(assigned(response).agent.id).toBe('a1');
    expect(elapsedMs).toBeLessThan(1000);
  });
});
