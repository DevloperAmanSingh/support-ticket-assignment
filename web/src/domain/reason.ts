// Decision rules, rejection codes, and statuses as sentences for the UI.
import type {
  AssignedReason,
  RejectedAgent,
  UnassignedReason,
} from '@shared/api-types.ts';
import { RejectionCode, Rule, TicketStatus } from '@shared/codes.ts';
import type { AgentId } from '@shared/ids.ts';

import { toLocalTime } from './time.ts';

export type AgentNames = ReadonlyMap<AgentId, string>;

export type TicketReason = AssignedReason | UnassignedReason;

/** An agent that is not in the list shows as its id. */
export function agentName({ names, agentId }: { names: AgentNames; agentId: AgentId }): string {
  return names.get(agentId) ?? agentId;
}

export function statusLabel(status: TicketStatus): string {
  switch (status) {
    case TicketStatus.Open:
      return 'Open';
    case TicketStatus.Unassigned:
      return 'Unassigned';
    case TicketStatus.Closed:
      return 'Closed';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function ruleSentence(rule: Rule): string {
  switch (rule) {
    case Rule.FewestOpen:
      return 'The agent on shift with the fewest open tickets gets the ticket.';
    case Rule.NoAgentOnShift:
      return 'No agent is on shift.';
    case Rule.AllAtLimit:
      return 'Every agent on shift is at the ticket limit.';
    case Rule.TicketClosed:
      return 'The ticket is closed.';
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/** The short cause of a rejection, for a list in brackets: "not on shift". */
export function rejectionPhrase(code: RejectionCode): string {
  switch (code) {
    case RejectionCode.NotOnShift:
      return 'not on shift';
    case RejectionCode.AtLimit:
      return 'at the ticket limit';
    case RejectionCode.MoreOpen:
      return 'more open tickets';
    case RejectionCode.AssignedMoreRecently:
      return 'assigned a ticket more recently';
    case RejectionCode.HigherId:
      return 'same count and time, higher agent id';
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

export function rejectionSentence({
  rejected,
  timezone,
}: {
  rejected: RejectedAgent;
  timezone: string;
}): string {
  switch (rejected.code) {
    case RejectionCode.NotOnShift:
      return 'Not on shift.';
    case RejectionCode.AtLimit:
      return `At the ticket limit with ${rejected.open} open.`;
    case RejectionCode.MoreOpen:
      return `Has more open tickets (${rejected.open}).`;
    case RejectionCode.AssignedMoreRecently: {
      const { label } = toLocalTime({ instant: rejected.last_assigned_at, timezone });
      return `Same open count, but got a ticket more recently (${label}).`;
    }
    case RejectionCode.HigherId:
      return 'Same open count and last assignment. The lower agent id wins.';
    default: {
      const _exhaustive: never = rejected;
      return _exhaustive;
    }
  }
}

/** The reason in one sentence: "Priya is on shift and has the fewest open tickets (2, with a limit of 5)." */
export function shortReason({
  reason,
  names,
}: {
  reason: TicketReason;
  names: AgentNames;
}): string {
  switch (reason.rule) {
    case Rule.FewestOpen: {
      const { agent_id: agentId, open, limit } = reason.selected;
      const name = agentName({ names, agentId });
      return `${name} is on shift and has the fewest open tickets (${open}, with a limit of ${limit}).`;
    }
    case Rule.NoAgentOnShift:
    case Rule.AllAtLimit:
      return ruleSentence(reason.rule);
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** The rejected agents in one line: "Sam (not on shift), Lee (at the ticket limit)." Null when there are none. */
export function rejectedSummary({
  rejected,
  names,
}: {
  rejected: readonly RejectedAgent[];
  names: AgentNames;
}): string | null {
  if (rejected.length === 0) return null;
  const items = rejected.map(
    ({ agent_id: agentId, code }) => `${agentName({ names, agentId })} (${rejectionPhrase(code)})`,
  );
  return `${items.join(', ')}.`;
}
