import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode, RejectionCode, Rule, TicketStatus } from '../../../shared/codes.ts';
import { assigned, client, unassigned } from '../helpers/api.ts';
import type { Client } from '../helpers/api.ts';
import { FakeClock } from '../helpers/fakeClock.ts';
import {
  addAgent,
  addAssignedTicket,
  addCompany,
  closeDb,
  countRows,
  DAY_SHIFT_BODY,
  makeApp,
  NOON,
  resetDb,
} from '../helpers/harness.ts';
import { MONDAY, TUESDAY, WEDNESDAY, window } from '../helpers/time.ts';

let clock: FakeClock;
let api: Client;

beforeEach(async () => {
  await resetDb();
  clock = new FakeClock(NOON);
  api = client(makeApp({ clock }));
  await addCompany();
});

afterAll(closeDb);

const openCountOf = async (agent: string): Promise<number | undefined> =>
  (await api.agents()).agents.find((entry) => entry.id === agent)?.open_count;

describe('assign', () => {
  it('returns the agent, the decision, and the full reason', async () => {
    await addAgent({ id: 'a1' });
    await addAgent({ id: 'a2' });
    await addAgent({ id: 'a3', shifts: [] });
    await addAgent({ id: 'a4', ticketLimit: 1 });
    await addAssignedTicket({ ticketId: 'X-1', agent: 'a1', assignedAt: '2026-10-14T10:00:00Z' });
    await addAssignedTicket({ ticketId: 'X-2', agent: 'a4', assignedAt: '2026-10-14T11:00:00Z' });
    await addAssignedTicket({
      ticketId: 'X-3',
      agent: 'a2',
      assignedAt: '2026-10-13T04:10:00Z',
      closedAt: '2026-10-13T05:00:00Z',
    });

    const response = assigned(await api.assign('T-104'));

    expect(response).toEqual({
      ticket_id: 'T-104',
      assigned: true,
      agent: { id: 'a2', name: 'A2' },
      decision_id: 4,
      reason: {
        rule: Rule.FewestOpen,
        selected: { agent_id: 'a2', open: 0, limit: 5, last_assigned_at: '2026-10-13T04:10:00Z' },
        rejected: [
          { agent_id: 'a1', code: RejectionCode.MoreOpen, open: 1 },
          { agent_id: 'a3', code: RejectionCode.NotOnShift },
          { agent_id: 'a4', code: RejectionCode.AtLimit, open: 1 },
        ],
      },
    });
    const { tickets } = await api.tickets(`?status=${TicketStatus.Open}&order=newest`);
    expect(tickets[0]).toMatchObject({
      ticket_id: 'T-104',
      agent: { id: 'a2' },
      assigned_at: NOON,
      created_at: NOON,
      reason: response.reason,
    });
  });

  it('follows an overnight shift and the exact start and end minute', async () => {
    await addAgent({ id: 'a1', shifts: [window(MONDAY, '22:00', '06:00')] });

    clock.set('2026-10-13T02:00:00Z');
    expect(assigned(await api.assign('T-1')).agent.id).toBe('a1');
    clock.set('2026-10-12T22:00:00Z');
    expect(assigned(await api.assign('T-2')).agent.id).toBe('a1');
    clock.set('2026-10-12T21:59:59Z');
    expect(unassigned(await api.assign('T-3')).reason.rule).toBe(Rule.NoAgentOnShift);
    clock.set('2026-10-13T06:00:00Z');
    expect(unassigned(await api.assign('T-4')).reason.rule).toBe(Rule.NoAgentOnShift);
  });

  it('checks each agent on their own local weekday and clock', async () => {
    // 2026-10-13T02:00Z is Monday 22:00 in New York and Tuesday 07:30 in Kolkata.
    clock.set('2026-10-13T02:00:00Z');
    await addAgent({ id: 'a1', timezone: 'America/New_York', shifts: [window(TUESDAY, '07:00', '08:00')] });
    await addAgent({ id: 'a2', timezone: 'Asia/Kolkata', shifts: [window(TUESDAY, '07:00', '08:00')] });
    await addAgent({ id: 'a3', timezone: 'Asia/Kolkata', shifts: [window(MONDAY, '21:00', '23:00')] });

    const response = assigned(await api.assign('T-1'));

    expect(response.agent.id).toBe('a2');
    expect(response.reason.rejected).toEqual([
      { agent_id: 'a1', code: RejectionCode.NotOnShift },
      { agent_id: 'a3', code: RejectionCode.NotOnShift },
    ]);
  });

  it('replays an open ticket with the same agent and decision and writes nothing', async () => {
    await addAgent({ id: 'a1' });
    await addAgent({ id: 'a2' });
    const first = assigned(await api.assign('T-1'));
    const rows = await countRows();
    clock.set('2026-10-14T13:00:00Z');

    const second = await api.assign('T-1');

    expect(second).toEqual(first);
    expect(await countRows()).toEqual(rows);
    expect(await openCountOf('a1')).toBe(1);
  });

  it('replays a closed ticket with its agent plus "closed": true', async () => {
    await addAgent({ id: 'a1' });
    const first = assigned(await api.assign('T-1'));
    await api.close('T-1');
    const rows = await countRows();

    const replayed = await api.assign('T-1');

    expect(replayed).toEqual({ ...first, closed: true });
    expect(await countRows()).toEqual(rows);
  });

  it('decides an unassigned ticket again with a new decision and the first created_at', async () => {
    const first = unassigned(await api.assign('T-1'));
    await addAgent({ id: 'a1' });
    clock.set('2026-10-14T13:00:00Z');

    const second = assigned(await api.assign('T-1'));

    expect(second.agent.id).toBe('a1');
    expect(second.decision_id).not.toBe(first.decision_id);
    expect(await countRows()).toEqual({ tickets: 1, decisions: 2 });
    const { tickets } = await api.tickets();
    expect(tickets).toMatchObject([
      { ticket_id: 'T-1', created_at: NOON, assigned_at: '2026-10-14T13:00:00Z' },
    ]);
  });

  it('saves a ticket as unassigned with NO_AGENT_ON_SHIFT when nobody is on shift', async () => {
    await addAgent({ id: 'a1' });
    clock.set('2026-10-14T23:00:00Z');

    const response = unassigned(await api.assign('T-1'));

    expect(response).toMatchObject({
      ticket_id: 'T-1',
      assigned: false,
      agent: null,
      reason: {
        rule: Rule.NoAgentOnShift,
        selected: null,
        rejected: [{ agent_id: 'a1', code: RejectionCode.NotOnShift }],
      },
    });
    const { tickets } = await api.tickets(`?status=${TicketStatus.Unassigned}`);
    expect(tickets).toMatchObject([
      { ticket_id: 'T-1', status: TicketStatus.Unassigned, agent: null, reason: response.reason },
    ]);
  });

  it('reports ALL_AT_LIMIT when every on-shift agent is at the limit', async () => {
    await addAgent({ id: 'a1', ticketLimit: 1 });
    await addAgent({ id: 'a2', shifts: [] });
    assigned(await api.assign('T-1'));

    const response = unassigned(await api.assign('T-2'));

    expect(response.reason).toEqual({
      rule: Rule.AllAtLimit,
      selected: null,
      rejected: [
        { agent_id: 'a1', code: RejectionCode.AtLimit, open: 1 },
        { agent_id: 'a2', code: RejectionCode.NotOnShift },
      ],
    });
  });

  it('leaves every ticket of an empty company unassigned with no rejected agents', async () => {
    const response = unassigned(await api.assign('T-1'));

    expect(response.reason).toEqual({ rule: Rule.NoAgentOnShift, selected: null, rejected: [] });
  });

  it('gives the next three tickets to a new agent who starts at zero', async () => {
    await addAgent({ id: 'a1' });
    await addAgent({ id: 'a2' });
    await addAgent({ id: 'a3' });
    for (const [index, agent] of ['a1', 'a2', 'a1', 'a2', 'a1', 'a2'].entries()) {
      await addAssignedTicket({
        ticketId: `X-${index}`,
        agent,
        assignedAt: `2026-10-14T10:0${index}:00Z`,
      });
    }
    clock.stepBy(1000);

    const picked: string[] = [];
    for (const ticket of ['T-1', 'T-2', 'T-3', 'T-4', 'T-5']) {
      picked.push(assigned(await api.assign(ticket)).agent.id);
    }

    expect(picked).toEqual(['a3', 'a3', 'a3', 'a1', 'a2']);
  });

  it('gives a full tie to the lower agent id and HIGHER_ID to the other', async () => {
    await addAgent({ id: 'a2' });
    await addAgent({ id: 'a1' });
    await addAssignedTicket({ ticketId: 'X-1', agent: 'a1', assignedAt: '2026-10-14T10:00:00Z' });
    await addAssignedTicket({ ticketId: 'X-2', agent: 'a2', assignedAt: '2026-10-14T10:00:00Z' });

    const response = assigned(await api.assign('T-1'));

    expect(response.agent.id).toBe('a1');
    expect(response.reason.rejected).toEqual([{ agent_id: 'a2', code: RejectionCode.HigherId }]);
  });

  it('uses the last assignment of closed tickets to break a tie', async () => {
    await addAgent({ id: 'a1' });
    await addAgent({ id: 'a2' });
    await addAssignedTicket({
      ticketId: 'X-1',
      agent: 'a1',
      assignedAt: '2026-10-14T11:00:00Z',
      closedAt: '2026-10-14T11:30:00Z',
    });
    await addAssignedTicket({
      ticketId: 'X-2',
      agent: 'a2',
      assignedAt: '2026-10-14T09:00:00Z',
      closedAt: '2026-10-14T09:30:00Z',
    });

    const response = assigned(await api.assign('T-1'));

    expect(response.agent.id).toBe('a2');
    expect(response.reason.rejected).toEqual([
      {
        agent_id: 'a1',
        code: RejectionCode.AssignedMoreRecently,
        last_assigned_at: '2026-10-14T11:00:00Z',
      },
    ]);
  });
});

