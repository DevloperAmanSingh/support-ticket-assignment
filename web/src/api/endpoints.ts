// One function per server route. No other file knows a URL.
import {
  AgentsResponseSchema,
  AssignResponseSchema,
  CloseResponseSchema,
  CompaniesResponseSchema,
  CoverageHoursResponseSchema,
  CoverageResponseSchema,
  RetryResponseSchema,
  TicketsResponseSchema,
  UpdateAgentResponseSchema,
} from '@shared/api-types.ts';
import type {
  AgentsResponse,
  AssignRequest,
  AssignResponse,
  CloseResponse,
  CompaniesResponse,
  CoverageHoursResponse,
  CoverageResponse,
  RetryRequest,
  RetryResponse,
  TicketsResponse,
  UpdateAgentBody,
  UpdateAgentResponse,
  UpdateCoverageHoursBody,
} from '@shared/api-types.ts';
import type { TicketOrder, TicketStatus } from '@shared/codes.ts';
import type { AgentId, CompanyId, TicketId } from '@shared/ids.ts';

import type { WeekStart } from '@/domain/week.ts';

import { getJson, postJson, putJson } from './client.ts';

const COMPANIES_PATH = '/api/companies';

function companyPath(companyId: CompanyId): string {
  return `${COMPANIES_PATH}/${encodeURIComponent(companyId)}`;
}

export function assignTicket({
  companyId,
  body,
}: {
  companyId: CompanyId;
  body: AssignRequest;
}): Promise<AssignResponse> {
  return postJson({
    path: `${companyPath(companyId)}/assignments`,
    body,
    schema: AssignResponseSchema,
  });
}

export function closeTicket({
  companyId,
  ticketId,
}: {
  companyId: CompanyId;
  ticketId: TicketId;
}): Promise<CloseResponse> {
  return postJson({
    path: `${companyPath(companyId)}/tickets/${encodeURIComponent(ticketId)}/close`,
    body: null,
    schema: CloseResponseSchema,
  });
}

export function retryAssignments({
  companyId,
  body,
}: {
  companyId: CompanyId;
  body: RetryRequest;
}): Promise<RetryResponse> {
  return postJson({
    path: `${companyPath(companyId)}/assignments/retry`,
    body,
    schema: RetryResponseSchema,
  });
}

export function listCompanies(): Promise<CompaniesResponse> {
  return getJson({ path: COMPANIES_PATH, schema: CompaniesResponseSchema });
}

export function listAgents({ companyId }: { companyId: CompanyId }): Promise<AgentsResponse> {
  return getJson({ path: `${companyPath(companyId)}/agents`, schema: AgentsResponseSchema });
}

export function updateAgent({
  companyId,
  agentId,
  body,
}: {
  companyId: CompanyId;
  agentId: AgentId;
  body: UpdateAgentBody;
}): Promise<UpdateAgentResponse> {
  return putJson({
    path: `${companyPath(companyId)}/agents/${encodeURIComponent(agentId)}`,
    body,
    schema: UpdateAgentResponseSchema,
  });
}

export function getCoverage({
  companyId,
  week,
}: {
  companyId: CompanyId;
  week: WeekStart;
}): Promise<CoverageResponse> {
  const query = new URLSearchParams({ week });
  return getJson({
    path: `${companyPath(companyId)}/coverage?${query.toString()}`,
    schema: CoverageResponseSchema,
  });
}

export function updateCoverageHours({
  companyId,
  body,
}: {
  companyId: CompanyId;
  body: UpdateCoverageHoursBody;
}): Promise<CoverageHoursResponse> {
  return putJson({
    path: `${companyPath(companyId)}/coverage-hours`,
    body,
    schema: CoverageHoursResponseSchema,
  });
}

export function listTickets({
  companyId,
  status,
  order,
}: {
  companyId: CompanyId;
  status: TicketStatus | null;
  order: TicketOrder;
}): Promise<TicketsResponse> {
  const query = new URLSearchParams({ order });
  if (status !== null) query.set('status', status);
  return getJson({
    path: `${companyPath(companyId)}/tickets?${query.toString()}`,
    schema: TicketsResponseSchema,
  });
}
