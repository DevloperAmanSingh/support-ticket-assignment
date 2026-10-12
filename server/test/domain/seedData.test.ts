import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { acmeGapWeekday, buildSampleData, lastAcmeGapDay } from '../../src/db/seedData.ts';
import type { SeedCompany } from '../../src/db/seedData.ts';
import { computeCoverage } from '../../src/domain/coverage.ts';
import { hasOverlap, isOnShift } from '../../src/domain/time.ts';
import { TIME_STEP_MINUTES } from '../../../shared/time.ts';
import { at, SATURDAY, SUNDAY } from '../helpers/time.ts';

const ON_SHIFT = ['a1', 'a2', 'a3', 'a5'];
const OFF_SHIFT = ['a4', 'a6', 'a7'];
/** The demo shift holds for at least this long after the seed. */
const DEMO_HOURS = 5;
const GAP_HOURS = 4;

/**
 * Three weeks of instants, 97 minutes apart, so they fall on every weekday at every time of day.
 * The weeks hold the end of daylight saving in London (25 October) and in New York (1 November).
 */
const SWEEP_START = at('2026-10-19T00:00:00Z');
const SWEEP_STEP_MINUTES = 97;
const SWEEP_COUNT = 312;
const SWEEP = Array.from({ length: SWEEP_COUNT }, (_, index) =>
  SWEEP_START.plus({ minutes: index * SWEEP_STEP_MINUTES }),
);

function acmeAt(now: DateTime): SeedCompany {
  const acme = buildSampleData(now).find((company) => company.id === 'acme');
  if (acme === undefined) throw new Error('The sample data has no Acme');
  return acme;
}

function onShiftIds({ company, now }: { company: SeedCompany; now: DateTime }): string[] {
  return company.agents
    .filter((agent) => isOnShift({ now, timezone: agent.timezone, shifts: agent.shifts }))
    .map((agent) => agent.id);
}

describe('sample data at any instant', () => {
  it('has two companies, with seven and five agents, each across three timezones', () => {
    const [acme, globex] = buildSampleData(at('2026-10-14T15:00:00Z'));

    expect(acme?.agents.map((agent) => agent.name)).toEqual([
      'Priya',
      'Sam',
      'Lee',
      'Rahul',
      'Emma',
      'Aisha',
      'Carlos',
    ]);
    expect(globex?.agents).toHaveLength(5);
    for (const company of [acme, globex]) {
      expect(new Set(company?.agents.map((agent) => agent.timezone)).size).toBe(3);
    }
  });

  it('keeps the same four Acme agents on shift at the seed and five hours later', () => {
    for (const now of SWEEP) {
      const acme = acmeAt(now);

      expect(onShiftIds({ company: acme, now }), now.toISO() ?? '').toEqual(ON_SHIFT);
      expect(
        onShiftIds({ company: acme, now: now.plus({ hours: DEMO_HOURS }) }),
        now.toISO() ?? '',
      ).toEqual(ON_SHIFT);
      expect(acme.agents.map((agent) => agent.id)).toEqual(
        [...ON_SHIFT, ...OFF_SHIFT].toSorted(),
      );
    }
  });

  it('gives every agent shifts that the agent update accepts', () => {
    for (const now of SWEEP) {
      for (const agent of buildSampleData(now).flatMap((company) => company.agents)) {
        const label = `${agent.name} at ${now.toISO() ?? ''}`;
        expect(hasOverlap(agent.shifts), label).toBe(false);
        for (const shift of agent.shifts) {
          expect(shift.startMinute, label).not.toBe(shift.endMinute);
          expect(shift.startMinute % TIME_STEP_MINUTES, label).toBe(0);
          expect(shift.endMinute % TIME_STEP_MINUTES, label).toBe(0);
        }
      }
    }
  });

  it('leaves one coverage gap in the Acme week, four hours on a day that is not today', () => {
    for (const now of SWEEP) {
      const acme = acmeAt(now);
      const weekStart = now.setZone(acme.timezone).startOf('week');

      const { gaps } = computeCoverage({
        weekStart,
        weekEnd: weekStart.plus({ weeks: 1 }),
        timezone: acme.timezone,
        hours: acme.hours,
        agents: acme.agents,
      });

      const label = now.toISO() ?? '';
      expect(gaps, label).toHaveLength(1);
      const [gap] = gaps;
      if (gap === undefined) throw new Error('The week has no gap');
      expect(gap.end.diff(gap.start).as('hours'), label).toBe(GAP_HOURS);
      expect(gap.start.weekday % 7, label).toBe(acmeGapWeekday(now));
      expect(gap.start.hasSame(now.setZone(acme.timezone), 'day'), label).toBe(false);
    }
  });

  it('puts the gap on Saturday, or on Sunday when the seed runs on a Saturday', () => {
    expect(acmeGapWeekday(at('2026-10-14T15:00:00Z'))).toBe(SATURDAY);
    expect(acmeGapWeekday(at('2026-10-18T05:00:00Z'))).toBe(SATURDAY);
    expect(acmeGapWeekday(at('2026-10-17T14:00:00Z'))).toBe(SUNDAY);
  });

  it('finds the last gap day before today, with nobody on shift in its coverage hours', () => {
    for (const now of SWEEP) {
      const acme = acmeAt(now);
      const gapDay = lastAcmeGapDay(now);
      const label = now.toISO() ?? '';

      expect(gapDay < now.setZone(acme.timezone).startOf('day'), label).toBe(true);
      expect(gapDay.weekday % 7, label).toBe(acmeGapWeekday(now));
      for (const hour of [9, 10, 11, 12]) {
        expect(onShiftIds({ company: acme, now: gapDay.set({ hour }) }), label).toEqual([]);
      }
    }
  });

  it('gives the same data for the same instant', () => {
    const now = DateTime.fromISO('2026-10-15T03:30:00Z', { setZone: true });

    expect(buildSampleData(now)).toEqual(buildSampleData(now));
  });
});
