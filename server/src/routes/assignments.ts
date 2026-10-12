import { Router } from 'express';

import { AssignRequestSchema, RetryRequestSchema } from '../../../shared/api-types.ts';
import type {
  AssignResponse,
  RetryResponse,
  RetryResult,
} from '../../../shared/api-types.ts';
import { DecisionKind, RetryScope } from '../codes.ts';
import { RetryOutcome, Rule } from '../../../shared/codes.ts';
import { assignTicket } from '../services/assign.ts';
import type { Decision } from '../services/assign.ts';
import type { ServiceDeps } from '../services/deps.ts';
import { retryAssignments } from '../services/retry.ts';
import type { RetryAttempt } from '../services/retry.ts';
import { CompanyParamsSchema, parseRequest } from './parse.ts';

function toAssignResponse(decision: Decision): AssignResponse {
  const { ticketId: ticket_id, decisionId: decision_id } = decision;
  switch (decision.kind) {
    case DecisionKind.Assigned:
      return { ticket_id, assigned: true, agent: decision.agent, decision_id, reason: decision.reason };
    case DecisionKind.ClosedWithAgent:
      return {
        ticket_id,
        assigned: true,
        agent: decision.agent,
        decision_id,
        reason: decision.reason,
        closed: true,
      };
    case DecisionKind.Unassigned:
      return { ticket_id, assigned: false, agent: null, decision_id, reason: decision.reason };
    case DecisionKind.ClosedWithoutAgent:
      return {
        ticket_id,
        assigned: false,
        agent: null,
        decision_id,
        reason: { rule: Rule.TicketClosed, selected: null },
      };
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}

function toRetryResult(attempt: RetryAttempt): RetryResult {
  switch (attempt.outcome) {
    case RetryOutcome.Assigned:
      return {
        outcome: attempt.outcome,
        ticket_id: attempt.decision.ticketId,
        agent: attempt.decision.agent,
        decision_id: attempt.decision.decisionId,
        reason: attempt.decision.reason,
      };
    case RetryOutcome.Unassigned:
      return {
        outcome: attempt.outcome,
        ticket_id: attempt.decision.ticketId,
        decision_id: attempt.decision.decisionId,
        reason: attempt.decision.reason,
      };
    case RetryOutcome.Skipped:
      return { outcome: attempt.outcome, ticket_id: attempt.ticketId, status: attempt.status };
    case RetryOutcome.Failed:
      return {
        outcome: attempt.outcome,
        ticket_id: attempt.ticketId,
        error: { code: attempt.error.detail.code, message: attempt.error.message },
      };
    default: {
      const _exhaustive: never = attempt;
      return _exhaustive;
    }
  }
}

export function assignmentsRouter(deps: ServiceDeps): Router {
  const router = Router({ mergeParams: true });

  router.post('/assignments', async (req, res) => {
    const { companyId } = parseRequest(CompanyParamsSchema, req.params);
    const { ticket_id: ticketId } = parseRequest(AssignRequestSchema, req.body);
    const decision = await assignTicket(deps, { companyId, ticketId });
    res.json(toAssignResponse(decision));
  });

  router.post('/assignments/retry', async (req, res) => {
    const { companyId } = parseRequest(CompanyParamsSchema, req.params);
    const body = parseRequest(RetryRequestSchema, req.body);
    const target =
      'ticket_id' in body
        ? { kind: RetryScope.One, ticketId: body.ticket_id }
        : { kind: RetryScope.All };
    const attempts = await retryAssignments(deps, { companyId, target });
    const response: RetryResponse = { results: attempts.map(toRetryResult) };
    res.json(response);
  });

  return router;
}
