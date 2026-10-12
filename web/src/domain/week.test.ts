import { describe, expect, it } from 'vitest';

import {
  daysBetween,
  parseWeekStart,
  shiftWeek,
  weekDays,
  weekLabel,
  weekStartOf,
  WeekStartSchema,
} from './week.ts';

const WEEK = WeekStartSchema.parse('2026-10-12');

describe('week start', () => {
  it('finds the Monday of a Wednesday', () => {
    const instant = new Date('2026-10-14T15:00:00Z');

    expect(weekStartOf({ instant, timezone: 'America/New_York' })).toBe('2026-10-12');
  });

  it('uses the calendar of the timezone, not UTC', () => {
    // Monday 02:00 UTC is still Sunday evening in New York and already Monday in Kolkata.
    const instant = new Date('2026-10-12T02:00:00Z');

    expect(weekStartOf({ instant, timezone: 'America/New_York' })).toBe('2026-10-05');
    expect(weekStartOf({ instant, timezone: 'Asia/Kolkata' })).toBe('2026-10-12');
  });

  it('keeps a Monday as its own week', () => {
    const instant = new Date('2026-10-12T12:00:00Z');

    expect(weekStartOf({ instant, timezone: 'America/New_York' })).toBe('2026-10-12');
  });

  it('reads a Monday from a URL and nothing else', () => {
    expect(parseWeekStart('2026-10-12')).toBe('2026-10-12');
    expect(parseWeekStart('2026-10-13')).toBeNull();
    expect(parseWeekStart('next week')).toBeNull();
    expect(parseWeekStart(null)).toBeNull();
  });
});

describe('week navigation', () => {
  it('moves one week forward and back', () => {
    expect(shiftWeek({ week: WEEK, weeks: 1 })).toBe('2026-10-19');
    expect(shiftWeek({ week: WEEK, weeks: -1 })).toBe('2026-10-05');
  });

  it('crosses a month and a year', () => {
    expect(shiftWeek({ week: WeekStartSchema.parse('2026-12-28'), weeks: 1 })).toBe('2027-01-04');
  });

  it('lists the seven days from Monday with the wire weekday numbers', () => {
    const days = weekDays(WEEK);

    expect(days.map((day) => day.label)).toEqual([
      'Mon 12 Oct',
      'Tue 13 Oct',
      'Wed 14 Oct',
      'Thu 15 Oct',
      'Fri 16 Oct',
      'Sat 17 Oct',
      'Sun 18 Oct',
    ]);
    expect(days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('labels a week by its first and last day', () => {
    expect(weekLabel(WEEK)).toBe('12 Oct to 18 Oct 2026');
  });

  it('counts the days between two dates', () => {
    expect(daysBetween({ from: '2026-10-12', to: '2026-10-17' })).toBe(5);
    expect(daysBetween({ from: '2026-10-12', to: '2026-10-11' })).toBe(-1);
  });
});
