import { Router } from 'express';

import { TicketsQuerySchema } from '../../../shared/api-types.ts';
import type {
  CloseResponse,
  TicketsResponse,
  TicketView,
} from '../../../shared/api-types.ts';
import type { StoredTicket } from '../db/queries.ts';
import { TicketStatus } from '../../../shared/codes.ts';
import { formatInstant } from '../domain/time.ts';
import { closeTicket } from '../services/close.ts';
import type { ServiceDeps } from '../services/deps.ts';
import { getTickets } from '../services/tickets.ts';
import { CompanyParamsSchema, parseRequest, TicketParamsSchema } from './parse.ts';

function toTicketView(ticket: StoredTicket): TicketView {
  const base = {
    ticket_id: ticket.ticketId,
    created_at: formatInstant(ticket.createdAt),
    decision_id: ticket.decisionId,
  };
  switch (ticket.status) {
    case TicketStatus.Open:
      return {
        ...base,
        status: ticket.status,
        agent: ticket.agent,
        assigned_at: formatInstant(ticket.assignedAt),
        closed_at: null,
        reason: ticket.decision.reason,
      };
    case TicketStatus.Unassigned:
      return {
        ...base,
        status: ticket.status,
        agent: null,
        assigned_at: null,
        closed_at: null,
        reason: ticket.decision.reason,
      };
    case TicketStatus.Closed:
      return {
        ...base,
        status: ticket.status,
        agent: ticket.agent,
        assigned_at: ticket.assignedAt === null ? null : formatInstant(ticket.assignedAt),
        closed_at: formatInstant(ticket.closedAt),
        reason: ticket.decision.reason,
      };
    default: {
      const _exhaustive: never = ticket;
      return _exhaustive;
    }
  }
}

export function ticketsRouter(deps: ServiceDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/tickets', async (req, res) => {
    const { companyId } = parseRequest(CompanyParamsSchema, req.params);
    const { status, order } = parseRequest(TicketsQuerySchema, req.query);
    const tickets = await getTickets(deps, { companyId, status: status ?? null, order });
    const response: TicketsResponse = { tickets: tickets.map(toTicketView) };
    res.json(response);
  });

  router.post('/tickets/:ticketId/close', async (req, res) => {
    const { companyId, ticketId } = parseRequest(TicketParamsSchema, req.params);
    const closed = await closeTicket(deps, { companyId, ticketId });
    const response: CloseResponse = {
      ticket_id: closed.ticketId,
      status: TicketStatus.Closed,
      agent: closed.agent,
      closed_at: formatInstant(closed.closedAt),
    };
    res.json(response);
  });

  return router;
}
