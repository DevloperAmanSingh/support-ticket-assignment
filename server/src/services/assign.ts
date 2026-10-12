import type { DateTime } from 'luxon';
import type { Transaction } from 'sequelize';

import type { AgentRef, AssignedReason, UnassignedReason } from '../../../shared/api-types.ts';
import { findTicket, loadAgentSnapshots, saveDecision } from '../db/queries.ts';
import type { StoredTicket } from '../db/queries.ts';
import { DecisionKind, DecisionOutcome } from '../codes.ts';
import { TicketStatus } from '../../../shared/codes.ts';
import type { CompanyId, DecisionId, TicketId } from '../../../shared/ids.ts';
import { selectAgent } from '../domain/select.ts';
import type { ServiceDeps } from './deps.ts';
import { withCompanyLock } from './lock.ts';
import { toAssignedReason, toUnassignedReason } from './reason.ts';

export type AssignedDecision = {
  readonly kind: typeof DecisionKind.Assigned;
  readonly ticketId: TicketId;
  readonly agent: AgentRef;
  readonly decisionId: DecisionId;
  readonly reason: AssignedReason;
};

export type UnassignedDecision = {
  readonly kind: typeof DecisionKind.Unassigned;
  readonly ticketId: TicketId;
  readonly decisionId: DecisionId;
  readonly reason: UnassignedReason;
};

export type ClosedWithAgentDecision = {
  readonly kind: typeof DecisionKind.ClosedWithAgent;
  readonly ticketId: TicketId;
  readonly agent: AgentRef;
  readonly decisionId: DecisionId;
  readonly reason: AssignedReason;
};

export type ClosedWithoutAgentDecision = {
  readonly kind: typeof DecisionKind.ClosedWithoutAgent;
  readonly ticketId: TicketId;
  readonly decisionId: DecisionId;
};

export type FreshDecision = AssignedDecision | UnassignedDecision;

export type Decision = FreshDecision | ClosedWithAgentDecision | ClosedWithoutAgentDecision;

/** Gives the saved result of a ticket that needs no new decision, or null when one is needed. */
function replay(ticket: StoredTicket): Decision | null {
  const { ticketId, decisionId } = ticket;
  switch (ticket.status) {
    case TicketStatus.Open:
      return {
        kind: DecisionKind.Assigned,
        ticketId,
        agent: ticket.agent,
        decisionId,
        reason: ticket.decision.reason,
      };
    case TicketStatus.Closed:
      // TICKET_CLOSED writes no decision, so the reply carries the last saved decision id.
      return ticket.agent === null
        ? { kind: DecisionKind.ClosedWithoutAgent, ticketId, decisionId }
        : {
            kind: DecisionKind.ClosedWithAgent,
            ticketId,
            agent: ticket.agent,
            decisionId,
            reason: ticket.decision.reason,
          };
    case TicketStatus.Unassigned:
      return null;
    default: {
      const _exhaustive: never = ticket;
      return _exhaustive;
    }
  }
}

/** The caller holds the company lock. */
export async function decideTicket(
  deps: ServiceDeps,
  input: { companyId: CompanyId; ticketId: TicketId; now: DateTime; tx: Transaction },
): Promise<FreshDecision> {
  const { db } = deps;
  const { companyId, ticketId, now, tx } = input;
  const agents = await loadAgentSnapshots(db, { companyId, tx });
  const selection = selectAgent({ now, agents });

  switch (selection.kind) {
    case DecisionOutcome.Assigned: {
      const reason = toAssignedReason(selection);
      const agent = { id: selection.selected.agentId, name: selection.selected.name };
      const decisionId = await saveDecision(db, {
        companyId,
        ticketId,
        now,
        decision: { outcome: selection.kind, reason, agentId: agent.id },
        tx,
      });
      return { kind: DecisionKind.Assigned, ticketId, agent, decisionId, reason };
    }
    case DecisionOutcome.Unassigned: {
      const reason = toUnassignedReason(selection);
      const decisionId = await saveDecision(db, {
        companyId,
        ticketId,
        now,
        decision: { outcome: selection.kind, reason, agentId: null },
        tx,
      });
      return { kind: DecisionKind.Unassigned, ticketId, decisionId, reason };
    }
    default: {
      const _exhaustive: never = selection;
      return _exhaustive;
    }
  }
}

export function logDecision(
  deps: ServiceDeps,
  { companyId, decision }: { companyId: CompanyId; decision: Decision },
): void {
  deps.logger.info(
    {
      company_id: companyId,
      ticket_id: decision.ticketId,
      decision_id: decision.decisionId,
      kind: decision.kind,
    },
    'assignment decided',
  );
}

export async function assignTicket(
  deps: ServiceDeps,
  { companyId, ticketId }: { companyId: CompanyId; ticketId: TicketId },
): Promise<Decision> {
  try {
    const decision = await withCompanyLock({ deps, companyId }, async (tx) => {
      const now = deps.clock.now();
      const ticket = await findTicket(deps.db, { companyId, ticketId, tx });
      const saved = ticket === null ? null : replay(ticket);
      return saved ?? (await decideTicket(deps, { companyId, ticketId, now, tx }));
    });
    logDecision(deps, { companyId, decision });
    return decision;
  } catch (error) {
    deps.logger.warn(
      { company_id: companyId, ticket_id: ticketId, err: error },
      'assignment failed',
    );
    throw error;
  }
}
