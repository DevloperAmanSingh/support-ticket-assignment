import { describe, expect, it } from 'vitest';

import {
  clockTextToMinute,
  isMondayDate,
  isValidTimezone,
  minuteToClockText,
} from '../../../shared/time.ts';
import { hasOverlap, isOnShift } from '../../src/domain/time.ts';
import { at, MONDAY, SATURDAY, SUNDAY, TUESDAY, window } from '../helpers/time.ts';

const onShift = (iso: string, timezone: string, ...shifts: ReturnType<typeof window>[]): boolean =>
  isOnShift({ now: at(iso), timezone, shifts });

describe('on-shift rule', () => {
  const day = window(MONDAY, '09:00', '17:00');

  it('is on shift at the exact start', () => {
    expect(onShift('2026-10-12T09:00:00Z', 'UTC', day)).toBe(true);
    expect(onShift('2026-10-12T08:59:59Z', 'UTC', day)).toBe(false);
  });

  it('is not on shift at the exact end', () => {
    expect(onShift('2026-10-12T16:59:59Z', 'UTC', day)).toBe(true);
    expect(onShift('2026-10-12T17:00:00Z', 'UTC', day)).toBe(false);
  });

  it('follows a wrap-around shift before and after midnight', () => {
    const night = window(MONDAY, '22:00', '06:00');
    expect(onShift('2026-10-12T21:59:00Z', 'UTC', night)).toBe(false);
    expect(onShift('2026-10-12T22:00:00Z', 'UTC', night)).toBe(true);
    expect(onShift('2026-10-12T23:59:00Z', 'UTC', night)).toBe(true);
    expect(onShift('2026-10-13T02:00:00Z', 'UTC', night)).toBe(true);
    expect(onShift('2026-10-13T06:00:00Z', 'UTC', night)).toBe(false);
  });

  it('keeps a wrap-around shift on its start weekday only', () => {
    const night = window(MONDAY, '22:00', '06:00');
    expect(onShift('2026-10-12T02:00:00Z', 'UTC', night)).toBe(false);
    expect(onShift('2026-10-13T22:30:00Z', 'UTC', night)).toBe(false);
  });

  it('wraps from Saturday into Sunday', () => {
    const night = window(SATURDAY, '22:00', '06:00');
    expect(onShift('2026-10-18T02:00:00Z', 'UTC', night)).toBe(true);
  });

  it('checks each agent on their own local weekday and clock', () => {
    const instant = '2026-10-13T02:00:00Z';
    // New York: Monday 22:00. Kolkata: Tuesday 07:30.
    expect(onShift(instant, 'America/New_York', window(MONDAY, '21:00', '23:00'))).toBe(true);
    expect(onShift(instant, 'America/New_York', window(TUESDAY, '21:00', '23:00'))).toBe(false);
    expect(onShift(instant, 'Asia/Kolkata', window(TUESDAY, '07:00', '08:00'))).toBe(true);
    expect(onShift(instant, 'Asia/Kolkata', window(MONDAY, '07:00', '08:00'))).toBe(false);
  });
});

