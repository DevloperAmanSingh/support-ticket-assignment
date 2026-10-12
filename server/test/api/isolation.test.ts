import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RejectionCode } from '../../../shared/codes.ts';
import { assigned, client } from '../helpers/api.ts';
import { FakeClock } from '../helpers/fakeClock.ts';
import {
  addAgent,
  addCompany,
  appDefaultIsolation,
  closeDb,
  holdCompanyLockThenAddOpenTicket,
  makeApp,
  makeBarrier,
  NOON,
  REPEATABLE_READ,
  resetDb,
  setDefaultIsolation,
  waitForLockWaiters,
} from '../helpers/harness.ts';

// This file changes a setting of the test database, so that every connection the application
// opens here starts its transactions at REPEATABLE READ. It puts the setting back at the end.
beforeAll(() => setDefaultIsolation(REPEATABLE_READ));

beforeEach(resetDb);

afterAll(async () => {
  await setDefaultIsolation(null);
  await closeDb();
});

describe('isolation level', () => {
  it('decides at READ COMMITTED on a REPEATABLE READ connection, and sees a ticket committed during the lock wait', async () => {
    expect(await appDefaultIsolation()).toBe(REPEATABLE_READ);
    const api = client(makeApp({ clock: new FakeClock(NOON) }));
    await addCompany();
    await addAgent({ id: 'a1' });
    await addAgent({ id: 'a2' });
    const barrier = makeBarrier();
    const held = await holdCompanyLockThenAddOpenTicket({
      companyId: 'c1',
      barrier: barrier.promise,
      ticketId: 'X',
      agent: 'a1',
      assignedAt: '2026-10-14T11:00:00Z',
    });
    const assigning = api.assign('T-1');
    await waitForLockWaiters(1);

    barrier.open();
    await held.released;
    const response = assigned(await assigning);

    expect(response.agent.id).toBe('a2');
    expect(response.reason.selected).toMatchObject({ agent_id: 'a2', open: 0 });
    expect(response.reason.rejected).toEqual([
      { agent_id: 'a1', code: RejectionCode.MoreOpen, open: 1 },
    ]);
    expect((await api.agents()).agents.map((agent) => agent.open_count)).toEqual([1, 1]);
  });
});
