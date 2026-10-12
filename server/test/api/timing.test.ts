import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../shared/codes.ts';
import { assigned, client, errorOf } from '../helpers/api.ts';
import { FakeClock } from '../helpers/fakeClock.ts';
import {
  addAgent, addCompany, closeDb, countRows, db, holdCompanyLock,
  makeApp, makeBarrier, NOON, resetDb, waitForLockWaiters,
} from '../helpers/harness.ts';

const api = client(makeApp({ clock: new FakeClock(NOON) }));
const assign = () => api.send('post', '/api/companies/c1/assignments', { ticket_id: 'T-1' });

beforeEach(async () => {
  await resetDb();
  await addCompany();
  await addAgent({ id: 'a1' });
});
afterAll(closeDb);

describe('production wait budget', () => {
  it('returns 503 within one second using the production default and writes nothing', async () => {
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);
    try {
      const start = performance.now();
      const reply = await assign();
      expect(performance.now() - start).toBeLessThan(1000);
      expect(errorOf(reply, 503).code).toBe(ErrorCode.LockTimeout);
      expect(reply.headers['retry-after']).toBe('1');
      expect(await countRows()).toEqual({ tickets: 0, decisions: 0 });
    } finally {
      barrier.open();
      await held.released;
    }
    expect(assigned(await api.assign('T-1')).agent.id).toBe('a1');
  });

  it('assigns within one second after waiting behind another transaction', async () => {
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);
    const start = performance.now();
    const pending = api.assign('T-1');
    try {
      await waitForLockWaiters(1);
      await delay(150);
    } finally {
      barrier.open();
      await held.released;
    }
    expect(assigned(await pending).agent.id).toBe('a1');
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('returns a retryable 503 within one second when every pool connection is occupied', async () => {
    const connections = await Promise.all(Array.from({ length: 10 }, () => db.sequelize.transaction()));
    try {
      const start = performance.now();
      const reply = await assign();
      expect(performance.now() - start).toBeLessThan(1000);
      expect(errorOf(reply, 503).code).toBe(ErrorCode.LockTimeout);
      expect(reply.headers['retry-after']).toBe('1');
    } finally {
      await Promise.all(connections.map((tx) => tx.rollback()));
    }
    expect(await countRows()).toEqual({ tickets: 0, decisions: 0 });
    expect(assigned(await api.assign('T-1')).agent.id).toBe('a1');
  });

  it('deducts time spent waiting for a connection from the subsequent lock wait', async () => {
    const barrier = makeBarrier();
    const held = await holdCompanyLock('c1', barrier.promise);
    const connections = await Promise.all(Array.from({ length: 10 }, () => db.sequelize.transaction()));
    const releaseConnections = async () => {
      await delay(500);
      await Promise.all(connections.map((tx) => tx.rollback()));
    };
    const releasing = releaseConnections();
    try {
      const start = performance.now();
      const reply = await assign();
      expect(performance.now() - start).toBeLessThan(1000);
      expect(errorOf(reply, 503).code).toBe(ErrorCode.LockTimeout);
      expect(await countRows()).toEqual({ tickets: 0, decisions: 0 });
    } finally {
      await releasing;
      barrier.open();
      await held.released;
    }
  });
});
