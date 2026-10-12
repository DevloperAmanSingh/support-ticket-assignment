// The Monday that names a week, and the moves between weeks. Dates are "YYYY-MM-DD" text.
import { CoverageQuerySchema } from '@shared/api-types.ts';
import { DAYS_PER_WEEK } from '@shared/time.ts';
import type { z } from '@shared/zod.ts';

import { dayMonthLabel, toLocalTime, weekdayShortName } from './time.ts';

const MS_PER_DAY = 86_400_000;
const DATE_TEXT_LENGTH = 10;
/** Days from the Monday of a week to each weekday number (0 is Sunday). */
const DAYS_AFTER_MONDAY = [6, 0, 1, 2, 3, 4, 5] as const;

/** The Monday of a week as "YYYY-MM-DD", the value of the `week` query of the coverage call. */
export const WeekStartSchema = CoverageQuerySchema.shape.week.brand<'WeekStart'>();
export type WeekStart = z.infer<typeof WeekStartSchema>;

function dateToMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function addDays({ date, days }: { date: string; days: number }): string {
  return new Date(dateToMs(date) + days * MS_PER_DAY).toISOString().slice(0, DATE_TEXT_LENGTH);
}

/** Negative when `to` is earlier. */
export function daysBetween({ from, to }: { from: string; to: string }): number {
  return Math.round((dateToMs(to) - dateToMs(from)) / MS_PER_DAY);
}

/** Null when the value is missing or is not a Monday. */
export function parseWeekStart(text: string | null): WeekStart | null {
  const parsed = WeekStartSchema.safeParse(text);
  return parsed.success ? parsed.data : null;
}

export function weekStartOf({
  instant,
  timezone,
}: {
  instant: Date;
  timezone: string;
}): WeekStart {
  const { date } = toLocalTime({ instant, timezone });
  const weekday = new Date(dateToMs(date)).getUTCDay();
  return WeekStartSchema.parse(addDays({ date, days: -(DAYS_AFTER_MONDAY[weekday] ?? 0) }));
}

export function shiftWeek({ week, weeks }: { week: WeekStart; weeks: number }): WeekStart {
  return WeekStartSchema.parse(addDays({ date: week, days: weeks * DAYS_PER_WEEK }));
}

export type WeekDay = {
  readonly date: string;
  /** The wire weekday number: 0 is Sunday. */
  readonly weekday: number;
  /** "Mon 12 Oct" */
  readonly label: string;
};

export function weekDays(week: WeekStart): WeekDay[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
    const date = addDays({ date: week, days: index });
    const weekday = new Date(dateToMs(date)).getUTCDay();
    return { date, weekday, label: `${weekdayShortName(weekday)} ${dayMonthLabel(date)}` };
  });
}

/** "12 Oct to 18 Oct 2026" */
export function weekLabel(week: WeekStart): string {
  const lastDay = addDays({ date: week, days: DAYS_PER_WEEK - 1 });
  return `${dayMonthLabel(week)} to ${dayMonthLabel(lastDay)} ${lastDay.slice(0, 4)}`;
}
