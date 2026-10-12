import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { collectBoundaries, computeCoverage, weekBounds } from '../../src/domain/coverage.ts';
import type { CoverageAgent, Interval } from '../../src/domain/coverage.ts';
import { formatInstant, isOnShift } from '../../src/domain/time.ts';
import type { WeeklyWindow } from '../../src/domain/time.ts';
import { agentId } from '../helpers/ids.ts';
import { MONDAY, SUNDAY, window } from '../helpers/time.ts';

function coverage({
  week,
  timezone,
  hours = [],
  agents,
}: {
  week: string;
  timezone: string;
  hours?: WeeklyWindow[];
  agents: CoverageAgent[];
}) {
  const { start, end } = weekBounds({ week, timezone });
  return computeCoverage({ weekStart: start, weekEnd: end, timezone, hours, agents });
}

function agent(id: string, timezone: string, ...shifts: WeeklyWindow[]): CoverageAgent {
  return { id: agentId(id), name: id.toUpperCase(), timezone, shifts };
}

const texts = (intervals: readonly Interval[]): string[][] =>
  intervals.map((interval) => [formatInstant(interval.start), formatInstant(interval.end)]);

const utc = (intervals: readonly Interval[]): string[][] =>
  intervals.map((interval) => [
    formatInstant(interval.start.toUTC()),
    formatInstant(interval.end.toUTC()),
  ]);

const hoursBetween = ({ start, end }: Interval): number => end.diff(start, 'hours').hours;

describe('coverage', () => {
  it('finds the one gap between two shifts', () => {
    const report = coverage({
      week: '2026-10-12',
      timezone: 'UTC',
      hours: [window(MONDAY, '09:00', '11:00')],
      agents: [agent('a1', 'UTC', window(MONDAY, '09:00', '09:30'), window(MONDAY, '10:00', '11:00'))],
    });
    expect(texts(report.gaps)).toEqual([['2026-10-12T09:30:00Z', '2026-10-12T10:00:00Z']]);
  });

  it('finds no gap when the shifts fill the coverage hours', () => {
    const report = coverage({
      week: '2026-10-12',
      timezone: 'UTC',
      hours: [window(MONDAY, '09:00', '11:00')],
      agents: [
        agent('a1', 'UTC', window(MONDAY, '08:00', '10:00')),
        agent('a2', 'UTC', window(MONDAY, '10:00', '12:00')),
      ],
    });
    expect(report.gaps).toEqual([]);
  });

  it('makes the whole week one gap when there are no agents', () => {
    const report = coverage({ week: '2026-10-12', timezone: 'Asia/Kolkata', agents: [] });
    expect(texts(report.gaps)).toEqual([
      ['2026-10-12T00:00:00+05:30', '2026-10-19T00:00:00+05:30'],
    ]);
    expect(report.agents).toEqual([]);
  });

  it('counts overlapping shifts of one agent once', () => {
    const report = coverage({
      week: '2026-10-12',
      timezone: 'UTC',
      hours: [window(MONDAY, '09:00', '14:00')],
      agents: [agent('a1', 'UTC', window(MONDAY, '09:00', '12:00'), window(MONDAY, '11:00', '14:00'))],
    });
    expect(texts(report.agents[0]?.intervals ?? [])).toEqual([
      ['2026-10-12T09:00:00Z', '2026-10-12T14:00:00Z'],
    ]);
    expect(report.gaps).toEqual([]);
  });

  it('ends a gap at the exact instant of a Kathmandu 09:45 shift start', () => {
    const report = coverage({
      week: '2026-10-12',
      timezone: 'UTC',
      agents: [agent('a1', 'Asia/Kathmandu', window(MONDAY, '09:45', '17:45'))],
    });
    expect(utc(report.gaps)[0]).toEqual(['2026-10-12T00:00:00Z', '2026-10-12T04:00:00Z']);
    expect(texts(report.agents[0]?.intervals ?? [])).toEqual([
      ['2026-10-12T09:45:00+05:45', '2026-10-12T17:45:00+05:45'],
    ]);
  });
});

