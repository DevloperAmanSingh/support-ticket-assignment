import { listTickets } from '../db/queries.ts';
import type { StoredTicket } from '../db/queries.ts';
import type { TicketOrder, TicketStatus } from '../../../shared/codes.ts';
import type { CompanyId } from '../../../shared/ids.ts';
import type { ServiceDeps } from './deps.ts';
import { requireCompany } from './lock.ts';

export async function getTickets(
  deps: ServiceDeps,
  input: { companyId: CompanyId; status: TicketStatus | null; order: TicketOrder },
): Promise<StoredTicket[]> {
  await requireCompany(deps.db, { companyId: input.companyId, tx: null });
  return listTickets(deps.db, input);
}
