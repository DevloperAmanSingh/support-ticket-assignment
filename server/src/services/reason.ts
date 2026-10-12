import type {
  AssignedReason,
  RejectedAgent,
  UnassignedReason,
} from '../../../shared/api-types.ts';
import { RejectionCode } from '../../../shared/codes.ts';
import type { AssignedSelection, Rejection, UnassignedSelection } from '../domain/select.ts';
import { formatInstant } from '../domain/time.ts';

function toRejectedAgent(rejection: Rejection): RejectedAgent {
  switch (rejection.code) {
    case RejectionCode.NotOnShift:
    case RejectionCode.HigherId:
      return { agent_id: rejection.agentId, code: rejection.code };
    case RejectionCode.AtLimit:
    case RejectionCode.MoreOpen:
      return { agent_id: rejection.agentId, code: rejection.code, open: rejection.open };
    case RejectionCode.AssignedMoreRecently:
      return {
        agent_id: rejection.agentId,
        code: rejection.code,
        last_assigned_at: formatInstant(rejection.lastAssignedAt.toUTC()),
      };
    default: {
      const _exhaustive: never = rejection;
      return _exhaustive;
    }
  }
}

export function toAssignedReason(selection: AssignedSelection): AssignedReason {
  const { selected } = selection;
  return {
    rule: selection.rule,
    selected: {
      agent_id: selected.agentId,
      open: selected.open,
      limit: selected.limit,
      last_assigned_at:
        selected.lastAssignedAt === null ? null : formatInstant(selected.lastAssignedAt.toUTC()),
    },
    rejected: selection.rejected.map(toRejectedAgent),
  };
}

export function toUnassignedReason(selection: UnassignedSelection): UnassignedReason {
  return {
    rule: selection.rule,
    selected: null,
    rejected: selection.rejected.map(toRejectedAgent),
  };
}
