import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode, RejectionCode, Rule, TicketStatus } from '../../../shared/codes.ts';
import { assigned, client, errorOf, unassigned } from '../helpers/api.ts';
import type { Client } from '../helpers/api.ts';
import { FakeClock } from '../helpers/fakeClock.ts';
import {
  addAgent,
  addAssignedTicket,
  addCompany,
  closeDb,
  countRows,
  DAY_SHIFT_BODY,
  holdCompanyLock,
  holdTicketRowLock,
  makeApp,
  makeBarrier,
  NOON,
  resetDb,
  waitForLockWaiters,
} from '../helpers/harness.ts';

const SHORT_LOCK_TIMEOUT_MS = 300;

let clock: FakeClock;
let api: Client;

beforeEach(async () => {
  await resetDb();
  clock = new FakeClock(NOON);
  api = client(makeApp({ clock }));
  await addCompany();
});

afterAll(closeDb);

describe('same instant', () => {
  it('gives 15 open and 5 unassigned for 20 tickets and 3 agents with limit 5', async () => {
    for (const id of ['a1', 'a2', 'a3']) await addAgent({ id });
    const tickets = Array.from({ length: 20 }, (_, index) => `T-${index + 1}`);

    const responses = await Promise.all(tickets.map(async (ticket) => {
      const start = performance.now();
      const response = await api.assign(ticket);
      expect(performance.now() - start).toBeLessThan(1000);
      return response;
    }));

    expect(responses.filter((response) => response.assigned)).toHaveLength(15);
    expect(responses.filter((response) => !response.assigned)).toHaveLength(5);
    for (const response of responses.filter((entry) => !entry.assigned)) {
      expect(unassigned(response).reason.rule).toBe(Rule.AllAtLimit);
    }
    expect((await api.agents()).agents.map((agent) => agent.open_count)).toEqual([5, 5, 5]);
    expect(await countRows()).toEqual({ tickets: 20, decisions: 20 });
    expect((await api.tickets(`?status=${TicketStatus.Open}`)).tickets).toHaveLength(15);
    expect((await api.tickets(`?status=${TicketStatus.Unassigned}`)).tickets).toHaveLength(5);
  });

  it('gives one ticket row and one decision row for 10 assigns of one new ticket', async () => {
    for (const id of ['a1', 'a2', 'a3']) await addAgent({ id });

    const responses = await Promise.all(Array.from({ length: 10 }, () => api.assign('T-1')));

    const [first] = responses;
    for (const response of responses) expect(response).toEqual(first);
    expect(await countRows()).toEqual({ tickets: 1, decisions: 1 });
    const openCounts = (await api.agents()).agents.map((agent) => agent.open_count);
    expect(openCounts.reduce((sum, count) => sum + count, 0)).toBe(1);
  });

  it('decides an unassigned ticket again on each of two concurrent calls', async () => {
    const responses = await Promise.all([api.assign('T-1'), api.assign('T-1')]);

    expect(responses.map((response) => response.assigned)).toEqual([false, false]);
    expect(await countRows()).toEqual({ tickets: 1, decisions: 2 });
  });
});

describe('lock order', () => {
  // a1 holds X (assigned 10:00). a2 holds Z (assigned 09:00). Y is new.
  beforeEach(async () => {
    await addAgent({ id: 'a1' });
    await addAgent({ id: 'a2' });
    await addAssignedTicket({ ticketId: 'X', agent: 'a1', assignedAt: '2026-10-14T10:00:00Z' });
    await addAssignedTicket({ ticketId: 'Z', agent: 'a2', assignedAt: '2026-10-14T09:00:00Z' });
    clock.stepBy(1000);
  });

  const timesOf = async (): Promise<{ closedAt: string; assignedAt: string }> => {
    const { tickets } = await api.tickets();
    const closed = tickets.find((ticket) => ticket.ticket_id === 'X');
    const fresh = tickets.find((ticket) => ticket.ticket_id === 'Y');
    if (closed?.status !== TicketStatus.Closed || fresh?.status !== TicketStatus.Open) {
      throw new Error('expected X closed and Y open');
    }
    return { closedAt: closed.closed_at, assignedAt: fresh.assigned_at };
  };

  it('close(X) then assign(Y): the assign sees the close', async () => {
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);
    const closing = api.close('X');
    await waitForLockWaiters(1);
    const assigning = api.assign('Y');
    await waitForLockWaiters(2);
    expect(await countRows()).toEqual({ tickets: 2, decisions: 2 });

    barrier.open();
    await held.released;
    await closing;
    const response = assigned(await assigning);

    expect(response.agent.id).toBe('a1');
    expect(response.reason.selected).toMatchObject({ agent_id: 'a1', open: 0 });
    expect(response.reason.rejected).toEqual([
      { agent_id: 'a2', code: RejectionCode.MoreOpen, open: 1 },
    ]);
    const { closedAt, assignedAt } = await timesOf();
    expect(Date.parse(closedAt)).toBeLessThan(Date.parse(assignedAt));
    expect((await api.agents()).agents.map((agent) => agent.open_count)).toEqual([1, 1]);
  });

  it('assign(Y) then close(X): the assign counts X, and the close runs after it', async () => {
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);
    const assigning = api.assign('Y');
    await waitForLockWaiters(1);
    const closing = api.close('X');
    await waitForLockWaiters(2);

    barrier.open();
    await held.released;
    const response = assigned(await assigning);
    await closing;

    expect(response.agent.id).toBe('a2');
    expect(response.reason.selected).toMatchObject({ agent_id: 'a2', open: 1 });
    expect(response.reason.rejected).toEqual([
      {
        agent_id: 'a1',
        code: RejectionCode.AssignedMoreRecently,
        last_assigned_at: '2026-10-14T10:00:00Z',
      },
    ]);
    const { closedAt, assignedAt } = await timesOf();
    expect(Date.parse(assignedAt)).toBeLessThan(Date.parse(closedAt));
    expect((await api.agents()).agents.map((agent) => agent.open_count)).toEqual([0, 2]);
  });
});