describe('coverage across DST', () => {
  it('starts a 02:15 to 03:15 shift at the 03:00 jump', () => {
    const report = coverage({
      week: '2026-03-02',
      timezone: 'America/New_York',
      agents: [agent('a1', 'America/New_York', window(SUNDAY, '02:15', '03:15'))],
    });
    expect(texts(report.agents[0]?.intervals ?? [])).toEqual([
      ['2026-03-08T03:00:00-04:00', '2026-03-08T03:15:00-04:00'],
    ]);
  });

  it('gives one real hour for a 01:00 to 03:00 shift on a spring-forward night', () => {
    const report = coverage({
      week: '2026-03-02',
      timezone: 'America/New_York',
      agents: [agent('a1', 'America/New_York', window(SUNDAY, '01:00', '03:00'))],
    });
    const intervals = report.agents[0]?.intervals ?? [];
    expect(intervals).toHaveLength(1);
    expect(intervals.map(hoursBetween)).toEqual([1]);
  });

  it('makes a 00:30 to 01:30 shift active again at the repeated 01:00', () => {
    const report = coverage({
      week: '2026-10-19',
      timezone: 'Europe/London',
      agents: [agent('a1', 'Europe/London', window(SUNDAY, '00:30', '01:30'))],
    });
    expect(texts(report.agents[0]?.intervals ?? [])).toEqual([
      ['2026-10-25T00:30:00+01:00', '2026-10-25T01:30:00+01:00'],
      ['2026-10-25T01:00:00+00:00', '2026-10-25T01:30:00+00:00'],
    ]);
  });

  it('gives two passes with a gap between for a 01:15 to 01:45 shift on a fall-back night', () => {
    const report = coverage({
      week: '2026-10-26',
      timezone: 'America/New_York',
      hours: [window(SUNDAY, '01:00', '02:00')],
      agents: [agent('a1', 'America/New_York', window(SUNDAY, '01:15', '01:45'))],
    });
    expect(texts(report.agents[0]?.intervals ?? [])).toEqual([
      ['2026-11-01T01:15:00-04:00', '2026-11-01T01:45:00-04:00'],
      ['2026-11-01T01:15:00-05:00', '2026-11-01T01:45:00-05:00'],
    ]);
    expect(texts(report.gaps)).toEqual([
      ['2026-11-01T01:00:00-04:00', '2026-11-01T01:15:00-04:00'],
      ['2026-11-01T01:45:00-04:00', '2026-11-01T01:15:00-05:00'],
      ['2026-11-01T01:45:00-05:00', '2026-11-01T02:00:00-05:00'],
    ]);
  });

  it('measures weeks of 167, 169, and 167.5 hours', () => {
    expect(hoursBetween(weekBounds({ week: '2026-03-02', timezone: 'America/New_York' }))).toBe(167);
    expect(hoursBetween(weekBounds({ week: '2026-10-26', timezone: 'America/New_York' }))).toBe(169);
    expect(hoursBetween(weekBounds({ week: '2026-09-28', timezone: 'Australia/Lord_Howe' }))).toBe(
      167.5,
    );
    expect(hoursBetween(weekBounds({ week: '2026-10-12', timezone: 'UTC' }))).toBe(168);
  });

  it.each([
    { week: '2026-03-02', timezone: 'America/New_York' },
    { week: '2026-10-26', timezone: 'America/New_York' },
    { week: '2026-03-23', timezone: 'Europe/London' },
    { week: '2026-10-19', timezone: 'Europe/London' },
    { week: '2026-09-28', timezone: 'Australia/Lord_Howe' },
  ])('agrees with the on-shift rule at every boundary instant ($week, $timezone)', (company) => {
    const agents = [
      agent('a1', 'America/New_York', window(SUNDAY, '02:15', '03:15'), window(SUNDAY, '01:15', '01:45')),
      agent('a2', 'Europe/London', window(SUNDAY, '00:30', '01:30'), window(MONDAY, '22:00', '06:00')),
      agent('a3', 'Australia/Lord_Howe', window(SUNDAY, '01:45', '02:20'), window(SUNDAY, '23:00', '01:00')),
      agent('a4', 'Asia/Kathmandu', window(MONDAY, '09:45', '17:45')),
    ];
    const { start, end } = weekBounds(company);
    const input = { weekStart: start, weekEnd: end, timezone: company.timezone, hours: [], agents };
    const boundaries = collectBoundaries(input);
    const report = computeCoverage(input);

    expect(boundaries[0]).toBe(start.toMillis());
    expect(boundaries.at(-1)).toBe(end.toMillis());
    for (const boundary of boundaries.slice(0, -1)) {
      const now = DateTime.fromMillis(boundary, { zone: 'utc' });
      const working = agents.filter((entry) =>
        isOnShift({ now, timezone: entry.timezone, shifts: entry.shifts }),
      );
      for (const entry of agents) {
        const intervals = report.agents.find((row) => row.agent.id === entry.id)?.intervals ?? [];
        const inInterval = intervals.some(
          (interval) => interval.start.toMillis() <= boundary && boundary < interval.end.toMillis(),
        );
        expect(inInterval, `${entry.id} at ${formatInstant(now)}`).toBe(working.includes(entry));
      }
      const inGap = report.gaps.some(
        (gap) => gap.start.toMillis() <= boundary && boundary < gap.end.toMillis(),
      );
      expect(inGap, `gap at ${formatInstant(now)}`).toBe(working.length === 0);
    }
  });
});
