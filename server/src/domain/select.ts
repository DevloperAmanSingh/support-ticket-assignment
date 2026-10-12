import type { DateTime } from 'luxon';

import { DecisionOutcome } from '../codes.ts';
import { RejectionCode, Rule } from '../../../shared/codes.ts';
import type { AgentId } from '../../../shared/ids.ts';
import { isOnShift } from './time.ts';
import type { WeeklyWindow } from './time.ts';

export type AgentSnapshot = {
  readonly id: AgentId;
  readonly name: string;
  readonly timezone: string;
  readonly ticketLimit: number;
  readonly shifts: readonly WeeklyWindow[];
  readonly openCount: number;
  readonly lastAssignedAt: DateTime | null;
};

export type Rejection =
  | { readonly code: typeof RejectionCode.NotOnShift; readonly agentId: AgentId }
  | { readonly code: typeof RejectionCode.AtLimit; readonly agentId: AgentId; readonly open: number }
  | { readonly code: typeof RejectionCode.MoreOpen; readonly agentId: AgentId; readonly open: number }
  | {
      readonly code: typeof RejectionCode.AssignedMoreRecently;
      readonly agentId: AgentId;
      readonly lastAssignedAt: DateTime;
    }
  | { readonly code: typeof RejectionCode.HigherId; readonly agentId: AgentId };

export type SelectedAgent = {
  readonly agentId: AgentId;
  readonly name: string;
  readonly open: number;
  readonly limit: number;
  readonly lastAssignedAt: DateTime | null;
};

export type AssignedSelection = {
  readonly kind: typeof DecisionOutcome.Assigned;
  // An assignment always records FEWEST_OPEN. The tie-break that decided shows in the rejected codes.
  readonly rule: typeof Rule.FewestOpen;
  readonly selected: SelectedAgent;
  readonly rejected: readonly Rejection[];
};

export type UnassignedSelection = {
  readonly kind: typeof DecisionOutcome.Unassigned;
  readonly rule: typeof Rule.NoAgentOnShift | typeof Rule.AllAtLimit;
  readonly rejected: readonly Rejection[];
};

export type Selection = AssignedSelection | UnassignedSelection;

function compareIds(a: AgentId, b: AgentId): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function compareLastAssigned(a: DateTime | null, b: DateTime | null): number {
  if (a === null) return b === null ? 0 : -1;
  if (b === null) return 1;
  return a.toMillis() - b.toMillis();
}

function compareEligible(a: AgentSnapshot, b: AgentSnapshot): number {
  return (
    a.openCount - b.openCount ||
    compareLastAssigned(a.lastAssignedAt, b.lastAssignedAt) ||
    compareIds(a.id, b.id)
  );
}

function rejectAgainstWinner(agent: AgentSnapshot, winner: AgentSnapshot): Rejection {
  if (agent.openCount > winner.openCount) {
    return { code: RejectionCode.MoreOpen, agentId: agent.id, open: agent.openCount };
  }
  if (
    agent.lastAssignedAt !== null &&
    compareLastAssigned(agent.lastAssignedAt, winner.lastAssignedAt) > 0
  ) {
    return {
      code: RejectionCode.AssignedMoreRecently,
      agentId: agent.id,
      lastAssignedAt: agent.lastAssignedAt,
    };
  }
  return { code: RejectionCode.HigherId, agentId: agent.id };
}

export function selectAgent({
  now,
  agents,
}: {
  now: DateTime;
  agents: readonly AgentSnapshot[];
}): Selection {
  const ordered = [...agents].sort((a, b) => compareIds(a.id, b.id));
  const onShift = ordered.filter((agent) =>
    isOnShift({ now, timezone: agent.timezone, shifts: agent.shifts }),
  );
  const onShiftIds = new Set(onShift.map((agent) => agent.id));
  const eligible = onShift.filter((agent) => agent.openCount < agent.ticketLimit);
  const eligibleIds = new Set(eligible.map((agent) => agent.id));

  const rejectIneligible = (agent: AgentSnapshot): Rejection =>
    onShiftIds.has(agent.id)
      ? { code: RejectionCode.AtLimit, agentId: agent.id, open: agent.openCount }
      : { code: RejectionCode.NotOnShift, agentId: agent.id };

  const [winner] = [...eligible].sort(compareEligible);
  if (winner === undefined) {
    return {
      kind: DecisionOutcome.Unassigned,
      rule: onShift.length === 0 ? Rule.NoAgentOnShift : Rule.AllAtLimit,
      rejected: ordered.map(rejectIneligible),
    };
  }

  return {
    kind: DecisionOutcome.Assigned,
    rule: Rule.FewestOpen,
    selected: {
      agentId: winner.id,
      name: winner.name,
      open: winner.openCount,
      limit: winner.ticketLimit,
      lastAssignedAt: winner.lastAssignedAt,
    },
    rejected: ordered
      .filter((agent) => agent.id !== winner.id)
      .map((agent) =>
        eligibleIds.has(agent.id) ? rejectAgainstWinner(agent, winner) : rejectIneligible(agent),
      ),
  };
}
