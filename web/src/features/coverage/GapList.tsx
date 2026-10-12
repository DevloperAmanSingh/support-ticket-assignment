import type { IntervalView } from '@shared/api-types.ts';

import { durationLabel, toLocalTime } from '@/domain/time.ts';

import { utcOffset } from './dayScale.ts';

const MS_PER_MINUTE = 60_000;

function gapText({ gap, timezone }: { gap: IntervalView; timezone: string }): string {
  const start = toLocalTime({ instant: gap.start, timezone });
  const end = toLocalTime({ instant: gap.end, timezone });
  const startOffset = utcOffset(new Date(gap.start), timezone);
  const endOffset = utcOffset(new Date(gap.end), timezone);
  const changedOffset = startOffset !== endOffset;
  // A gap that ends on another day names that day too.
  return `${start.label}${changedOffset ? ` ${startOffset}` : ''} to ${
    start.date === end.date ? end.clock : end.label
  }${changedOffset ? ` ${endOffset}` : ''}`;
}

function gapLength(gap: IntervalView): number {
  return Math.round((Date.parse(gap.end) - Date.parse(gap.start)) / MS_PER_MINUTE);
}

export function GapList({ gaps, timezone }: { gaps: readonly IntervalView[]; timezone: string }) {
  if (gaps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No gaps this week. An agent is on shift in every coverage hour.
      </p>
    );
  }
  const total = gaps.reduce((minutes, gap) => minutes + gapLength(gap), 0);
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        <span className="font-medium text-gap">
          {gaps.length === 1 ? '1 gap' : `${gaps.length} gaps`}
        </span>{' '}
        this week. Coverage hours have no agent for {durationLabel(total)} in total.
      </p>
      <ul aria-label="Coverage gaps" className="flex flex-wrap gap-1.5 text-sm">
        {gaps.map((gap) => (
          <li
            key={gap.start}
            className="inline-flex items-baseline gap-2 rounded-md border border-gap/25 bg-gap/10 px-2 py-1"
          >
            <span className="tabular-nums">{gapText({ gap, timezone })}</span>
            <span className="text-muted-foreground tabular-nums">
              {durationLabel(gapLength(gap))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
