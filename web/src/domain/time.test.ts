import { describe, expect, it } from 'vitest';

import {
  clockTextToMinute,
  compareWindows,
  durationLabel,
  isClockText,
  minuteToClockText,
  shiftLabel,
  toLocalTime,
  weekdayName,
  WEEKDAYS_FROM_MONDAY,
  wrapsMidnight,
} from './time.ts';

describe('minute conversion', () => {
  it.each([
    ['00:00', 0],
    ['09:05', 545],
    ['18:30', 1110],
    ['23:59', 1439],
    ['24:00', 1440],
  ])('converts %s to minute %i and back', (text, minute) => {
    expect(clockTextToMinute(text)).toBe(minute);
    expect(minuteToClockText(minute)).toBe(text);
  });

  it('accepts only "HH:MM" up to 23:59 as clock text', () => {
    expect(isClockText('09:00')).toBe(true);
    expect(isClockText('23:59')).toBe(true);
    expect(isClockText('24:00')).toBe(false);
    expect(isClockText('9:00')).toBe(false);
    expect(isClockText('09:60')).toBe(false);
  });
});

describe('weekday names', () => {
  it('starts the week numbers at Sunday', () => {
    expect(weekdayName(0)).toBe('Sunday');
    expect(weekdayName(1)).toBe('Monday');
    expect(weekdayName(6)).toBe('Saturday');
  });

  it('shows a week from Monday to Sunday', () => {
    expect(WEEKDAYS_FROM_MONDAY.map(weekdayName)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });
});

describe('window order', () => {
  it('puts Monday first and Sunday last, then orders by start', () => {
    const windows = [
      { weekday: 0, start: '22:00', end: '06:00' },
      { weekday: 5, start: '10:00', end: '18:00' },
      { weekday: 1, start: '13:00', end: '17:00' },
      { weekday: 1, start: '09:00', end: '12:00' },
    ];

    expect(windows.toSorted(compareWindows).map(({ weekday, start }) => [weekday, start])).toEqual([
      [1, '09:00'],
      [1, '13:00'],
      [5, '10:00'],
      [0, '22:00'],
    ]);
  });
});

describe('shift label', () => {
  it('names one day for a shift that ends on the day it starts', () => {
    const shift = { weekday: 1, start: '09:00', end: '17:00' };

    expect(wrapsMidnight(shift)).toBe(false);
    expect(shiftLabel(shift)).toBe('Mon 09:00 to 17:00');
  });

  it('names the next day for a shift that wraps midnight', () => {
    const shift = { weekday: 1, start: '22:00', end: '06:00' };

    expect(wrapsMidnight(shift)).toBe(true);
    expect(shiftLabel(shift)).toBe('Mon 22:00 to Tue 06:00');
  });

  it('wraps from Saturday to Sunday', () => {
    expect(shiftLabel({ weekday: 6, start: '22:00', end: '06:00' })).toBe('Sat 22:00 to Sun 06:00');
  });
});

describe('local time of an instant', () => {
  const instant = '2026-10-17T13:00:00Z';

  it('reads the wall clock of New York', () => {
    expect(toLocalTime({ instant, timezone: 'America/New_York' })).toEqual({
      date: '2026-10-17',
      minute: 540,
      label: 'Sat 17 Oct, 09:00',
      clock: '09:00',
    });
  });

  it('reads the wall clock of Kolkata for the same instant', () => {
    expect(toLocalTime({ instant, timezone: 'Asia/Kolkata' })).toEqual({
      date: '2026-10-17',
      minute: 1110,
      label: 'Sat 17 Oct, 18:30',
      clock: '18:30',
    });
  });

  it('moves to the next local date after midnight', () => {
    const local = toLocalTime({ instant: '2026-10-17T20:00:00Z', timezone: 'Asia/Kolkata' });

    expect(local.date).toBe('2026-10-18');
    expect(local.clock).toBe('01:30');
  });

  it('reads midnight as minute 0', () => {
    const local = toLocalTime({ instant: '2026-10-12T04:00:00Z', timezone: 'America/New_York' });

    expect(local).toMatchObject({ date: '2026-10-12', minute: 0, clock: '00:00' });
  });
});

describe('duration label', () => {
  it.each([
    [30, '30 min'],
    [240, '4 h'],
    [90, '1 h 30 min'],
  ])('writes %i minutes as %s', (minutes, label) => {
    expect(durationLabel(minutes)).toBe(label);
  });
});
