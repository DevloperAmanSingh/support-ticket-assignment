import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { client } from '../helpers/api.ts';
import type { Client } from '../helpers/api.ts';
import { FakeClock } from '../helpers/fakeClock.ts';
import { addAgent, addCompany, closeDb, makeApp, NOON, resetDb } from '../helpers/harness.ts';
import { MONDAY, SATURDAY, SUNDAY, window } from '../helpers/time.ts';

let api: Client;

beforeEach(async () => {
  await resetDb();
  api = client(makeApp({ clock: new FakeClock(NOON) }));
});

afterAll(closeDb);

describe('coverage view', () => {
  it('shows the exact gap between two shifts inside coverage hours', async () => {
    await addCompany({ timezone: 'Asia/Kolkata' });
    await addAgent({
      id: 'a1',
      timezone: 'Asia/Kolkata',
      shifts: [window(MONDAY, '09:00', '09:30'), window(MONDAY, '10:00', '11:00')],
    });
    await api.updateCoverageHours([{ weekday: MONDAY, start: '09:00', end: '11:00' }]);

    const view = await api.coverage('2026-10-12');

    expect(view).toEqual({
      timezone: 'Asia/Kolkata',
      week_start: '2026-10-12T00:00:00+05:30',
      week_end: '2026-10-19T00:00:00+05:30',
      hours: [{ weekday: MONDAY, start: '09:00', end: '11:00' }],
      gaps: [{ start: '2026-10-12T09:30:00+05:30', end: '2026-10-12T10:00:00+05:30' }],
      agents: [
        {
          agent_id: 'a1',
          name: 'A1',
          timezone: 'Asia/Kolkata',
          intervals: [
            { start: '2026-10-12T09:00:00+05:30', end: '2026-10-12T09:30:00+05:30' },
            { start: '2026-10-12T10:00:00+05:30', end: '2026-10-12T11:00:00+05:30' },
          ],
        },
      ],
    });
  });

  it('changes the gaps when the coverage hours change', async () => {
    await addCompany();
    await addAgent({ id: 'a1', shifts: [window(MONDAY, '09:00', '17:00')] });
    await api.updateCoverageHours([{ weekday: MONDAY, start: '09:00', end: '17:00' }]);
    expect((await api.coverage('2026-10-12')).gaps).toEqual([]);

    await api.updateCoverageHours([
      { weekday: MONDAY, start: '09:00', end: '17:00' },
      { weekday: SATURDAY, start: '10:00', end: '14:00' },
    ]);

    expect((await api.coverage('2026-10-12')).gaps).toEqual([
      { start: '2026-10-17T10:00:00Z', end: '2026-10-17T14:00:00Z' },
    ]);
  });

  it('makes the whole week one gap for a company with no agents', async () => {
    await addCompany({ timezone: 'America/New_York' });

    const view = await api.coverage('2026-10-26');

    expect(view.agents).toEqual([]);
    expect(view.gaps).toEqual([
      { start: '2026-10-26T00:00:00-04:00', end: '2026-11-02T00:00:00-05:00' },
    ]);
  });

  it('gives one real hour and one interval for a 01:00 to 03:00 shift on a spring-forward night', async () => {
    await addCompany({ timezone: 'America/New_York' });
    await addAgent({
      id: 'a1',
      timezone: 'America/New_York',
      shifts: [window(SUNDAY, '01:00', '03:00')],
    });

    const view = await api.coverage('2026-03-02');

    expect(view.agents[0]?.intervals).toEqual([
      { start: '2026-03-08T01:00:00-05:00', end: '2026-03-08T03:00:00-04:00' },
    ]);
    expect(Date.parse('2026-03-08T03:00:00-04:00') - Date.parse('2026-03-08T01:00:00-05:00')).toBe(
      3_600_000,
    );
  });

  it('gives two intervals with different offsets and a gap between for a fall-back night', async () => {
    await addCompany({ timezone: 'America/New_York' });
    await addAgent({
      id: 'a1',
      timezone: 'America/New_York',
      shifts: [window(SUNDAY, '01:15', '01:45')],
    });
    await api.updateCoverageHours([{ weekday: SUNDAY, start: '01:15', end: '01:45' }]);

    const view = await api.coverage('2026-10-26');

    expect(view.agents[0]?.intervals).toEqual([
      { start: '2026-11-01T01:15:00-04:00', end: '2026-11-01T01:45:00-04:00' },
      { start: '2026-11-01T01:15:00-05:00', end: '2026-11-01T01:45:00-05:00' },
    ]);
    expect(view.gaps).toEqual([]);
  });

  it('shows an agent of another timezone with the offset of that agent', async () => {
    await addCompany();
    await addAgent({
      id: 'a1',
      timezone: 'Asia/Kathmandu',
      shifts: [window(MONDAY, '09:45', '17:45')],
    });

    const view = await api.coverage('2026-10-12');

    expect(view.agents[0]?.intervals).toEqual([
      { start: '2026-10-12T09:45:00+05:45', end: '2026-10-12T17:45:00+05:45' },
    ]);
    expect(view.gaps).toEqual([
      { start: '2026-10-12T00:00:00Z', end: '2026-10-12T04:00:00Z' },
      { start: '2026-10-12T12:00:00Z', end: '2026-10-19T00:00:00Z' },
    ]);
  });
});
