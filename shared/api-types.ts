// The wire contract of the 9 API calls. The server and the UI both import it.
import {
  ErrorCode,
  MAX_TICKET_LIMIT,
  RejectionCode,
  RetryOutcome,
  Rule,
  TicketOrder,
  TicketStatus,
} from './codes.ts';
import {
  AgentIdSchema,
  CompanyIdSchema,
  DecisionIdSchema,
  TicketIdSchema,
} from './ids.ts';
import {
  clockTextToMinute,
  DAYS_PER_WEEK,
  isMondayDate,
  isOnTimeStep,
  isValidTimezone,
  MINUTES_PER_DAY,
} from './time.ts';
import { z } from './zod.ts';

const CLOCK_TEXT = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_END_TEXT = '24:00';
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

// ---- Shared parts ----

export const InstantSchema = z.iso.datetime({ offset: true });

export const TimezoneSchema = z
  .string()
  .refine(isValidTimezone, { error: 'timezone must be an IANA timezone name' });

const WeekdaySchema = z
  .number()
  .int()
  .min(0)
  .max(DAYS_PER_WEEK - 1);

/** A request time "HH:MM" on a 5-minute step, parsed to the minute of the day. */
const ClockTimeSchema = z
  .string()
  .regex(CLOCK_TEXT, { error: 'time must be "HH:MM"' })
  .transform(clockTextToMinute)
  .refine(isOnTimeStep, { error: 'time must be on a 5-minute step' });

/** A coverage end time, which can also be "24:00". */
const CoverageEndTimeSchema = z.union([
  z.literal(DAY_END_TEXT).transform(() => MINUTES_PER_DAY),
  ClockTimeSchema,
]);

const ClockTextSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const WindowViewSchema = z.object({
  weekday: WeekdaySchema,
  start: ClockTextSchema,
  end: ClockTextSchema,
});
export type WindowView = z.infer<typeof WindowViewSchema>;

