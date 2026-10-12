import { describe, expect, it } from 'vitest';

import { acmeCoverage, acmeHours, AgentIds } from '@/test/fixtures.ts';
import { fallBackCoverage, springForwardCoverage } from '@/test/dstCoverage.ts';
import { scaleClock } from './dayScale.ts';

import {
  buildWeekLayout,
  gapMinutes,
  mergeSegments,
  MinuteState,
  readMinute,
  subtractSegments,
} from './layout.ts';

const MONDAY = 0;
const SATURDAY = 5;

describe('daylight-saving layout', () => {
  it('keeps both repeated shifts and all 120 real gap minutes', () => {
    const sunday = buildWeekLayout(fallBackCoverage)[6];
    if (sunday === undefined) throw new Error('Missing Sunday');
    expect(sunday.scale.minutes).toBe(1500);
    expect(sunday.hours).toEqual([{ start: 60, end: 240 }]);
    expect(sunday.lanes[0]?.segments).toEqual([{ start: 75, end: 105 }, { start: 135, end: 165 }]);
    expect(sunday.gaps).toEqual([{ start: 60, end: 75 }, { start: 105, end: 135 }, { start: 165, end: 240 }]);
    expect(gapMinutes(sunday)).toBe(120);
    expect(readMinute({ layout: sunday, minute: 120 }).kind).toBe(MinuteState.Gap);
    expect(readMinute({ layout: sunday, minute: 80 }).kind).toBe(MinuteState.Staffed);
    expect(readMinute({ layout: sunday, minute: 140 }).kind).toBe(MinuteState.Staffed);
    expect(scaleClock({ scale: sunday.scale, minute: 75 })).toBe('01:15 UTC-04:00');
    expect(scaleClock({ scale: sunday.scale, minute: 135 })).toBe('01:15 UTC-05:00');
  });

  it('omits the nonexistent spring hour from coverage, staffing, and gaps', () => {
    const sunday = buildWeekLayout(springForwardCoverage)[6];
    if (sunday === undefined) throw new Error('Missing Sunday');
    expect(sunday.scale.minutes).toBe(1380);
    expect(sunday.hours).toEqual([{ start: 60, end: 180 }]);
    expect(sunday.lanes[0]?.segments).toEqual([{ start: 120, end: 135 }]);
    expect(sunday.gaps).toEqual([{ start: 60, end: 120 }, { start: 135, end: 180 }]);
    expect(gapMinutes(sunday)).toBe(105);
    expect(scaleClock({ scale: sunday.scale, minute: 120 })).toBe('03:00 UTC-04:00');
    expect(readMinute({ layout: sunday, minute: 120 }).kind).toBe(MinuteState.Staffed);
  });

  it('projects coverage windows inside the repeated hour twice', () => {
    const sunday = buildWeekLayout({
      ...fallBackCoverage,
      hours: [{ weekday: 0, start: '01:15', end: '01:45' }],
    })[6];
    expect(sunday?.hours).toEqual([{ start: 75, end: 105 }, { start: 135, end: 165 }]);
  });

  it('does not create coverage for a window entirely inside a missing hour', () => {
    const sunday = buildWeekLayout({
      ...springForwardCoverage,
      hours: [{ weekday: 0, start: '02:15', end: '02:45' }],
    })[6];
    expect(sunday?.hours).toEqual([]);
  });

  it('handles the half-hour fall-back in Lord Howe', () => {
    const sunday = buildWeekLayout({
      ...fallBackCoverage,
      timezone: 'Australia/Lord_Howe',
      week_start: '2026-03-30T00:00:00+11:00',
      week_end: '2026-04-06T00:00:00+10:30',
      hours: [{ weekday: 0, start: '01:30', end: '02:30' }],
      agents: [],
      gaps: [{ start: '2026-04-05T01:30:00+11:00', end: '2026-04-05T02:30:00+10:30' }],
    })[6];
    if (sunday === undefined) throw new Error('Missing Sunday');
    expect(sunday.scale.minutes).toBe(1470);
    expect(sunday.hours).toEqual([{ start: 90, end: 180 }]);
    expect(gapMinutes(sunday)).toBe(90);
    expect(scaleClock({ scale: sunday.scale, minute: 120 })).toBe('01:30 UTC+10:30');
  });

  it('finds the Chatham clock jump at 02:45 inside an hourly block', () => {
    const sunday = buildWeekLayout({
      ...fallBackCoverage,
      timezone: 'Pacific/Chatham',
      week_start: '2026-09-21T00:00:00+12:45',
      week_end: '2026-09-28T00:00:00+13:45',
      hours: [{ weekday: 0, start: '02:30', end: '04:00' }],
      agents: [],
      gaps: [{ start: '2026-09-27T02:30:00+12:45', end: '2026-09-27T04:00:00+13:45' }],
    })[6];
    if (sunday === undefined) throw new Error('Missing Sunday');
    expect(sunday.scale.minutes).toBe(1380);
    expect(sunday.hours).toEqual([{ start: 150, end: 180 }]);
    expect(gapMinutes(sunday)).toBe(30);
    expect(scaleClock({ scale: sunday.scale, minute: 165 })).toBe('03:45 UTC+13:45');
  });
});

