import { findTicket, listUnassignedTicketIds } from '../db/queries.ts';
import { DecisionKind, RetryScope } from '../codes.ts';
import { ErrorCode, RetryOutcome, TicketStatus } from '../../../shared/codes.ts';
import type { CompanyId, TicketId } from '../../../shared/ids.ts';
import { AppError, toAppError } from '../errors.ts';
import { decideTicket, logDecision } from './assign.ts';
import type { AssignedDecision, FreshDecision, UnassignedDecision } from './assign.ts';
import type { ServiceDeps } from './deps.ts';
import { requireCompany, withCompanyLock } from './lock.ts';

export type RetryTarget =
  | { readonly kind: typeof RetryScope.One; readonly ticketId: TicketId }
  | { readonly kind: typeof RetryScope.All };

export type RetryAttempt =
  | { readonly outcome: typeof RetryOutcome.Assigned; readonly decision: AssignedDecision }
  | { readonly outcome: typeof RetryOutcome.Unassigned; readonly decision: UnassignedDecision }
  | {
      readonly outcome: typeof RetryOutcome.Skipped;
      readonly ticketId: TicketId;
      readonly status: typeof TicketStatus.Open | typeof TicketStatus.Closed;
    }
  | {
      readonly outcome: typeof RetryOutcome.Failed;
      readonly ticketId: TicketId;
      readonly error: AppError;
    };

function toAttempt(decision: FreshDecision): RetryAttempt {
  switch (decision.kind) {
    case DecisionKind.Assigned:
      return { outcome: RetryOutcome.Assigned, decision };
    case DecisionKind.Unassigned:
      return { outcome: RetryOutcome.Unassigned, decision };
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}

async function retryOne(
  deps: ServiceDeps,
  { companyId, ticketId }: { companyId: CompanyId; ticketId: TicketId },
): Promise<RetryAttempt> {
  try {
    const attempt = await withCompanyLock({ deps, companyId }, async (tx): Promise<RetryAttempt> => {
      const now = deps.clock.now();
      const ticket = await findTicket(deps.db, { companyId, ticketId, tx });
      if (ticket === null) throw new AppError({ code: ErrorCode.TicketNotFound, ticketId });
      if (ticket.status !== TicketStatus.Unassigned) {
        return { outcome: RetryOutcome.Skipped, ticketId, status: ticket.status };
      }
      return toAttempt(await decideTicket(deps, { companyId, ticketId, now, tx }));
    });
    if (attempt.outcome === RetryOutcome.Assigned || attempt.outcome === RetryOutcome.Unassigned) {
      logDecision(deps, { companyId, decision: attempt.decision });
    }
    return attempt;
  } catch (error) {
    deps.logger.warn(
      { company_id: companyId, ticket_id: ticketId, err: error },
      'assignment retry failed',
    );
    return { outcome: RetryOutcome.Failed, ticketId, error: toAppError(error) };
  }
}

/** Decides one unassigned ticket again, or all of them, each in its own transaction. */
export async function retryAssignments(
  deps: ServiceDeps,
  { companyId, target }: { companyId: CompanyId; target: RetryTarget },
): Promise<RetryAttempt[]> {
  await requireCompany(deps.db, { companyId, tx: null });
  const ticketIds = await snapshotTicketIds(deps, { companyId, target });
  const attempts: RetryAttempt[] = [];
  for (const ticketId of ticketIds) {
    attempts.push(await retryOne(deps, { companyId, ticketId }));
  }
  return attempts;
}

async function snapshotTicketIds(
  deps: ServiceDeps,
  { companyId, target }: { companyId: CompanyId; target: RetryTarget },
): Promise<TicketId[]> {
  switch (target.kind) {
    case RetryScope.All:
      return listUnassignedTicketIds(deps.db, { companyId });
    case RetryScope.One:
      // An unknown ticket is found under the lock and reported as FAILED, like any other failure.
      return [target.ticketId];
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}