describe('close', () => {
  it('drops the open count by one, and a second close changes nothing', async () => {
    await addAgent({ id: 'a1' });
    assigned(await api.assign('T-1'));
    assigned(await api.assign('T-2'));
    expect(await openCountOf('a1')).toBe(2);
    clock.set('2026-10-14T12:30:00Z');

    const first = await api.close('T-1');
    clock.set('2026-10-14T12:45:00Z');
    const second = await api.close('T-1');

    expect(first).toEqual({
      ticket_id: 'T-1',
      status: TicketStatus.Closed,
      agent: { id: 'a1', name: 'A1' },
      closed_at: '2026-10-14T12:30:00Z',
    });
    expect(second).toEqual(first);
    expect(await openCountOf('a1')).toBe(1);
  });

  it('closes a ticket that was never assigned, and a later assign returns TICKET_CLOSED', async () => {
    const first = unassigned(await api.assign('T-1'));
    await addAgent({ id: 'a1' });

    const closed = await api.close('T-1');
    const rows = await countRows();
    const later = await api.assign('T-1');

    expect(closed.agent).toBeNull();
    expect(later).toEqual({
      ticket_id: 'T-1',
      assigned: false,
      agent: null,
      decision_id: first.decision_id,
      reason: { rule: Rule.TicketClosed, selected: null },
    });
    expect(await countRows()).toEqual(rows);
    expect(await openCountOf('a1')).toBe(0);
  });
});

