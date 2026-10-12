// Fixtures that mirror the seed in `server/src/db/seed.ts`: Acme with five agents and three open
// tickets, plus two unassigned tickets so the badge and the retry have something to show.
import type {
  AgentView,
  AssignedReason,
  CompanyView,
  CoverageResponse,
  IntervalView,
  TicketView,
  UnassignedReason,
  WindowView,
} from '@shared/api-types.ts';
import { RejectionCode, Rule, TicketStatus } from '@shared/codes.ts';
import {
  AgentIdSchema,
  CompanyIdSchema,
  DecisionIdSchema,
  TicketIdSchema,
} from '@shared/ids.ts';
import type { AgentId, DecisionId } from '@shared/ids.ts';

const SUNDAY = 0;
const SATURDAY = 6;
const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const MS_PER_DAY = 86_400_000;
const DAY_END = '24:00';
/** New York in October 2026, before the clocks go back on 1 November. */
const ACME_OFFSET = '-04:00';

export const ACME: CompanyView = {
  id: CompanyIdSchema.parse('acme'),
  name: 'Acme Support',
  timezone: 'America/New_York',
};

export const GLOBEX: CompanyView = {
  id: CompanyIdSchema.parse('globex'),
  name: 'Globex Helpdesk',
  timezone: 'Asia/Kolkata',
};

export const AgentIds = {
  Priya: AgentIdSchema.parse('a1'),
  Sam: AgentIdSchema.parse('a2'),
  Lee: AgentIdSchema.parse('a3'),
  Rahul: AgentIdSchema.parse('a4'),
  Emma: AgentIdSchema.parse('a5'),
} as const;

function daily({
  days,
  start,
  end,
}: {
  days: readonly number[];
  start: string;
  end: string;
}): WindowView[] {
  return days.map((weekday) => ({ weekday, start, end }));
}

/** The agents as the service shows them on a Wednesday at 11:00 in New York. */
export function acmeAgents(): AgentView[] {
  return [
    {
      id: AgentIds.Priya,
      name: 'Priya',
      timezone: 'Asia/Kolkata',
      ticket_limit: 5,
      shifts: daily({ days: WEEKDAYS, start: '18:30', end: '03:30' }),
      open_count: 0,
      on_shift: true,
    },
    {
      id: AgentIds.Sam,
      name: 'Sam',
      timezone: 'America/New_York',
      ticket_limit: 5,
      shifts: daily({ days: WEEKDAYS, start: '09:00', end: '17:00' }),
      open_count: 2,
      on_shift: true,
    },
    {
      id: AgentIds.Lee,
      name: 'Lee',
      timezone: 'America/New_York',
      ticket_limit: 3,
      shifts: daily({ days: WEEKDAYS, start: '10:00', end: '18:00' }),
      open_count: 1,
      on_shift: true,
    },
    {
      id: AgentIds.Rahul,
      name: 'Rahul',
      timezone: 'Asia/Kolkata',
      ticket_limit: 5,
      shifts: daily({ days: [SUNDAY, 1, 2, 3, 4], start: '22:00', end: '06:00' }),
      open_count: 0,
      on_shift: false,
    },
    {
      id: AgentIds.Emma,
      name: 'Emma',
      timezone: 'Europe/London',
      ticket_limit: 4,
      shifts: daily({ days: WEEKDAYS, start: '13:00', end: '21:00' }),
      open_count: 0,
      on_shift: true,
    },
  ];
}

/** Acme needs an agent Monday to Friday 09:00 to 18:00 and Saturday 09:00 to 13:00. */
export function acmeHours(): WindowView[] {
  return [
    ...daily({ days: WEEKDAYS, start: '09:00', end: '18:00' }),
    ...daily({ days: [SATURDAY], start: '09:00', end: '13:00' }),
  ];
}

export function decisionId(value: number): DecisionId {
  return DecisionIdSchema.parse(value);
}

/** The reason of a ticket that went to an agent with nobody rejected, as the seed writes it. */
function seedReason({ agentId, limit }: { agentId: AgentId; limit: number }): AssignedReason {
  return {
    rule: Rule.FewestOpen,
    selected: { agent_id: agentId, open: 0, limit, last_assigned_at: null },
    rejected: [],
  };
}

