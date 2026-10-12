import type { DateTime } from 'luxon';

import {
  DAYS_PER_WEEK,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MINUTES_PER_WEEK,
} from '../../../shared/time.ts';

export const MS_PER_MINUTE = 60_000;
export const UTC_ZONE = 'utc';

/** A weekly range in local minutes. `endMinute < startMinute` wraps past midnight. */
export type WeeklyWindow = {
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
};

export type LocalClock = { readonly weekday: number; readonly minute: number };

export function formatInstant(instant: DateTime): string {
  const text = instant.toISO({ suppressMilliseconds: true });
  if (text === null) {
    throw new Error(`Cannot format an invalid instant: ${instant.invalidReason ?? 'unknown'}`);
  }
  return text;
}

export function toLocalClock({ now, timezone }: { now: DateTime; timezone: string }): LocalClock {
  const local = now.setZone(timezone);
  // Weekday 0 is Sunday. Luxon counts Monday as 1 and Sunday as 7.
  return {
    weekday: local.weekday % DAYS_PER_WEEK,
    minute: local.hour * MINUTES_PER_HOUR + local.minute,
  };
}

export function isOnShift({
  now,
  timezone,
  shifts,
}: {
  now: DateTime;
  timezone: string;
  shifts: readonly WeeklyWindow[];
}): boolean {
  const { weekday, minute } = toLocalClock({ now, timezone });
  const previousWeekday = (weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return shifts.some((shift) => {
    const wraps = shift.endMinute < shift.startMinute;
    if (shift.weekday === weekday) {
      return wraps
        ? shift.startMinute <= minute
        : shift.startMinute <= minute && minute < shift.endMinute;
    }
    return shift.weekday === previousWeekday && wraps && minute < shift.endMinute;
  });
}

/** No coverage hours means every hour. */
export function isInCoverageHours({
  now,
  timezone,
  hours,
}: {
  now: DateTime;
  timezone: string;
  hours: readonly WeeklyWindow[];
}): boolean {
  if (hours.length === 0) return true;
  const { weekday, minute } = toLocalClock({ now, timezone });
  return hours.some(
    (window) =>
      window.weekday === weekday && window.startMinute <= minute && minute < window.endMinute,
  );
}

type WeekSegment = { readonly start: number; readonly end: number };

function toWeekSegments(window: WeeklyWindow): WeekSegment[] {
  const start = window.weekday * MINUTES_PER_DAY + window.startMinute;
  const length =
    window.endMinute > window.startMinute
      ? window.endMinute - window.startMinute
      : window.endMinute - window.startMinute + MINUTES_PER_DAY;
  const end = start + length;
  if (end <= MINUTES_PER_WEEK) return [{ start, end }];
  return [
    { start, end: MINUTES_PER_WEEK },
    { start: 0, end: end - MINUTES_PER_WEEK },
  ];
}

/** Tells whether two weekly windows share a minute, wrap-around past midnight and past the week end included. */
export function hasOverlap(windows: readonly WeeklyWindow[]): boolean {
  const segments = windows.flatMap(toWeekSegments).sort((a, b) => a.start - b.start);
  return segments.some((segment, index) => {
    const next = segments[index + 1];
    return next !== undefined && next.start < segment.end;
  });
}