describe('retry', () => {
  it('assigns one unassigned ticket again and adds a decision row', async () => {
    unassigned(await api.assign('T-1'));
    await addAgent({ id: 'a1' });

    const { results } = await api.retry({ ticket_id: 'T-1' });

    expect(results).toMatchObject([
      { outcome: 'ASSIGNED', ticket_id: 'T-1', agent: { id: 'a1', name: 'A1' } },
    ]);
    expect(await countRows()).toEqual({ tickets: 1, decisions: 2 });
  });

  it('retries all unassigned tickets oldest first and reports each outcome', async () => {
    clock.stepBy(60_000);
    unassigned(await api.assign('T-2'));
    unassigned(await api.assign('T-1'));
    unassigned(await api.assign('T-3'));
    await addAgent({ id: 'a1', ticketLimit: 2 });

    const { results } = await api.retry({ all: true });

    expect(results.map((result) => [result.ticket_id, result.outcome])).toEqual([
      ['T-2', 'ASSIGNED'],
      ['T-1', 'ASSIGNED'],
      ['T-3', 'UNASSIGNED'],
    ]);
    expect(results[2]).toMatchObject({ reason: { rule: Rule.AllAtLimit } });
  });

  it('skips a ticket that is not unassigned', async () => {
    await addAgent({ id: 'a1' });
    assigned(await api.assign('T-1'));
    const rows = await countRows();

    const { results } = await api.retry({ ticket_id: 'T-1' });

    expect(results).toEqual([
      { outcome: 'SKIPPED', ticket_id: 'T-1', status: TicketStatus.Open },
    ]);
    expect(await countRows()).toEqual(rows);
  });

  it('reports an unknown ticket as failed in a 200 and writes nothing', async () => {
    const { results } = await api.retry({ ticket_id: 'ghost' });

    expect(results).toMatchObject([
      { outcome: 'FAILED', ticket_id: 'ghost', error: { code: ErrorCode.TicketNotFound } },
    ]);
    expect(await countRows()).toEqual({ tickets: 0, decisions: 0 });
  });
});