export const AgentRefSchema = z.object({ id: AgentIdSchema, name: z.string() });
export type AgentRef = z.infer<typeof AgentRefSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({ code: z.enum(ErrorCode), message: z.string() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ---- Decision reason (also the JSON saved in `decisions.reason`) ----

export const RejectedAgentSchema = z.discriminatedUnion('code', [
  z.object({ agent_id: AgentIdSchema, code: z.literal(RejectionCode.NotOnShift) }),
  z.object({
    agent_id: AgentIdSchema,
    code: z.literal(RejectionCode.AtLimit),
    open: z.number().int(),
  }),
  z.object({
    agent_id: AgentIdSchema,
    code: z.literal(RejectionCode.MoreOpen),
    open: z.number().int(),
  }),
  z.object({
    agent_id: AgentIdSchema,
    code: z.literal(RejectionCode.AssignedMoreRecently),
    last_assigned_at: InstantSchema,
  }),
  z.object({ agent_id: AgentIdSchema, code: z.literal(RejectionCode.HigherId) }),
]);
export type RejectedAgent = z.infer<typeof RejectedAgentSchema>;

export const AssignedReasonSchema = z.object({
  rule: z.literal(Rule.FewestOpen),
  selected: z.object({
    agent_id: AgentIdSchema,
    open: z.number().int(),
    limit: z.number().int(),
    last_assigned_at: InstantSchema.nullable(),
  }),
  rejected: z.array(RejectedAgentSchema),
});
export type AssignedReason = z.infer<typeof AssignedReasonSchema>;

export const UnassignedReasonSchema = z.object({
  rule: z.literal([Rule.NoAgentOnShift, Rule.AllAtLimit]),
  selected: z.null(),
  rejected: z.array(RejectedAgentSchema),
});
export type UnassignedReason = z.infer<typeof UnassignedReasonSchema>;

export const ClosedReasonSchema = z.object({
  rule: z.literal(Rule.TicketClosed),
  selected: z.null(),
});
export type ClosedReason = z.infer<typeof ClosedReasonSchema>;

// ---- 1. POST /api/companies/{id}/assignments ----

export const AssignRequestSchema = z.object({ ticket_id: TicketIdSchema });
export type AssignRequest = z.infer<typeof AssignRequestSchema>;

const assignedFields = {
  ticket_id: TicketIdSchema,
  assigned: z.literal(true),
  agent: AgentRefSchema,
  decision_id: DecisionIdSchema,
  reason: AssignedReasonSchema,
};

const unassignedFields = {
  ticket_id: TicketIdSchema,
  assigned: z.literal(false),
  agent: z.null(),
  decision_id: DecisionIdSchema,
};

export const AssignedResponseSchema = z.strictObject(assignedFields);
export const ClosedWithAgentResponseSchema = z.strictObject({
  ...assignedFields,
  closed: z.literal(true),
});
export const UnassignedResponseSchema = z.strictObject({
  ...unassignedFields,
  reason: UnassignedReasonSchema,
});
export const ClosedWithoutAgentResponseSchema = z.strictObject({
  ...unassignedFields,
  reason: ClosedReasonSchema,
});

export const AssignResponseSchema = z.union([
  AssignedResponseSchema,
  ClosedWithAgentResponseSchema,
  UnassignedResponseSchema,
  ClosedWithoutAgentResponseSchema,
]);
export type AssignResponse = z.infer<typeof AssignResponseSchema>;

// ---- 2. POST /api/companies/{id}/tickets/{ticket_id}/close ----

export const CloseResponseSchema = z.object({
  ticket_id: TicketIdSchema,
  status: z.literal(TicketStatus.Closed),
  agent: AgentRefSchema.nullable(),
  closed_at: InstantSchema,
});
export type CloseResponse = z.infer<typeof CloseResponseSchema>;

// ---- 3. POST /api/companies/{id}/assignments/retry ----

export const RetryRequestSchema = z.union([
  z.strictObject({ ticket_id: TicketIdSchema }),
  z.strictObject({ all: z.literal(true) }),
]);
export type RetryRequest = z.infer<typeof RetryRequestSchema>;

export const RetryResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal(RetryOutcome.Assigned),
    ticket_id: TicketIdSchema,
    agent: AgentRefSchema,
    decision_id: DecisionIdSchema,
    reason: AssignedReasonSchema,
  }),
  z.object({
    outcome: z.literal(RetryOutcome.Unassigned),
    ticket_id: TicketIdSchema,
    decision_id: DecisionIdSchema,
    reason: UnassignedReasonSchema,
  }),
  z.object({
    outcome: z.literal(RetryOutcome.Skipped),
    ticket_id: TicketIdSchema,
    status: z.literal([TicketStatus.Open, TicketStatus.Closed]),
  }),
  z.object({
    outcome: z.literal(RetryOutcome.Failed),
    ticket_id: TicketIdSchema,
    error: ErrorResponseSchema.shape.error,
  }),
]);
export type RetryResult = z.infer<typeof RetryResultSchema>;

export const RetryResponseSchema = z.object({ results: z.array(RetryResultSchema) });
export type RetryResponse = z.infer<typeof RetryResponseSchema>;

// ---- 4. GET /api/companies ----

export const CompanyViewSchema = z.object({
  id: CompanyIdSchema,
  name: z.string(),
  timezone: z.string(),
});
export type CompanyView = z.infer<typeof CompanyViewSchema>;

export const CompaniesResponseSchema = z.object({ companies: z.array(CompanyViewSchema) });
export type CompaniesResponse = z.infer<typeof CompaniesResponseSchema>;

// ---- 5. GET /api/companies/{id}/agents ----

export const AgentViewSchema = z.object({
  id: AgentIdSchema,
  name: z.string(),
  timezone: z.string(),
  ticket_limit: z.number().int(),
  shifts: z.array(WindowViewSchema),
  open_count: z.number().int(),
  on_shift: z.boolean(),
});
export type AgentView = z.infer<typeof AgentViewSchema>;

export const AgentsResponseSchema = z.object({ agents: z.array(AgentViewSchema) });
export type AgentsResponse = z.infer<typeof AgentsResponseSchema>;

// ---- 6. PUT /api/companies/{id}/agents/{agent_id} ----

