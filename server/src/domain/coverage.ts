import { DateTime, IANAZone } from 'luxon';

import type { AgentId } from '../../../shared/ids.ts';
import { isInCoverageHours, isOnShift, MS_PER_MINUTE, UTC_ZONE } from './time.ts';
import type { WeeklyWindow } from './time.ts';

const MS_PER_HOUR = 60 * MS_PER_MINUTE;
/** Local days read before and after the week, so every wall-clock time in the week is found. */
const DAY_PADDING = 2;

/** A range of real time, start inclusive and end exclusive. */
export type Interval = { readonly start: DateTime; readonly end: DateTime };

export type CoverageAgent = {
  readonly id: AgentId;
  readonly name: string;
  readonly timezone: string;
  readonly shifts: readonly WeeklyWindow[];
};

export type CoverageReport = {
  readonly weekStart: DateTime;
  readonly weekEnd: DateTime;
  readonly gaps: readonly Interval[];
  readonly agents: readonly {
    readonly agent: CoverageAgent;
    readonly intervals: readonly Interval[];
  }[];
};

type Span = { readonly startMs: number; readonly endMs: number };

export function weekBounds({ week, timezone }: { week: string; timezone: string }): Interval {
  const start = DateTime.fromISO(week, { zone: timezone }).startOf('day');
  return { start, end: start.plus({ weeks: 1 }).startOf('day') };
}

/** Every real instant at which a wall clock in the zone shows this date and minute: 0, 1, or 2. */
function instantsAtLocal({
  date,
  minute,
  zone,
}: {
  date: DateTime;
  minute: number;
  zone: IANAZone;
}): number[] {
  const naive = date.plus({ minutes: minute });
  const naiveMs = naive.toMillis();
  const offsets = new Set([
    zone.offset(naive.minus({ days: 1 }).toMillis()),
    zone.offset(naive.plus({ days: 1 }).toMillis()),
  ]);
  return [...offsets]
    .map((offset) => ({ offset, instant: naiveMs - offset * MS_PER_MINUTE }))
    .filter(({ offset, instant }) => zone.offset(instant) === offset)
    .map(({ instant }) => instant);
}

function wallClockInstants({
  range,
  timezone,
  minutes,
}: {
  range: Span;
  timezone: string;
  minutes: ReadonlySet<number>;
}): number[] {
  const zone = IANAZone.create(timezone);
  const first = DateTime.fromMillis(range.startMs, { zone: timezone });
  const last = DateTime.fromMillis(range.endMs, { zone: timezone });
  const firstDate = DateTime.utc(first.year, first.month, first.day).minus({ days: DAY_PADDING });
  const lastDate = DateTime.utc(last.year, last.month, last.day).plus({ days: DAY_PADDING });
  const instants: number[] = [];
  for (let date = firstDate; date <= lastDate; date = date.plus({ days: 1 })) {
    for (const minute of minutes) {
      instants.push(...instantsAtLocal({ date, minute, zone }));
    }
  }
  return instants;
}

/** Every instant in the range at which the UTC offset of the zone changes. */
function offsetTransitions({ range, timezone }: { range: Span; timezone: string }): number[] {
  const zone = IANAZone.create(timezone);
  const transitions: number[] = [];
  for (let from = range.startMs; from < range.endMs; from += MS_PER_HOUR) {
    const to = Math.min(from + MS_PER_HOUR, range.endMs);
    const before = zone.offset(from);
    if (zone.offset(to) === before) continue;
    let low = from;
    let high = to;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (zone.offset(middle) === before) low = middle;
      else high = middle;
    }
    transitions.push(high);
  }
  return transitions;
}

/** Lists, in order, every instant of the week at which availability or coverage can change. */
export function collectBoundaries({
  weekStart,
  weekEnd,
  timezone,
  hours,
  agents,
}: {
  weekStart: DateTime;
  weekEnd: DateTime;
  timezone: string;
  hours: readonly WeeklyWindow[];
  agents: readonly CoverageAgent[];
}): number[] {
  const range: Span = { startMs: weekStart.toMillis(), endMs: weekEnd.toMillis() };
  const edgeMinutes = (windows: readonly WeeklyWindow[]): Set<number> =>
    new Set(windows.flatMap((window) => [window.startMinute, window.endMinute]));

  const candidates = [
    range.startMs,
    range.endMs,
    ...wallClockInstants({ range, timezone, minutes: edgeMinutes(hours) }),
    ...offsetTransitions({ range, timezone }),
    ...agents.flatMap((agent) => [
      ...wallClockInstants({ range, timezone: agent.timezone, minutes: edgeMinutes(agent.shifts) }),
      ...offsetTransitions({ range, timezone: agent.timezone }),
    ]),
  ];
  const inside = candidates.filter((instant) => range.startMs <= instant && instant <= range.endMs);
  return [...new Set(inside)].sort((a, b) => a - b);
}

function toSpans(boundaries: readonly number[]): Span[] {
  const spans: Span[] = [];
  let previous: number | undefined;
  for (const boundary of boundaries) {
    if (previous !== undefined) spans.push({ startMs: previous, endMs: boundary });
    previous = boundary;
  }
  return spans;
}

function mergeRuns({
  spans,
  timezone,
  holds,
}: {
  spans: readonly Span[];
  timezone: string;
  holds: (at: DateTime) => boolean;
}): Interval[] {
  const runs: Span[] = [];
  for (const span of spans) {
    if (!holds(DateTime.fromMillis(span.startMs, { zone: UTC_ZONE }))) continue;
    const last = runs.at(-1);
    if (last !== undefined && last.endMs === span.startMs) {
      runs[runs.length - 1] = { startMs: last.startMs, endMs: span.endMs };
    } else {
      runs.push(span);
    }
  }
  return runs.map((run) => ({
    start: DateTime.fromMillis(run.startMs, { zone: timezone }),
    end: DateTime.fromMillis(run.endMs, { zone: timezone }),
  }));
}

export function computeCoverage({
  weekStart,
  weekEnd,
  timezone,
  hours,
  agents,
}: {
  weekStart: DateTime;
  weekEnd: DateTime;
  timezone: string;
  hours: readonly WeeklyWindow[];
  agents: readonly CoverageAgent[];
}): CoverageReport {
  const spans = toSpans(collectBoundaries({ weekStart, weekEnd, timezone, hours, agents }));
  const onShiftAt = (agent: CoverageAgent, now: DateTime): boolean =>
    isOnShift({ now, timezone: agent.timezone, shifts: agent.shifts });

  return {
    weekStart,
    weekEnd,
    gaps: mergeRuns({
      spans,
      timezone,
      holds: (now) =>
        isInCoverageHours({ now, timezone, hours }) &&
        !agents.some((agent) => onShiftAt(agent, now)),
    }),
    agents: agents.map((agent) => ({
      agent,
      intervals: mergeRuns({
        spans,
        timezone: agent.timezone,
        holds: (now) => onShiftAt(agent, now),
      }),
    })),
  };
}
