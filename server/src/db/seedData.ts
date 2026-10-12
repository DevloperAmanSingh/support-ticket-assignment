// The sample companies, agents, shifts, and coverage hours. No database and no clock: the same
// instant gives the same data.
//
// The agents have a weekly pattern. Around the instant of the seed the pattern is adjusted, so
// a demo finds the same team state at any hour of any day: four Acme agents on shift, three off.
import type { DateTime } from 'luxon';

import { AgentIdSchema, CompanyIdSchema } from '../../../shared/ids.ts';
import type { AgentId, CompanyId } from '../../../shared/ids.ts';
import {
  clockTextToMinute,
  DAYS_PER_WEEK,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MINUTES_PER_WEEK,
} from '../../../shared/time.ts';
import type { WeeklyWindow } from '../domain/time.ts';

const SUNDAY = 0;
const SATURDAY = 6;
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

/** The demo shift starts this long before the seed, counted from the full hour. */
const DEMO_LEAD_HOURS = 2;
/** The demo shift lasts this long, so it holds for at least five hours after the seed. */
const DEMO_SHIFT_HOURS = 8;

export type SeedAgent = {
  readonly id: AgentId;
  readonly name: string;
  readonly timezone: string;
  readonly ticketLimit: number;
  readonly shifts: readonly WeeklyWindow[];
};

export type SeedCompany = {
  readonly id: CompanyId;
  readonly name: string;
  readonly timezone: string;
  readonly hours: readonly WeeklyWindow[];
  readonly agents: readonly SeedAgent[];
};

/** Where an agent is at the instant of the seed. */
const Presence = {
  /** On shift from two hours before the seed to at least five hours after it. */
  OnShift: 'on_shift',
  /** Off shift for the same time. */
  OffShift: 'off_shift',
  /** As the weekly pattern says. */
  AsScheduled: 'as_scheduled',
} as const;
type Presence = (typeof Presence)[keyof typeof Presence];

type AgentPlan = {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  readonly ticketLimit: number;
  /** The weekly pattern, in the agent's own local time. */
  readonly pattern: readonly WeeklyWindow[];
  readonly presence: Presence;
};

function daily({
  days,
  start,
  end,
}: {
  days: readonly number[];
  start: string;
  end: string;
}): WeeklyWindow[] {
  return days.map((weekday) => ({
    weekday,
    startMinute: clockTextToMinute(start),
    endMinute: clockTextToMinute(end),
  }));
}

export const ACME_ID = CompanyIdSchema.parse('acme');
export const GLOBEX_ID = CompanyIdSchema.parse('globex');
const ACME_TIMEZONE = 'America/New_York';

// Acme: seven agents in three timezones. Sam and Lee alone cover Monday to Friday 09:00 to 18:00
// in New York, so the week has no gap but the one the seed leaves open on purpose.
const ACME_AGENTS: readonly AgentPlan[] = [
  {
    id: 'a1',
    name: 'Priya',
    timezone: 'Asia/Kolkata',
    ticketLimit: 5,
    pattern: daily({ days: WEEKDAYS, start: '18:30', end: '03:30' }),
    presence: Presence.OnShift,
  },
  {
    id: 'a2',
    name: 'Sam',
    timezone: ACME_TIMEZONE,
    ticketLimit: 5,
    pattern: daily({ days: WEEKDAYS, start: '09:00', end: '17:00' }),
    presence: Presence.OnShift,
  },
  {
    // A limit of 2: the sample tickets fill it, so one agent on shift is at the ticket limit.
    id: 'a3',
    name: 'Lee',
    timezone: ACME_TIMEZONE,
    ticketLimit: 2,
    pattern: daily({ days: WEEKDAYS, start: '10:00', end: '18:00' }),
    presence: Presence.OnShift,
  },
  {
    // The overnight shift: it starts in the evening and ends on the next morning.
    id: 'a4',
    name: 'Rahul',
    timezone: 'Asia/Kolkata',
    ticketLimit: 4,
    pattern: daily({ days: WEEKDAYS, start: '22:00', end: '06:00' }),
    presence: Presence.OffShift,
  },
  {
    id: 'a5',
    name: 'Emma',
    timezone: 'Europe/London',
    ticketLimit: 4,
    pattern: daily({ days: WEEKDAYS, start: '13:00', end: '21:00' }),
    presence: Presence.OnShift,
  },
  {
    id: 'a6',
    name: 'Aisha',
    timezone: 'Europe/London',
    ticketLimit: 3,
    pattern: daily({ days: WEEKDAYS, start: '07:00', end: '15:00' }),
    presence: Presence.OffShift,
  },
  {
    id: 'a7',
    name: 'Carlos',
    timezone: ACME_TIMEZONE,
    ticketLimit: 5,
    pattern: daily({ days: WEEKDAYS, start: '14:00', end: '22:00' }),
    presence: Presence.OffShift,
  },
];

