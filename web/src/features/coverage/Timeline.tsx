import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';

import { MINUTES_PER_DAY, MINUTES_PER_HOUR, TIME_STEP_MINUTES } from '@shared/time.ts';

import { dayMonthLabel, durationLabel, weekdayShortName } from '@/domain/time.ts';

import { clockAt, scaleClock } from './dayScale.ts';
import { gapMinutes, MinuteState, readMinute } from './layout.ts';
import type { DayLayout, Segment } from './layout.ts';

const AXIS_STEP_MINUTES = 3 * MINUTES_PER_HOUR;
/** Every second mark stays on a narrow screen, where nine labels do not fit. */
const WIDE_ONLY_MARK_STEP = 6;
const PERCENT = 100;
/** The gap between the pointer and the card that follows it. */
const CARD_OFFSET = 16;
/** The card moves to the left of the pointer when less than this is free on the right. */
const CARD_WIDTH = 232;
const ROW_COLUMNS = 'grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)]';

/** One fill per agent. Agents beyond the list reuse it from the start. */
const AGENT_FILLS = [
  'bg-agent-1',
  'bg-agent-2',
  'bg-agent-3',
  'bg-agent-4',
  'bg-agent-5',
  'bg-agent-6',
  'bg-agent-7',
  'bg-agent-8',
] as const;

function agentFill(lane: number): string {
  return AGENT_FILLS[lane % AGENT_FILLS.length] ?? AGENT_FILLS[0];
}

function percentOfDay(minutes: number, total: number): string {
  return `${total === 0 ? 0 : (minutes / total) * PERCENT}%`;
}

/** Places a segment by elapsed time within this day, including clock-change days. */
function place({ start, end }: Segment, total: number): CSSProperties {
  return { left: percentOfDay(start, total), width: percentOfDay(end - start, total) };
}

function rangeText({ start, end }: Segment, layout: DayLayout): string {
  const { scale } = layout;
  return `${scaleClock({ scale, minute: start })} to ${scaleClock({ scale, minute: end })}`;
}

type Scrub = {
  readonly dayIndex: number;
  readonly minute: number;
  readonly x: number;
  readonly y: number;
  readonly panelWidth: number;
};

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-2 w-4 rounded-full ${className}`} />
      {label}
    </span>
  );
}

/** Keeps the first and the last label inside the track; the others sit on their mark. */
function markAnchor(minute: number, total: number): string {
  if (minute === 0) return '';
  return minute === total ? '-translate-x-full' : '-translate-x-1/2';
}

function axisMarks(total: number): number[] {
  const marks = Array.from(
    { length: Math.ceil(total / AXIS_STEP_MINUTES) },
    (_, index) => index * AXIS_STEP_MINUTES,
  );
  // Avoid a final label very close to 24:00 on a 25-hour day.
  if (total - (marks.at(-1) ?? 0) < AXIS_STEP_MINUTES / 2) marks.pop();
  return [...marks, total];
}

function HourAxis({ layout }: { layout: DayLayout }) {
  const total = layout.scale.minutes;
  return (
    <div className="pb-1">
      <div aria-hidden className="relative h-4 text-[0.6875rem] text-muted-foreground tabular-nums">
        {axisMarks(total).map((minute) => (
          <span
            key={minute}
            className={`absolute ${markAnchor(minute, total)} ${
              minute === total || minute % (WIDE_ONLY_MARK_STEP * MINUTES_PER_HOUR) === 0
                ? '' : 'hidden sm:inline'
            }`}
            style={{ left: percentOfDay(minute, total) }}
          >
            {clockAt({ scale: layout.scale, minute })}
          </span>
        ))}
      </div>
    </div>
  );
}

function DayRow({
  layout,
  scrubMinute,
  onScrub,
  onLeave,
}: {
  layout: DayLayout;
  /** Elapsed minute under the pointer on this row only. */
  scrubMinute: number | null;
  onScrub: (event: PointerEvent<HTMLDivElement>) => void;
  onLeave: () => void;
}) {
  const { day, hours, gaps, offHoursGaps, lanes, scale } = layout;
  const total = scale.minutes;
  const gapLength = gapMinutes(layout);
  return (
    <div className={`${ROW_COLUMNS} border-t px-4 py-2.5`}>
      <div className="leading-tight">
        <p className="text-sm">
          <span className="font-medium">{weekdayShortName(day.weekday)}</span>{' '}
          <span className="text-muted-foreground">{dayMonthLabel(day.date)}</span>
        </p>
        {gapLength > 0 && (
          <p className="mt-0.5 text-xs font-medium text-gap">{durationLabel(gapLength)} gap</p>
        )}
        {total !== MINUTES_PER_DAY && (
          <p className="mt-0.5 text-xs text-muted-foreground">{durationLabel(total)} day</p>
        )}
      </div>
      <div className="min-w-0">
        <HourAxis layout={layout} />
        <div
          className="relative cursor-crosshair touch-pan-y"
          onPointerMove={onScrub}
          onPointerDown={onScrub}
          onPointerLeave={onLeave}
        >
          {hours.map((segment) => (
            <div
              key={segment.start}
              aria-hidden
              className="absolute inset-y-0 rounded-sm bg-coverage"
              style={place(segment, total)}
            />
          ))}
          {axisMarks(total).slice(1, -1).map((minute) => (
            <div
              key={minute}
              aria-hidden
              className="absolute inset-y-0 w-px bg-foreground/6"
              style={{ left: percentOfDay(minute, total) }}
            />
          ))}
          <div className="relative h-2 overflow-hidden rounded-full bg-foreground/5">
            {offHoursGaps.map((segment) => (
              <div
                key={segment.start}
                role="img"
                aria-label={`${day.label}: nobody on shift outside coverage hours, ${rangeText(segment, layout)}`}
                className="absolute inset-y-0 bg-off-hours"
                style={place(segment, total)}
              />
            ))}
            {gaps.map((segment) => (
              <div
                key={segment.start}
                role="img"
                aria-label={`${day.label}: gap, ${rangeText(segment, layout)}`}
                className="absolute inset-y-0 bg-gap"
                style={place(segment, total)}
              />
            ))}
          </div>
          <div className="grid gap-0.5 pt-1.5 empty:hidden">
            {lanes.map((lane, index) =>
              // An agent with no shift on this day takes no room.
              lane.segments.length === 0 ? null : (
                <div key={lane.agentId} className="relative h-[1.125rem]">
                  {lane.segments.map((segment) => (
                    <div
                      key={segment.start}
                      role="img"
                      aria-label={`${day.label}: ${lane.name} on shift, ${rangeText(segment, layout)}`}
                      className={`absolute inset-y-0 overflow-hidden rounded-sm px-1.5 text-[0.6875rem] leading-[1.125rem] font-medium whitespace-nowrap text-agent-ink ${agentFill(index)}`}
                      style={place(segment, total)}
                    >
                      {lane.name}
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
          {scrubMinute !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
              style={{ left: percentOfDay(scrubMinute, total) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MinuteCard({ layout, minute }: { layout: DayLayout; minute: number }) {
  const reading = readMinute({ layout, minute });
  const heading = (
    <p className="font-medium tabular-nums">
      {layout.day.label}, {scaleClock({ scale: layout.scale, minute })}
    </p>
  );
  switch (reading.kind) {
    case MinuteState.Staffed:
      return (
        <>
          {heading}
          <ul className="mt-1.5 grid gap-1">
            {reading.onShift.map(({ agentId, name, lane, segment }) => (
              <li key={agentId} className="flex items-center gap-2">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${agentFill(lane)}`} />
                <span>{name}</span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {rangeText(segment, layout)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-muted-foreground">
            {reading.inCoverageHours ? 'Inside coverage hours.' : 'Outside coverage hours.'}
          </p>
        </>
      );
    case MinuteState.Gap:
      return (
        <>
          {heading}
          <p className="mt-1.5 flex items-center gap-2 font-medium text-gap">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-gap" />
            Gap: nobody is on shift
          </p>
          <p className="mt-1 text-muted-foreground tabular-nums">
            {rangeText(reading.gap, layout)}, inside coverage hours.
          </p>
        </>
      );
    case MinuteState.OffHours:
      return (
        <>
          {heading}
          <p className="mt-1.5 flex items-center gap-2">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-off-hours" />
            Nobody is on shift
          </p>
          <p className="mt-1 text-muted-foreground">Outside coverage hours, so no agent is needed.</p>
        </>
      );
    default: {
      const _exhaustive: never = reading;
      return _exhaustive;
    }
  }
}

