import type { WindowView } from '@shared/api-types.ts';
import {
  clockTextToMinute,
  DAYS_PER_WEEK,
  MINUTES_PER_HOUR,
  minuteToClockText,
} from '@shared/time.ts';

export { clockTextToMinute, minuteToClockText };

const CLOCK_TEXT = /^([01]\d|2[0-3]):[0-5]\d$/;
const SHORT_NAME_LENGTH = 3;

/** Weekday names by wire number: 0 is Sunday. */
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** The wire weekday numbers in the order a week is shown: Monday first. */
export const WEEKDAYS_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`;
}

export function weekdayShortName(weekday: number): string {
  return weekdayName(weekday).slice(0, SHORT_NAME_LENGTH);
}

export function compareWindows(a: WindowView, b: WindowView): number {
  const dayOrder = (weekday: number) => (weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return dayOrder(a.weekday) - dayOrder(b.weekday) || a.start.localeCompare(b.start);
}

export function isClockText(text: string): boolean {
  return CLOCK_TEXT.test(text);
}

export function wrapsMidnight({ start, end }: Pick<WindowView, 'start' | 'end'>): boolean {
  return clockTextToMinute(end) < clockTextToMinute(start);
}

/** Names a shift, with the end weekday when the shift wraps midnight: "Mon 22:00 to Tue 06:00". */
export function shiftLabel(shift: WindowView): string {
  const { weekday, start, end } = shift;
  const endDay = wrapsMidnight(shift)
    ? `${weekdayShortName((weekday + 1) % DAYS_PER_WEEK)} `
    : '';
  return `${weekdayShortName(weekday)} ${start} to ${endDay}${end}`;
}

/** Writes a length in minutes as "4 h", "30 min", or "1 h 30 min". */
export function durationLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export type LocalTime = {
  /** The local date "YYYY-MM-DD". */
  readonly date: string;
  /** The local minute of the day, 0 to 1439. */
  readonly minute: number;
  /** The local date and time for a person: "Sat 17 Oct, 09:00". */
  readonly label: string;
  /** The local time "HH:MM". */
  readonly clock: string;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterOf(timezone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timezone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  formatters.set(timezone, formatter);
  return formatter;
}

const monthNames = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

/** Writes a date "YYYY-MM-DD" as "17 Oct". */
export function dayMonthLabel(date: string): string {
  const instant = new Date(`${date}T00:00:00Z`);
  return `${instant.getUTCDate()} ${monthNames.format(instant)}`;
}

export function toLocalTime({
  instant,
  timezone,
}: {
  instant: string | Date;
  timezone: string;
}): LocalTime {
  const parts = new Map(
    formatterOf(timezone)
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const text = (type: Intl.DateTimeFormatPartTypes): string => parts.get(type) ?? '';
  const date = `${text('year')}-${text('month')}-${text('day')}`;
  const clock = `${text('hour')}:${text('minute')}`;
  return {
    date,
    minute: clockTextToMinute(clock),
    label: `${text('weekday')} ${dayMonthLabel(date)}, ${clock}`,
    clock,
  };
}