// Globex has no coverage-hours rows, so every hour of every day needs an agent.
const GLOBEX_AGENTS: readonly AgentPlan[] = [
  {
    id: 'b1',
    name: 'Anita',
    timezone: 'Asia/Kolkata',
    ticketLimit: 5,
    pattern: daily({ days: WEEKDAYS, start: '09:00', end: '17:00' }),
    presence: Presence.AsScheduled,
  },
  {
    id: 'b2',
    name: 'Vikram',
    timezone: 'Asia/Kolkata',
    ticketLimit: 5,
    pattern: daily({ days: WEEKDAYS, start: '13:00', end: '21:00' }),
    presence: Presence.AsScheduled,
  },
  {
    id: 'b3',
    name: 'Oliver',
    timezone: 'Europe/London',
    ticketLimit: 4,
    pattern: daily({ days: WEEKDAYS, start: '09:00', end: '17:00' }),
    presence: Presence.AsScheduled,
  },
  {
    id: 'b4',
    name: 'Grace',
    timezone: 'America/New_York',
    ticketLimit: 5,
    pattern: daily({ days: WEEKDAYS, start: '09:00', end: '17:00' }),
    presence: Presence.AsScheduled,
  },
  {
    id: 'b5',
    name: 'Diego',
    timezone: 'America/New_York',
    ticketLimit: 2,
    pattern: daily({ days: [SATURDAY, SUNDAY], start: '22:00', end: '06:00' }),
    presence: Presence.AsScheduled,
  },
];

/** A range of local minutes counted from Sunday 00:00. It can run past the end of the week. */
type Span = { readonly start: number; readonly end: number };