describe('on-shift rule across DST', () => {
  it('America/New_York: a start inside the missing hour begins at the jump', () => {
    const shift = window(SUNDAY, '02:15', '03:15');
    expect(onShift('2026-03-08T06:59:59Z', 'America/New_York', shift)).toBe(false);
    expect(onShift('2026-03-08T07:00:00Z', 'America/New_York', shift)).toBe(true);
    expect(onShift('2026-03-08T07:14:59Z', 'America/New_York', shift)).toBe(true);
    expect(onShift('2026-03-08T07:15:00Z', 'America/New_York', shift)).toBe(false);
  });

  it('America/New_York: an end inside the missing hour stops at the jump', () => {
    const shift = window(SUNDAY, '01:30', '02:30');
    expect(onShift('2026-03-08T06:30:00Z', 'America/New_York', shift)).toBe(true);
    expect(onShift('2026-03-08T06:59:59Z', 'America/New_York', shift)).toBe(true);
    expect(onShift('2026-03-08T07:00:00Z', 'America/New_York', shift)).toBe(false);
  });

  it('America/New_York: endpoints inside the repeated hour are on shift both times', () => {
    const shift = window(SUNDAY, '01:15', '01:45');
    expect(onShift('2026-11-01T05:14:59Z', 'America/New_York', shift)).toBe(false);
    expect(onShift('2026-11-01T05:15:00Z', 'America/New_York', shift)).toBe(true);
    expect(onShift('2026-11-01T05:45:00Z', 'America/New_York', shift)).toBe(false);
    expect(onShift('2026-11-01T06:15:00Z', 'America/New_York', shift)).toBe(true);
    expect(onShift('2026-11-01T06:45:00Z', 'America/New_York', shift)).toBe(false);
  });

  it('Europe/London: a start inside the missing hour begins at the jump', () => {
    const shift = window(SUNDAY, '01:15', '02:15');
    expect(onShift('2026-03-29T00:59:59Z', 'Europe/London', shift)).toBe(false);
    expect(onShift('2026-03-29T01:00:00Z', 'Europe/London', shift)).toBe(true);
    expect(onShift('2026-03-29T01:15:00Z', 'Europe/London', shift)).toBe(false);
  });

  it('Europe/London: an end inside the missing hour stops at the jump', () => {
    const shift = window(SUNDAY, '00:30', '01:30');
    expect(onShift('2026-03-29T00:30:00Z', 'Europe/London', shift)).toBe(true);
    expect(onShift('2026-03-29T01:00:00Z', 'Europe/London', shift)).toBe(false);
  });

  it('Europe/London: endpoints inside the repeated hour are on shift both times', () => {
    const shift = window(SUNDAY, '01:15', '01:45');
    expect(onShift('2026-10-25T00:15:00Z', 'Europe/London', shift)).toBe(true);
    expect(onShift('2026-10-25T00:45:00Z', 'Europe/London', shift)).toBe(false);
    expect(onShift('2026-10-25T01:15:00Z', 'Europe/London', shift)).toBe(true);
    expect(onShift('2026-10-25T01:45:00Z', 'Europe/London', shift)).toBe(false);
  });
});

describe('overlap', () => {
  it('finds two shifts that share a minute', () => {
    expect(hasOverlap([window(MONDAY, '09:00', '12:00'), window(MONDAY, '11:55', '14:00')])).toBe(
      true,
    );
  });

  it('accepts shifts that only touch', () => {
    expect(hasOverlap([window(MONDAY, '09:00', '12:00'), window(MONDAY, '12:00', '14:00')])).toBe(
      false,
    );
  });

  it('finds a wrap-around shift that runs into the next day', () => {
    expect(hasOverlap([window(MONDAY, '22:00', '06:00'), window(TUESDAY, '05:00', '09:00')])).toBe(
      true,
    );
    expect(hasOverlap([window(MONDAY, '22:00', '06:00'), window(TUESDAY, '06:00', '09:00')])).toBe(
      false,
    );
  });

  it('finds a Saturday wrap-around shift that runs into Sunday', () => {
    expect(hasOverlap([window(SATURDAY, '22:00', '06:00'), window(SUNDAY, '05:00', '09:00')])).toBe(
      true,
    );
  });
});

describe('clock text and dates', () => {
  it('converts between "HH:MM" and minutes', () => {
    expect(clockTextToMinute('09:45')).toBe(585);
    expect(minuteToClockText(585)).toBe('09:45');
    expect(minuteToClockText(1440)).toBe('24:00');
  });

  it('knows IANA names and Mondays', () => {
    expect(isValidTimezone('Asia/Kathmandu')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isMondayDate('2026-10-12')).toBe(true);
    expect(isMondayDate('2026-10-13')).toBe(false);
    expect(isMondayDate('2026-13-40')).toBe(false);
  });
});