export const UpdateAgentRequestSchema = z.object({
  timezone: TimezoneSchema,
  ticket_limit: z
    .number()
    .int()
    .min(1, { error: 'ticket_limit must be 1 or more' })
    .max(MAX_TICKET_LIMIT, { error: `ticket_limit must be ${MAX_TICKET_LIMIT} or less` }),
  shifts: z.array(
    z
      .object({ weekday: WeekdaySchema, start: ClockTimeSchema, end: ClockTimeSchema })
      .refine((shift) => shift.start !== shift.end, {
        error: 'a shift start and end must differ',
      }),
  ),
});
/** What the UI sends: times as "HH:MM". */
export type UpdateAgentBody = z.input<typeof UpdateAgentRequestSchema>;
/** What the server reads: times as minutes of the day. */
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>;

export const UpdateAgentResponseSchema = AgentViewSchema;
export type UpdateAgentResponse = AgentView;

// ---- 7. GET /api/companies/{id}/coverage?week=YYYY-MM-DD ----

export const CoverageQuerySchema = z.object({
  week: z
    .string()
    .regex(DATE_TEXT, { error: 'week must be "YYYY-MM-DD"' })
    .refine(isMondayDate, { error: 'week must be a Monday' }),
});
export type CoverageQuery = z.infer<typeof CoverageQuerySchema>;

export const IntervalViewSchema = z.object({ start: InstantSchema, end: InstantSchema });
export type IntervalView = z.infer<typeof IntervalViewSchema>;

export const CoverageResponseSchema = z.object({
  timezone: z.string(),
  week_start: InstantSchema,
  week_end: InstantSchema,
  hours: z.array(WindowViewSchema),
  gaps: z.array(IntervalViewSchema),
  agents: z.array(
    z.object({
      agent_id: AgentIdSchema,
      name: z.string(),
      timezone: z.string(),
      intervals: z.array(IntervalViewSchema),
    }),
  ),
});
export type CoverageResponse = z.infer<typeof CoverageResponseSchema>;

// ---- 8. PUT /api/companies/{id}/coverage-hours ----

export const UpdateCoverageHoursRequestSchema = z.object({
  hours: z.array(
    z
      .object({ weekday: WeekdaySchema, start: ClockTimeSchema, end: CoverageEndTimeSchema })
      .refine((range) => range.start < range.end, {
        error: 'a coverage range must start before it ends',
      }),
  ),
});
export type UpdateCoverageHoursBody = z.input<typeof UpdateCoverageHoursRequestSchema>;
export type UpdateCoverageHoursRequest = z.infer<typeof UpdateCoverageHoursRequestSchema>;

export const CoverageHoursResponseSchema = z.object({ hours: z.array(WindowViewSchema) });
export type CoverageHoursResponse = z.infer<typeof CoverageHoursResponseSchema>;

// ---- 9. GET /api/companies/{id}/tickets?status=&order= ----

export const TicketsQuerySchema = z.object({
  status: z.enum(TicketStatus).optional(),
  order: z.enum(TicketOrder).default(TicketOrder.Oldest),
});
export type TicketsQuery = z.infer<typeof TicketsQuerySchema>;

const ticketFields = {
  ticket_id: TicketIdSchema,
  created_at: InstantSchema,
  decision_id: DecisionIdSchema,
};

export const TicketViewSchema = z.discriminatedUnion('status', [
  z.object({
    ...ticketFields,
    status: z.literal(TicketStatus.Open),
    agent: AgentRefSchema,
    assigned_at: InstantSchema,
    closed_at: z.null(),
    reason: AssignedReasonSchema,
  }),
  z.object({
    ...ticketFields,
    status: z.literal(TicketStatus.Unassigned),
    agent: z.null(),
    assigned_at: z.null(),
    closed_at: z.null(),
    reason: UnassignedReasonSchema,
  }),
  z.object({
    ...ticketFields,
    status: z.literal(TicketStatus.Closed),
    agent: AgentRefSchema.nullable(),
    assigned_at: InstantSchema.nullable(),
    closed_at: InstantSchema,
    reason: z.union([AssignedReasonSchema, UnassignedReasonSchema]),
  }),
]);
export type TicketView = z.infer<typeof TicketViewSchema>;

export const TicketsResponseSchema = z.object({ tickets: z.array(TicketViewSchema) });
export type TicketsResponse = z.infer<typeof TicketsResponseSchema>;