describe('lock wait', () => {
  it('reads the clock after the lock, so a shift that ended during the wait does not count', async () => {
    await addAgent({ id: 'a1' });
    clock.set('2026-10-14T16:59:58Z');
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);
    const assigning = api.assign('T-1');
    await waitForLockWaiters(1);

    clock.set('2026-10-14T17:00:01Z');
    barrier.open();
    await held.released;
    const response = unassigned(await assigning);

    expect(response.reason).toEqual({
      rule: Rule.NoAgentOnShift,
      selected: null,
      rejected: [{ agent_id: 'a1', code: RejectionCode.NotOnShift }],
    });
  });

  it('answers 503 with Retry-After and writes nothing after a lock wait that is too long', async () => {
    await addAgent({ id: 'a1' });
    api = client(makeApp({ clock, lockTimeoutMs: SHORT_LOCK_TIMEOUT_MS }));
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);

    const reply = await api.send('post', '/api/companies/c1/assignments', { ticket_id: 'T-1' });
    barrier.open();
    await held.released;

    expect(errorOf(reply, 503).code).toBe(ErrorCode.LockTimeout);
    expect(reply.headers['retry-after']).toBe('1');
    expect(await countRows()).toEqual({ tickets: 0, decisions: 0 });
    expect(assigned(await api.assign('T-1')).agent.id).toBe('a1');
  });

  it('does not make another company wait', async () => {
    await addCompany({ id: 'c2' });
    await addAgent({ id: 'b1', companyId: 'c2' });
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);

    const response = assigned(await api.assign('T-1', 'c2'));
    barrier.open();
    await held.released;

    expect(response.agent.id).toBe('b1');
  });

  it('makes an agent edit wait for the lock and apply from the next decision', async () => {
    await addAgent({ id: 'a1' });
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);
    const assigning = api.assign('T-1');
    await waitForLockWaiters(1);
    const editing = api.updateAgent('a1', { timezone: 'UTC', ticket_limit: 1, shifts: DAY_SHIFT_BODY });
    await waitForLockWaiters(2);
    expect((await api.agents()).agents).toMatchObject([{ id: 'a1', ticket_limit: 5 }]);

    barrier.open();
    await held.released;
    const first = assigned(await assigning);
    const edited = await editing;

    expect(first.reason.selected).toMatchObject({ agent_id: 'a1', open: 0, limit: 5 });
    expect(edited).toMatchObject({ ticket_limit: 1, open_count: 1 });
    expect(unassigned(await api.assign('T-2')).reason.rule).toBe(Rule.AllAtLimit);
  });
});

describe('retry-all with one forced timeout', () => {
  it('lets the others succeed, names the failure, and leaves the failed row unchanged', async () => {
    clock.stepBy(60_000);
    for (const ticket of ['T-1', 'T-2', 'T-3']) unassigned(await api.assign(ticket));
    await addAgent({ id: 'a1' });
    const before = (await api.tickets()).tickets.find((ticket) => ticket.ticket_id === 'T-2');
    api = client(makeApp({ clock, lockTimeoutMs: SHORT_LOCK_TIMEOUT_MS }));
    const barrier = makeBarrier();
    const held = await holdTicketRowLock({ companyId: 'c1', ticketId: 'T-2' }, barrier.promise);

    const { results } = await api.retry({ all: true });
    barrier.open();
    await held.released;

    expect(results).toMatchObject([
      { outcome: 'ASSIGNED', ticket_id: 'T-1', agent: { id: 'a1' } },
      { outcome: 'FAILED', ticket_id: 'T-2', error: { code: ErrorCode.LockTimeout } },
      { outcome: 'ASSIGNED', ticket_id: 'T-3', agent: { id: 'a1' } },
    ]);
    const after = (await api.tickets()).tickets.find((ticket) => ticket.ticket_id === 'T-2');
    expect(after).toEqual(before);
    expect(after).toMatchObject({ status: TicketStatus.Unassigned, created_at: '2026-10-14T12:01:00Z' });
    expect(await countRows()).toEqual({ tickets: 3, decisions: 5 });

    const again = await api.retry({ all: true });
    expect(again.results).toMatchObject([{ outcome: 'ASSIGNED', ticket_id: 'T-2' }]);
    const final = (await api.tickets()).tickets.find((ticket) => ticket.ticket_id === 'T-2');
    expect(final).toMatchObject({ status: TicketStatus.Open, created_at: '2026-10-14T12:01:00Z' });
  });
});