/** Finds the minute under the pointer on a day track, on the 5-minute step of the service. */
function minuteAt({
  clientX, track, total,
}: { clientX: number; track: DOMRect; total: number }): number | null {
  if (track.width === 0 || total === 0) return null;
  const share = Math.min(Math.max((clientX - track.left) / track.width, 0), 1);
  const minute = Math.round((share * total) / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return Math.min(minute, total - TIME_STEP_MINUTES);
}

/**
 * One row per day of the week: a strip for gaps, then one bar per agent on shift. The pointer
 * reads elapsed time within each day, so repeated hours remain separate and missing hours take no space.
 */
export function Timeline({ days }: { days: readonly DayLayout[] }) {
  const panel = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<Scrub | null>(null);
  const scrubbed = scrub === null ? undefined : days[scrub.dayIndex];

  const scrubDay = (dayIndex: number) => (event: PointerEvent<HTMLDivElement>) => {
    const layout = days[dayIndex];
    if (panel.current === null || layout === undefined) return;
    const minute = minuteAt({
      clientX: event.clientX,
      track: event.currentTarget.getBoundingClientRect(),
      total: layout.scale.minutes,
    });
    if (minute === null) return;
    const bounds = panel.current.getBoundingClientRect();
    setScrub({
      dayIndex,
      minute,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      panelWidth: bounds.width,
    });
  };

  return (
    <div ref={panel} className="relative rounded-lg border bg-card">
      {days.map((layout, dayIndex) => (
        <DayRow
          key={layout.day.date}
          layout={layout}
          scrubMinute={scrub?.dayIndex === dayIndex ? scrub.minute : null}
          onScrub={scrubDay(dayIndex)}
          onLeave={() => {
            setScrub(null);
          }}
        />
      ))}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <Swatch className="bg-gap" label="Gap: nobody on shift in coverage hours" />
        <Swatch className="bg-off-hours" label="Nobody on shift outside coverage hours" />
        <Swatch className="bg-coverage ring-1 ring-foreground/15" label="Coverage hours" />
      </div>
      {scrub !== null && scrubbed !== undefined && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 left-0 z-10 w-58 animate-in rounded-md border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg shadow-black/30 transition-transform duration-150 ease-out fade-in-0 zoom-in-95 motion-reduce:transition-none"
          style={{
            // The card glides after the pointer. Near the right edge it sits on the left of it.
            transform: `translate(${
              scrub.x + CARD_OFFSET + CARD_WIDTH > scrub.panelWidth
                ? scrub.x - CARD_OFFSET - CARD_WIDTH
                : scrub.x + CARD_OFFSET
            }px, ${scrub.y + CARD_OFFSET}px)`,
          }}
        >
          <MinuteCard layout={scrubbed} minute={scrub.minute} />
        </div>
      )}
    </div>
  );
}