function toSpan(window: WeeklyWindow): Span {
  const start = window.weekday * MINUTES_PER_DAY + window.startMinute;
  // A shift never has equal start and end, so its length is 1 to 1439 minutes.
  const length = (window.endMinute - window.startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { start, end: start + length };
}

function toWindow({ start, end }: Span): WeeklyWindow {
  const startInWeek = ((start % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  return {
    weekday: Math.floor(startInWeek / MINUTES_PER_DAY),
    startMinute: startInWeek % MINUTES_PER_DAY,
    endMinute: ((end % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY,
  };
}

/** Finds the minutes a weekly window shares with a span, on the week before, the same week, or the next. */
function overlapWith({ window, span }: { window: WeeklyWindow; span: Span }): Span | null {
  const own = toSpan(window);
  for (const offset of [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK]) {
    const moved = { start: own.start + offset, end: own.end + offset };
    if (moved.start < span.end && span.start < moved.end) return moved;
  }
  return null;
}

/** The span of the demo shift on the wall clock of a timezone. It starts on a full hour. */
function demoSpan({ now, timezone }: { now: DateTime; timezone: string }): Span {
  const local = now.setZone(timezone).minus({ hours: DEMO_LEAD_HOURS }).startOf('hour');
  const start = (local.weekday % DAYS_PER_WEEK) * MINUTES_PER_DAY + local.hour * MINUTES_PER_HOUR;
  return { start, end: start + DEMO_SHIFT_HOURS * MINUTES_PER_HOUR };
}

/**
 * Puts the demo shift into a weekly pattern. A shift of the pattern that overlaps it becomes one
 * longer shift with it, so the pattern loses no hour and no two shifts overlap.
 */
function withDemoShift({
  pattern,
  span,
}: {
  pattern: readonly WeeklyWindow[];
  span: Span;
}): WeeklyWindow[] {
  for (const window of pattern) {
    const overlap = overlapWith({ window, span });
    if (overlap !== null) {
      return withDemoShift({
        pattern: pattern.filter((other) => other !== window),
        span: { start: Math.min(span.start, overlap.start), end: Math.max(span.end, overlap.end) },
      });
    }
  }
  if (span.end - span.start >= MINUTES_PER_DAY) {
    throw new Error('The demo shift and the weekly pattern make a shift of a day or more');
  }
  return [...pattern, toWindow(span)];
}

function shiftsAt({ plan, now }: { plan: AgentPlan; now: DateTime }): WeeklyWindow[] {
  const { pattern, presence, timezone } = plan;
  switch (presence) {
    case Presence.OnShift:
      return withDemoShift({ pattern, span: demoSpan({ now, timezone }) });
    case Presence.OffShift: {
      const span = demoSpan({ now, timezone });
      return pattern.filter((window) => overlapWith({ window, span }) === null);
    }
    case Presence.AsScheduled:
      return [...pattern];
    default: {
      const _exhaustive: never = presence;
      return _exhaustive;
    }
  }
}

function toSeedAgent({ plan, now }: { plan: AgentPlan; now: DateTime }): SeedAgent {
  return {
    id: AgentIdSchema.parse(plan.id),
    name: plan.name,
    timezone: plan.timezone,
    ticketLimit: plan.ticketLimit,
    shifts: shiftsAt({ plan, now }),
  };
}

/**
 * The weekday of the Acme coverage gap: Saturday, or Sunday when the seed runs on a Saturday.
 * The demo shifts are on the day of the seed, so the gap is on another day of the same week.
 */
export function acmeGapWeekday(now: DateTime): number {
  const today = now.setZone(ACME_TIMEZONE).weekday % DAYS_PER_WEEK;
  return today === SATURDAY ? SUNDAY : SATURDAY;
}

/** The start of the latest day before today that has the weekday of the Acme gap, in New York time. */
export function lastAcmeGapDay(now: DateTime): DateTime {
  const today = now.setZone(ACME_TIMEZONE).startOf('day');
  const daysBack =
    ((today.weekday % DAYS_PER_WEEK) - acmeGapWeekday(now) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return today.minus({ days: daysBack === 0 ? DAYS_PER_WEEK : daysBack });
}

/** Builds the sample data for a seed at `now`: Acme with seven agents, Globex with five. */
export function buildSampleData(now: DateTime): SeedCompany[] {
  return [
    {
      id: ACME_ID,
      name: 'Acme Support',
      timezone: ACME_TIMEZONE,
      // Acme needs an agent Monday to Friday 09:00 to 18:00, and 09:00 to 13:00 on the gap day.
      // No pattern has a shift then, so those four hours are the one coverage gap of each week.
      hours: [
        ...daily({ days: WEEKDAYS, start: '09:00', end: '18:00' }),
        ...daily({ days: [acmeGapWeekday(now)], start: '09:00', end: '13:00' }),
      ],
      agents: ACME_AGENTS.map((plan) => toSeedAgent({ plan, now })),
    },
    {
      id: GLOBEX_ID,
      name: 'Globex Helpdesk',
      timezone: 'Asia/Kolkata',
      hours: [],
      agents: GLOBEX_AGENTS.map((plan) => toSeedAgent({ plan, now })),
    },
  ];
}