describe('schedule edits with open tickets', () => {
  it('takes nothing away when the limit drops below the open count', async () => {
    await addAgent({ id: 'a1' });
    for (const ticket of ['T-1', 'T-2', 'T-3']) assigned(await api.assign(ticket));

    const updated = await api.updateAgent('a1', {
      timezone: 'UTC',
      ticket_limit: 2,
      shifts: DAY_SHIFT_BODY,
    });

    expect(updated).toMatchObject({ ticket_limit: 2, open_count: 3, on_shift: true });
    expect(unassigned(await api.assign('T-4')).reason).toEqual({
      rule: Rule.AllAtLimit,
      selected: null,
      rejected: [{ agent_id: 'a1', code: RejectionCode.AtLimit, open: 3 }],
    });
    await api.close('T-1');
    expect(unassigned(await api.assign('T-5')).reason.rule).toBe(Rule.AllAtLimit);
    await api.close('T-2');
    expect(assigned(await api.assign('T-6')).reason.selected).toMatchObject({ open: 1, limit: 2 });
  });

  it('keeps open tickets when a shift is deleted, and assigns only in the remaining shifts', async () => {
    await addAgent({ id: 'a1' });
    assigned(await api.assign('T-1'));

    const updated = await api.updateAgent('a1', {
      timezone: 'Asia/Kolkata',
      ticket_limit: 5,
      shifts: [{ weekday: WEDNESDAY, start: '22:00', end: '06:00' }],
    });

    expect(updated).toMatchObject({
      timezone: 'Asia/Kolkata',
      open_count: 1,
      on_shift: false,
      shifts: [{ weekday: WEDNESDAY, start: '22:00', end: '06:00' }],
    });
    expect(unassigned(await api.assign('T-2')).reason.rule).toBe(Rule.NoAgentOnShift);
    // Wednesday 22:00 in Kolkata is 16:30Z.
    clock.set('2026-10-14T16:30:00Z');
    expect(assigned(await api.assign('T-3')).agent.id).toBe('a1');
    expect((await api.agents()).agents).toMatchObject([{ id: 'a1', open_count: 2, on_shift: true }]);
  });
});

describe('tenant isolation', () => {
  it('never picks an agent of another company, and keeps equal ticket ids apart', async () => {
    await addCompany({ id: 'c2' });
    await addAgent({ id: 'a1', companyId: 'c1', ticketLimit: 1 });
    await addAgent({ id: 'b1', companyId: 'c2' });

    const inA = assigned(await api.assign('T-1', 'c1'));
    const inB = assigned(await api.assign('T-1', 'c2'));
    const fullA = unassigned(await api.assign('T-2', 'c1'));

    expect(inA.agent.id).toBe('a1');
    expect(inB.agent.id).toBe('b1');
    expect(inB.decision_id).not.toBe(inA.decision_id);
    expect(fullA.reason.rejected).toEqual([
      { agent_id: 'a1', code: RejectionCode.AtLimit, open: 1 },
    ]);
    expect(await countRows()).toEqual({ tickets: 3, decisions: 3 });

    await api.close('T-1', 'c1');
    expect((await api.tickets('', 'c1')).tickets.map((ticket) => ticket.status)).toEqual([
      TicketStatus.Closed,
      TicketStatus.Unassigned,
    ]);
    expect((await api.tickets('', 'c2')).tickets.map((ticket) => ticket.status)).toEqual([
      TicketStatus.Open,
    ]);
    expect((await api.agents('c2')).agents.map((agent) => agent.id)).toEqual(['b1']);
    expect((await api.companies()).companies.map((company) => company.id)).toEqual(['c1', 'c2']);
  });
});