/** The reason of a ticket that arrived when nobody was on shift. */
export function nobodyOnShiftReason(): UnassignedReason {
  return {
    rule: Rule.NoAgentOnShift,
    selected: null,
    rejected: Object.values(AgentIds).map((agentId) => ({
      agent_id: agentId,
      code: RejectionCode.NotOnShift,
    })),
  };
}

export const TicketIds = {
  T101: TicketIdSchema.parse('T-101'),
  T102: TicketIdSchema.parse('T-102'),
  T103: TicketIdSchema.parse('T-103'),
  T104: TicketIdSchema.parse('T-104'),
  T105: TicketIdSchema.parse('T-105'),
} as const;

/** Three open tickets from the seed, then two that arrived in the night and stayed unassigned. */
export function acmeTickets(): TicketView[] {
  const open = [
    { ticketId: TicketIds.T101, agentId: AgentIds.Sam, name: 'Sam', limit: 5, at: '12:00' },
    { ticketId: TicketIds.T102, agentId: AgentIds.Lee, name: 'Lee', limit: 3, at: '13:00' },
    { ticketId: TicketIds.T103, agentId: AgentIds.Sam, name: 'Sam', limit: 5, at: '14:00' },
  ].map(
    ({ ticketId, agentId, name, limit, at }, index): TicketView => ({
      ticket_id: ticketId,
      created_at: `2026-10-14T${at}:00Z`,
      decision_id: decisionId(index + 1),
      status: TicketStatus.Open,
      agent: { id: agentId, name },
      assigned_at: `2026-10-14T${at}:00Z`,
      closed_at: null,
      reason: seedReason({ agentId, limit }),
    }),
  );
  const unassigned = [
    { ticketId: TicketIds.T104, at: '05:00' },
    { ticketId: TicketIds.T105, at: '06:00' },
  ].map(
    ({ ticketId, at }, index): TicketView => ({
      ticket_id: ticketId,
      created_at: `2026-10-14T${at}:00Z`,
      decision_id: decisionId(index + 4),
      status: TicketStatus.Unassigned,
      agent: null,
      assigned_at: null,
      closed_at: null,
      reason: nobodyOnShiftReason(),
    }),
  );
  return [...open, ...unassigned];
}

function dateAfter({ date, days }: { date: string; days: number }): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function acmeInterval({ date, start, end }: { date: string; start: string; end: string }): IntervalView {
  // "24:00" is not a time of a day: an interval that ends there ends at 00:00 of the next date.
  const endsAt =
    end === DAY_END ? `${dateAfter({ date, days: 1 })}T00:00` : `${date}T${end}`;
  return { start: `${date}T${start}:00${ACME_OFFSET}`, end: `${endsAt}:00${ACME_OFFSET}` };
}

/**
 * The coverage of one Acme week in New York time. Sam and Lee work Monday to Friday, and nobody
 * works on Saturday, so each Saturday coverage range is a gap.
 */
export function acmeCoverage({
  monday,
  hours,
}: {
  monday: string;
  hours: readonly WindowView[];
}): CoverageResponse {
  const workdays = [0, 1, 2, 3, 4].map((days) => dateAfter({ date: monday, days }));
  const saturday = dateAfter({ date: monday, days: 5 });
  return {
    timezone: ACME.timezone,
    week_start: `${monday}T00:00:00${ACME_OFFSET}`,
    week_end: `${dateAfter({ date: monday, days: 7 })}T00:00:00${ACME_OFFSET}`,
    hours: [...hours],
    gaps: hours
      .filter((range) => range.weekday === SATURDAY)
      .map((range) => acmeInterval({ date: saturday, start: range.start, end: range.end })),
    agents: [
      {
        agent_id: AgentIds.Sam,
        name: 'Sam',
        timezone: 'America/New_York',
        intervals: workdays.map((date) => acmeInterval({ date, start: '09:00', end: '17:00' })),
      },
      {
        agent_id: AgentIds.Lee,
        name: 'Lee',
        timezone: 'America/New_York',
        intervals: workdays.map((date) => acmeInterval({ date, start: '10:00', end: '18:00' })),
      },
    ],
  };
}
