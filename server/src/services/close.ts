import type { DateTime } from 'luxon';

import type { AgentRef } from '../../../shared/api-types.ts';
import { findTicket, markTicketClosed } from '../db/queries.ts';
import { ErrorCode, TicketStatus } from '../../../shared/codes.ts';
import type { CompanyId, TicketId } from '../../../shared/ids.ts';
import { AppError } from '../errors.ts';
import type { ServiceDeps } from './deps.ts';
import { withCompanyLock } from './lock.ts';

export type ClosedTicket = {
  readonly ticketId: TicketId;
  readonly agent: AgentRef | null;
  readonly closedAt: DateTime;
};

export async function closeTicket(
  deps: ServiceDeps,
  { companyId, ticketId }: { companyId: CompanyId; ticketId: TicketId },
): Promise<ClosedTicket> {
  const closed = await withCompanyLock({ deps, companyId }, async (tx) => {
    const now = deps.clock.now();
    const ticket = await findTicket(deps.db, { companyId, ticketId, tx });
    if (ticket === null) throw new AppError({ code: ErrorCode.TicketNotFound, ticketId });
    if (ticket.status === TicketStatus.Closed) {
      return { ticketId, agent: ticket.agent, closedAt: ticket.closedAt };
    }
    await markTicketClosed(deps.db, { companyId, ticketId, now, tx });
    return { ticketId, agent: ticket.agent, closedAt: now };
  });
  deps.logger.info({ company_id: companyId, ticket_id: ticketId }, 'ticket closed');
  return closed;
}
