import {
  AgentIdSchema,
  CompanyIdSchema,
  TicketIdSchema,
} from '../../../shared/ids.ts';
import type { AgentId, CompanyId, TicketId } from '../../../shared/ids.ts';

/** Brands a test agent id. */
export function agentId(text: string): AgentId {
  return AgentIdSchema.parse(text);
}

/** Brands a test company id. */
export function companyId(text: string): CompanyId {
  return CompanyIdSchema.parse(text);
}

/** Brands a test ticket id. */
export function ticketId(text: string): TicketId {
  return TicketIdSchema.parse(text);
}
