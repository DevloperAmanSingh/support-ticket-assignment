import type { CoverageResponse } from '@shared/api-types.ts';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from '@shared/time.ts';

import { toLocalTime } from '@/domain/time.ts';
import { weekDays } from '@/domain/week.ts';
import type { WeekStart } from '@/domain/week.ts';

export const MS_PER_MINUTE = 60_000;

/** A continuous run of the local clock, positioned by elapsed minutes since the day began. */
export type ClockSpan = { start: number; end: number; clockStart: number };
export type DayScale = {
  startMs: number;
  minutes: number;
  timezone: string;
  spans: ClockSpan[];
};

/**
 * Splits the real week into local days and continuous runs of the local clock. It walks in hourly
 * blocks, and minute by minute where a block crosses a clock change.
 */
export function buildDayScales(coverage: CoverageResponse, week: WeekStart): DayScale[] {
  const days = weekDays(week);
  const weekStartMs = Date.parse(coverage.week_start);
  const weekEndMs = Date.parse(coverage.week_end);
  const scales = days.map(
    (): DayScale => ({
      startMs: weekStartMs,
      minutes: 0,
      timezone: coverage.timezone,
      spans: [],
    }),
  );
  const byDate = new Map(days.map((day, index) => [day.date, scales[index]]));

  let instant = weekStartMs;
  while (instant < weekEndMs) {
    const local = toLocalTime({ instant: new Date(instant), timezone: coverage.timezone });
    const block = Math.min(
      MINUTES_PER_HOUR,
      MINUTES_PER_DAY - local.minute,
      (weekEndMs - instant) / MS_PER_MINUTE,
    );
    const lastLocal = toLocalTime({
      instant: new Date(instant + (block - 1) * MS_PER_MINUTE),
      timezone: coverage.timezone,
    });
    const isContinuous =
      lastLocal.date === local.date && lastLocal.minute === local.minute + block - 1;
    const length = isContinuous ? block : 1;

    const scale = byDate.get(local.date);
    if (scale !== undefined) {
      if (scale.minutes === 0) scale.startMs = instant;
      const minute = (instant - scale.startMs) / MS_PER_MINUTE;
      scale.minutes = minute + length;
      const last = scale.spans.at(-1);
      if (last !== undefined && last.clockStart + minute - last.start === local.minute) {
        last.end = scale.minutes;
      } else {
        scale.spans.push({ start: minute, end: scale.minutes, clockStart: local.minute });
      }
    }
    instant += length * MS_PER_MINUTE;
  }
  return scales;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** A numeric offset, so both occurrences of a repeated local time have distinct labels. */
export function utcOffset(instant: Date, timezone: string): string {
  let formatter = offsetFormatters.get(timezone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    offsetFormatters.set(timezone, formatter);
  }
  const zoneName = formatter.formatToParts(instant).find((part) => part.type === 'timeZoneName');
  return (zoneName?.value ?? 'GMT').replace('GMT', 'UTC');
}

const END_OF_DAY_CLOCK = '24:00';

type ScalePosition = { scale: DayScale; minute: number };

function instantAt({ scale, minute }: ScalePosition): Date {
  return new Date(scale.startMs + minute * MS_PER_MINUTE);
}

/** The local clock time at an elapsed position of a day. The end of the day reads 24:00. */
export function clockAt({ scale, minute }: ScalePosition): string {
  if (minute === scale.minutes) return END_OF_DAY_CLOCK;
  return toLocalTime({ instant: instantAt({ scale, minute }), timezone: scale.timezone }).clock;
}

/** Like `clockAt`, with the UTC offset added on a day whose clock changes. */
export function scaleClock({ scale, minute }: ScalePosition): string {
  const clock = clockAt({ scale, minute });
  if (scale.spans.length <= 1) return clock;
  return `${clock} ${utcOffset(instantAt({ scale, minute }), scale.timezone)}`;
}
