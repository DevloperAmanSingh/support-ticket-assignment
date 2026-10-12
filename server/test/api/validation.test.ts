import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { UpdateAgentBody } from '../../../shared/api-types.ts';
import { ErrorCode, MAX_TICKET_LIMIT } from '../../../shared/codes.ts';
import { client, errorOf } from '../helpers/api.ts';
import type { Client } from '../helpers/api.ts';
import { FakeClock } from '../helpers/fakeClock.ts';
import type { CoverageHoursBody } from '../helpers/harness.ts';
import {
  addAgent,
  addCompany,
  closeDb,
  countRows,
  DAY_SHIFT_BODY,
  makeApp,
  NOON,
  resetDb,
} from '../helpers/harness.ts';
import { MONDAY, SATURDAY, SUNDAY, TUESDAY } from '../helpers/time.ts';

let api: Client;

beforeEach(async () => {
  await resetDb();
  api = client(makeApp({ clock: new FakeClock(NOON) }));
  await addCompany();
  await addAgent({ id: 'a1' });
});

afterAll(closeDb);

const validAgent: UpdateAgentBody = { timezone: 'UTC', ticket_limit: 5, shifts: DAY_SHIFT_BODY };

const putAgent = (body: object) => api.send('put', '/api/companies/c1/agents/a1', body);
const putHours = (hours: CoverageHoursBody | object[]) =>
  api.send('put', '/api/companies/c1/coverage-hours', { hours });

describe('400 VALIDATION_ERROR', () => {
  it.each([
    ['ticket_limit below 1', { ...validAgent, ticket_limit: 0 }],
    ['ticket_limit not a whole number', { ...validAgent, ticket_limit: 1.5 }],
    ['ticket_limit above the column maximum', { ...validAgent, ticket_limit: MAX_TICKET_LIMIT + 1 }],
    ['unknown IANA timezone', { ...validAgent, timezone: 'Mars/Olympus' }],
    ['start equal to end', { ...validAgent, shifts: [{ weekday: MONDAY, start: '09:00', end: '09:00' }] }],
    ['time not on a 5-minute step', { ...validAgent, shifts: [{ weekday: MONDAY, start: '09:03', end: '10:00' }] }],
    ['"24:00" as a shift end', { ...validAgent, shifts: [{ weekday: MONDAY, start: '09:00', end: '24:00' }] }],
    ['malformed time', { ...validAgent, shifts: [{ weekday: MONDAY, start: '9am', end: '10:00' }] }],
    ['weekday out of range', { ...validAgent, shifts: [{ weekday: 7, start: '09:00', end: '10:00' }] }],
    [
      'overlapping shifts',
      {
        ...validAgent,
        shifts: [
          { weekday: MONDAY, start: '09:00', end: '12:00' },
          { weekday: MONDAY, start: '11:00', end: '14:00' },
        ],
      },
    ],
    [
      'overlapping shifts through a wrap past midnight',
      {
        ...validAgent,
        shifts: [
          { weekday: MONDAY, start: '22:00', end: '06:00' },
          { weekday: TUESDAY, start: '05:00', end: '09:00' },
        ],
      },
    ],
    [
      'overlapping shifts through a wrap past the week end',
      {
        ...validAgent,
        shifts: [
          { weekday: SATURDAY, start: '22:00', end: '06:00' },
          { weekday: SUNDAY, start: '05:55', end: '09:00' },
        ],
      },
    ],
    ['missing fields', { timezone: 'UTC' }],
  ])('rejects an agent update with %s', async (_name, body) => {
    const reply = await putAgent(body);

    expect(errorOf(reply, 400).code).toBe(ErrorCode.ValidationError);
    expect((await api.agents()).agents).toMatchObject([
      { id: 'a1', timezone: 'UTC', ticket_limit: 5, shifts: DAY_SHIFT_BODY },
    ]);
  });

  it.each([
    ['overlapping ranges on one weekday', [
      { weekday: MONDAY, start: '09:00', end: '12:00' },
      { weekday: MONDAY, start: '11:55', end: '14:00' },
    ]],
    ['start equal to end', [{ weekday: MONDAY, start: '09:00', end: '09:00' }]],
    ['start after end', [{ weekday: MONDAY, start: '12:00', end: '09:00' }]],
    ['time not on a 5-minute step', [{ weekday: MONDAY, start: '09:00', end: '12:01' }]],
    ['"24:00" as a start', [{ weekday: MONDAY, start: '24:00', end: '24:00' }]],
  ])('rejects coverage hours with %s', async (_name, hours) => {
    const reply = await putHours(hours);

    expect(errorOf(reply, 400).code).toBe(ErrorCode.ValidationError);
    expect((await api.coverage('2026-10-12')).hours).toEqual([]);
  });

  it('rejects an assign body without ticket_id, and writes nothing', async () => {
    const reply = await api.send('post', '/api/companies/c1/assignments', {});

    expect(errorOf(reply, 400).code).toBe(ErrorCode.ValidationError);
    expect(await countRows()).toEqual({ tickets: 0, decisions: 0 });
  });

  it('rejects a body that is not JSON', async () => {
    const reply = await api.send('post', '/api/companies/c1/assignments', '{"ticket_id":');

    expect(errorOf(reply, 400).code).toBe(ErrorCode.ValidationError);
  });

  it('rejects a retry body that names neither a ticket nor all', async () => {
    const reply = await api.send('post', '/api/companies/c1/assignments/retry', { all: false });

    expect(errorOf(reply, 400).code).toBe(ErrorCode.ValidationError);
  });

  it('rejects a coverage week that is missing, malformed, or not a Monday', async () => {
    for (const query of ['', '?week=2026-10-13', '?week=12-10-2026', '?week=2026-02-30']) {
      const reply = await api.send('get', `/api/companies/c1/coverage${query}`);
      expect(errorOf(reply, 400).code).toBe(ErrorCode.ValidationError);
    }
  });

  it('rejects an unknown ticket status or order', async () => {
    for (const query of ['?status=lost', '?order=random']) {
      const reply = await api.send('get', `/api/companies/c1/tickets${query}`);
      expect(errorOf(reply, 400).code).toBe(ErrorCode.ValidationError);
    }
  });
});

