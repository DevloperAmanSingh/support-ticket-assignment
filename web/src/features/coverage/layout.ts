// Turns UTC intervals into bars positioned by elapsed time within each local day.
import type { CoverageResponse, IntervalView, WindowView } from '@shared/api-types.ts';
import type { AgentId } from '@shared/ids.ts';

import { clockTextToMinute } from '@/domain/time.ts';
import { weekDays, weekStartOf } from '@/domain/week.ts';
import type { WeekDay, WeekStart } from '@/domain/week.ts';

import { buildDayScales, MS_PER_MINUTE } from './dayScale.ts';
import type { DayScale } from './dayScale.ts';

/** Elapsed minutes since the local day began; a DST day may have fewer or more than 1440. */
export type Segment = { readonly start: number; readonly end: number };

export type AgentLane = {
  readonly agentId: AgentId;
  readonly name: string;
  readonly segments: readonly Segment[];
};

export type DayLayout = {
  readonly day: WeekDay;
  readonly scale: DayScale;
  readonly hours: readonly Segment[];
  /** Nobody on shift inside coverage hours. */
  readonly gaps: readonly Segment[];
  /** Nobody on shift outside coverage hours. */
  readonly offHoursGaps: readonly Segment[];
  readonly lanes: readonly AgentLane[];
};

/** Clips real intervals to a local day, preserving both occurrences of a repeated hour. */
function segmentsOfDay(intervals: readonly IntervalView[], scale: DayScale): Segment[] {
  return intervals.flatMap((interval) => {
    const start = Math.max(0, (Date.parse(interval.start) - scale.startMs) / MS_PER_MINUTE);
    const end = Math.min(scale.minutes, (Date.parse(interval.end) - scale.startMs) / MS_PER_MINUTE);
    return start < end ? [{ start, end }] : [];
  });
}

export function mergeSegments(segments: readonly Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments.toSorted((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last !== undefined && segment.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, segment.end) };
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

/** Removes every minute of `remove` from `from`. Both lists must be merged. */
export function subtractSegments({
  from,
  remove,
}: {
  from: readonly Segment[];
  remove: readonly Segment[];
}): Segment[] {
  const kept: Segment[] = [];
  for (const segment of from) {
    let cursor = segment.start;
    for (const hole of remove) {
      if (hole.end <= cursor || hole.start >= segment.end) continue;
      if (hole.start > cursor) kept.push({ start: cursor, end: hole.start });
      cursor = Math.max(cursor, hole.end);
    }
    if (cursor < segment.end) kept.push({ start: cursor, end: segment.end });
  }
  return kept;
}

/** The coverage hours of one weekday. No rows at all means every hour of every day. */
function hoursOf(hours: readonly WindowView[], weekday: number, scale: DayScale): Segment[] {
  if (hours.length === 0) return [{ start: 0, end: scale.minutes }];
  return mergeSegments(scale.spans.flatMap((span) =>
    hours.filter((window) => window.weekday === weekday).flatMap((window) => {
      const start = Math.max(span.clockStart, clockTextToMinute(window.start));
      const end = Math.min(span.clockStart + span.end - span.start, clockTextToMinute(window.end));
      return start < end
        ? [{ start: span.start + start - span.clockStart, end: span.start + end - span.clockStart }]
        : [];
    }),
  ));
}

export function weekOf(coverage: CoverageResponse): WeekStart {
  return weekStartOf({ instant: new Date(coverage.week_start), timezone: coverage.timezone });
}

export function buildWeekLayout(coverage: CoverageResponse): DayLayout[] {
  const week = weekOf(coverage);
  const scales = buildDayScales(coverage, week);

  return weekDays(week).map((day, index) => {
    const scale = scales[index];
    if (scale === undefined) throw new Error('Missing day scale');
    const lanes = coverage.agents.map((agent) => ({
      agentId: agent.agent_id,
      name: agent.name,
      segments: segmentsOfDay(agent.intervals, scale),
    }));
    const gaps = mergeSegments(segmentsOfDay(coverage.gaps, scale));
    const staffed = mergeSegments(lanes.flatMap((lane) => lane.segments));
    const unstaffed = subtractSegments({ from: [{ start: 0, end: scale.minutes }], remove: staffed });
    return {
      day,
      scale,
      hours: hoursOf(coverage.hours, day.weekday, scale),
      gaps,
      offHoursGaps: subtractSegments({ from: unstaffed, remove: gaps }),
      lanes,
    };
  });
}

function holds(segment: Segment, minute: number): boolean {
  return segment.start <= minute && minute < segment.end;
}

export function gapMinutes(layout: DayLayout): number {
  return layout.gaps.reduce((total, gap) => total + gap.end - gap.start, 0);
}

export const MinuteState = {
  Staffed: 'staffed',
  Gap: 'gap',
  OffHours: 'off_hours',
} as const;

export type MinuteReading =
  | {
      readonly kind: typeof MinuteState.Staffed;
      readonly inCoverageHours: boolean;
      /** Each agent on shift with the bar that holds the minute. `lane` picks the colour. */
      readonly onShift: readonly {
        readonly agentId: AgentId;
        readonly name: string;
        readonly lane: number;
        readonly segment: Segment;
      }[];
    }
  | { readonly kind: typeof MinuteState.Gap; readonly gap: Segment }
  | { readonly kind: typeof MinuteState.OffHours };

/** Reads one minute of one day. Nobody on shift is a gap inside coverage hours and off hours outside. */
export function readMinute({
  layout,
  minute,
}: {
  layout: DayLayout;
  minute: number;
}): MinuteReading {
  const onShift = layout.lanes.flatMap(({ agentId, name, segments }, lane) => {
    const segment = segments.find((candidate) => holds(candidate, minute));
    return segment === undefined ? [] : [{ agentId, name, lane, segment }];
  });
  if (onShift.length > 0) {
    return {
      kind: MinuteState.Staffed,
      inCoverageHours: layout.hours.some((range) => holds(range, minute)),
      onShift,
    };
  }
  const gap = layout.gaps.find((candidate) => holds(candidate, minute));
  return gap === undefined ? { kind: MinuteState.OffHours } : { kind: MinuteState.Gap, gap };
}
