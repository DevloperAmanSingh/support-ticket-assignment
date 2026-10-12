// The codes that stay inside the service. The codes of the wire contract are in `shared/codes.ts`.

export const DecisionOutcome = {
  Assigned: 'assigned',
  Unassigned: 'unassigned',
} as const;
export type DecisionOutcome = (typeof DecisionOutcome)[keyof typeof DecisionOutcome];

export const DecisionKind = {
  Assigned: 'assigned',
  Unassigned: 'unassigned',
  ClosedWithAgent: 'closed_with_agent',
  ClosedWithoutAgent: 'closed_without_agent',
} as const;
export type DecisionKind = (typeof DecisionKind)[keyof typeof DecisionKind];

export const RetryScope = {
  One: 'one',
  All: 'all',
} as const;
export type RetryScope = (typeof RetryScope)[keyof typeof RetryScope];

export const PgErrorCode = {
  LockNotAvailable: '55P03',
} as const;
export type PgErrorCode = (typeof PgErrorCode)[keyof typeof PgErrorCode];