describe('accepted edge values', () => {
  it('accepts touching shifts and a wrap that ends where the next shift starts', async () => {
    const shifts = [
      { weekday: MONDAY, start: '22:00', end: '06:00' },
      { weekday: TUESDAY, start: '06:00', end: '12:00' },
      { weekday: TUESDAY, start: '12:00', end: '00:00' },
    ];

    const updated = await api.updateAgent('a1', { timezone: 'Asia/Kathmandu', ticket_limit: 1, shifts });

    expect(updated).toMatchObject({ timezone: 'Asia/Kathmandu', ticket_limit: 1 });
    expect(updated.shifts).toEqual(expect.arrayContaining(shifts));
  });

  it('accepts a ticket_limit of 10001', async () => {
    const updated = await api.updateAgent('a1', { ...validAgent, ticket_limit: 10_001 });

    expect(updated.ticket_limit).toBe(10_001);
    expect((await api.agents()).agents).toMatchObject([{ id: 'a1', ticket_limit: 10_001 }]);
  });

  it('accepts a full day of coverage as "00:00" to "24:00", and an empty list restores every hour', async () => {
    const saved = await api.updateCoverageHours([
      { weekday: MONDAY, start: '00:00', end: '24:00' },
      { weekday: SUNDAY, start: '09:00', end: '12:00' },
      { weekday: SUNDAY, start: '12:00', end: '17:00' },
    ]);

    expect(saved.hours).toEqual([
      { weekday: SUNDAY, start: '09:00', end: '12:00' },
      { weekday: SUNDAY, start: '12:00', end: '17:00' },
      { weekday: MONDAY, start: '00:00', end: '24:00' },
    ]);
    expect((await api.updateCoverageHours([])).hours).toEqual([]);
  });
});

describe('404 for an unknown id', () => {
  it.each([
    ['post', '/api/companies/nope/assignments', { ticket_id: 'T-1' }],
    ['post', '/api/companies/nope/assignments/retry', { all: true }],
    ['post', '/api/companies/nope/tickets/T-1/close', undefined],
    ['get', '/api/companies/nope/agents', undefined],
    ['put', '/api/companies/nope/agents/a1', validAgent],
    ['get', '/api/companies/nope/coverage?week=2026-10-12', undefined],
    ['put', '/api/companies/nope/coverage-hours', { hours: [] }],
    ['get', '/api/companies/nope/tickets', undefined],
  ] as const)('%s %s: unknown company', async (method, path, body) => {
    const reply = await api.send(method, path, body);

    expect(errorOf(reply, 404).code).toBe(ErrorCode.CompanyNotFound);
  });

  it('unknown agent, and an agent of another company', async () => {
    await addCompany({ id: 'c2' });
    await addAgent({ id: 'b1', companyId: 'c2' });

    for (const agent of ['ghost', 'b1']) {
      const reply = await api.send('put', `/api/companies/c1/agents/${agent}`, {
        ...validAgent,
        ticket_limit: 9,
      });
      expect(errorOf(reply, 404).code).toBe(ErrorCode.AgentNotFound);
    }
    expect((await api.agents('c2')).agents).toMatchObject([{ id: 'b1', ticket_limit: 5 }]);
  });

  it('unknown ticket on close', async () => {
    const reply = await api.send('post', '/api/companies/c1/tickets/ghost/close');

    expect(errorOf(reply, 404).code).toBe(ErrorCode.TicketNotFound);
  });

  it('unknown route', async () => {
    const reply = await api.send('get', '/api/nothing');

    expect(errorOf(reply, 404).code).toBe(ErrorCode.RouteNotFound);
  });
});