describe('week layout', () => {
  const coverage = acmeCoverage({ monday: '2026-10-12', hours: acmeHours() });
  const days = buildWeekLayout(coverage);

  it('has one row per day from Monday in the company timezone', () => {
    expect(days.map((layout) => layout.day.label)).toEqual([
      'Mon 12 Oct',
      'Tue 13 Oct',
      'Wed 14 Oct',
      'Thu 15 Oct',
      'Fri 16 Oct',
      'Sat 17 Oct',
      'Sun 18 Oct',
    ]);
  });

  it('places each agent interval by its minutes of the day', () => {
    expect(days[MONDAY]?.lanes).toEqual([
      { agentId: AgentIds.Sam, name: 'Sam', segments: [{ start: 540, end: 1020 }] },
      { agentId: AgentIds.Lee, name: 'Lee', segments: [{ start: 600, end: 1080 }] },
    ]);
  });

  it('marks the Saturday gap inside coverage hours and the rest of the day outside', () => {
    expect(days[SATURDAY]?.hours).toEqual([{ start: 540, end: 780 }]);
    expect(days[SATURDAY]?.gaps).toEqual([{ start: 540, end: 780 }]);
    expect(days[SATURDAY]?.offHoursGaps).toEqual([
      { start: 0, end: 540 },
      { start: 780, end: 1440 },
    ]);
  });

  it('has no gap on a day with an agent in every coverage hour', () => {
    expect(days[MONDAY]?.gaps).toEqual([]);
    expect(days[MONDAY]?.offHoursGaps).toEqual([
      { start: 0, end: 540 },
      { start: 1080, end: 1440 },
    ]);
  });

  it('cuts an overnight interval at local midnight', () => {
    const overnight = buildWeekLayout({
      ...coverage,
      agents: [
        {
          agent_id: AgentIds.Rahul,
          name: 'Rahul',
          timezone: 'Asia/Kolkata',
          // 22:00 to 06:00 in Kolkata is 12:30 to 20:30 in New York; here a shift over midnight there.
          intervals: [{ start: '2026-10-12T22:00:00-04:00', end: '2026-10-13T06:00:00-04:00' }],
        },
      ],
    });

    expect(overnight[0]?.lanes[0]?.segments).toEqual([{ start: 1320, end: 1440 }]);
    expect(overnight[1]?.lanes[0]?.segments).toEqual([{ start: 0, end: 360 }]);
  });

  it('treats no coverage rows as every hour of every day', () => {
    const always = buildWeekLayout({ ...coverage, hours: [] });

    expect(always.every((layout) => layout.hours[0]?.end === 1440)).toBe(true);
  });
});

describe('reading one minute', () => {
  const days = buildWeekLayout(acmeCoverage({ monday: '2026-10-12', hours: acmeHours() }));
  const monday = days[MONDAY];
  const saturday = days[SATURDAY];
  if (monday === undefined || saturday === undefined) throw new Error('The week has seven days');

  it('lists every agent on shift with the bar that holds the minute', () => {
    expect(readMinute({ layout: monday, minute: 600 })).toEqual({
      kind: MinuteState.Staffed,
      inCoverageHours: true,
      onShift: [
        { agentId: AgentIds.Sam, name: 'Sam', lane: 0, segment: { start: 540, end: 1020 } },
        { agentId: AgentIds.Lee, name: 'Lee', lane: 1, segment: { start: 600, end: 1080 } },
      ],
    });
  });

  it('treats the end of a shift as off shift', () => {
    const atSamEnd = readMinute({ layout: monday, minute: 1020 });

    expect(atSamEnd).toMatchObject({ kind: MinuteState.Staffed });
    expect(atSamEnd.kind === MinuteState.Staffed && atSamEnd.onShift.map(({ name }) => name)).toEqual([
      'Lee',
    ]);
  });

  it('reads a coverage hour with nobody on shift as a gap', () => {
    expect(readMinute({ layout: saturday, minute: 660 })).toEqual({
      kind: MinuteState.Gap,
      gap: { start: 540, end: 780 },
    });
  });

  it('reads nobody on shift outside coverage hours as off hours', () => {
    expect(readMinute({ layout: saturday, minute: 780 })).toEqual({ kind: MinuteState.OffHours });
    expect(readMinute({ layout: monday, minute: 120 })).toEqual({ kind: MinuteState.OffHours });
  });

  it('adds up the gap minutes of a day', () => {
    expect(gapMinutes(saturday)).toBe(240);
    expect(gapMinutes(monday)).toBe(0);
  });
});

describe('segments', () => {
  it('joins segments that overlap or touch', () => {
    expect(
      mergeSegments([
        { start: 600, end: 1080 },
        { start: 540, end: 1020 },
        { start: 1080, end: 1100 },
        { start: 1200, end: 1300 },
      ]),
    ).toEqual([
      { start: 540, end: 1100 },
      { start: 1200, end: 1300 },
    ]);
  });

  it('removes holes from a segment', () => {
    expect(
      subtractSegments({
        from: [{ start: 0, end: 1440 }],
        remove: [
          { start: 0, end: 60 },
          { start: 540, end: 780 },
        ],
      }),
    ).toEqual([
      { start: 60, end: 540 },
      { start: 780, end: 1440 },
    ]);
  });
});
