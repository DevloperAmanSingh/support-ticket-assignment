import { DateTime } from 'luxon';

import type { WeeklyWindow } from '../../src/domain/time.ts';
import { clockTextToMinute } from '../../../shared/time.ts';

export const SUNDAY = 0;
export const MONDAY = 1;
export const TUESDAY = 2;
export const WEDNESDAY = 3;
export const SATURDAY = 6;

/** Parses an ISO instant for a test. */
export function at(iso: string): DateTime {
  return DateTime.fromISO(iso, { setZone: true });
}

/** Builds a weekly window from "HH:MM" texts. */
export function window(weekday: number, start: string, end: string): WeeklyWindow {
  return { weekday, startMinute: clockTextToMinute(start), endMinute: clockTextToMinute(end) };
}
