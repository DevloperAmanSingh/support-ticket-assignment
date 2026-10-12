// Every status, outcome, rule, and code of the wire contract. No other module spells these strings.
// The codes that stay inside the service are in `server/src/codes.ts`.

export const TicketStatus = {
  Open: 'open',
  Closed: 'closed',
  Unassigned: 'unassigned',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const Rule = {
  FewestOpen: 'FEWEST_OPEN',
  NoAgentOnShift: 'NO_AGENT_ON_SHIFT',
  AllAtLimit: 'ALL_AT_LIMIT',
  TicketClosed: 'TICKET_CLOSED',
} as const;
export type Rule = (typeof Rule)[keyof typeof Rule];

export const RejectionCode = {
  NotOnShift: 'NOT_ON_SHIFT',
  AtLimit: 'AT_LIMIT',
  MoreOpen: 'MORE_OPEN',
  AssignedMoreRecently: 'ASSIGNED_MORE_RECENTLY',
  HigherId: 'HIGHER_ID',
} as const;
export type RejectionCode = (typeof RejectionCode)[keyof typeof RejectionCode];

export const RetryOutcome = {
  Assigned: 'ASSIGNED',
  Unassigned: 'UNASSIGNED',
  Skipped: 'SKIPPED',
  Failed: 'FAILED',
} as const;
export type RetryOutcome = (typeof RetryOutcome)[keyof typeof RetryOutcome];

export const ErrorCode = {
  ValidationError: 'VALIDATION_ERROR',
  CompanyNotFound: 'COMPANY_NOT_FOUND',
  AgentNotFound: 'AGENT_NOT_FOUND',
  TicketNotFound: 'TICKET_NOT_FOUND',
  RouteNotFound: 'ROUTE_NOT_FOUND',
  LockTimeout: 'LOCK_TIMEOUT',
  InternalError: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const TicketOrder = {
  Oldest: 'oldest',
  Newest: 'newest',
} as const;
export type TicketOrder = (typeof TicketOrder)[keyof typeof TicketOrder];

export const DEFAULT_TICKET_LIMIT = 5;

/** The largest ticket limit: the largest value of the `ticket_limit` column, a 32-bit integer. */
export const MAX_TICKET_LIMIT = 2_147_483_647;
