// A stand-in for the service: MSW handlers over an in-memory copy of the fixtures.
// It keeps every request it gets, so a test can assert the body the UI sent.
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import {
  AssignRequestSchema,
  RetryRequestSchema,
  TicketsQuerySchema,
  UpdateAgentRequestSchema,
  UpdateCoverageHoursRequestSchema,
} from '@shared/api-types.ts';
import type {
  AgentsResponse,
  AgentView,
  AssignedReason,
  AssignResponse,
  CloseResponse,
  CompaniesResponse,
  CoverageHoursResponse,
  ErrorResponse,
  RetryResponse,
  RetryResult,
  TicketsResponse,
  TicketView,
  WindowView,
} from '@shared/api-types.ts';
import {
  ErrorCode,
  RejectionCode,
  RetryOutcome,
  Rule,
  TicketOrder,
  TicketStatus,
} from '@shared/codes.ts';
import type { TicketId } from '@shared/ids.ts';
import { minuteToClockText } from '@shared/time.ts';

import {
  ACME,
  acmeAgents,
  acmeCoverage,
  acmeHours,
  acmeTickets,
  AgentIds,
  decisionId,
  GLOBEX,
} from './fixtures.ts';

/** The instant every handler uses as "now": Wednesday 14 October 2026, 11:00 in New York. */
export const NOW = '2026-10-14T15:00:00Z';

const ACME_PATH = `/api/companies/${ACME.id}`;
const FIRST_NEW_DECISION = 100;

export type RecordedRequest = {
  readonly method: string;
  /** The path with the query string. */
  readonly path: string;
  /** The parsed JSON body, or null for a request without one. */
  readonly body: unknown;
};

type Backend = {
  agents: AgentView[];
  tickets: TicketView[];
  hours: WindowView[];
  nextDecision: number;
  requests: RecordedRequest[];
};

function freshBackend(): Backend {
  return {
    agents: acmeAgents(),
    tickets: acmeTickets(),
    hours: acmeHours(),
    nextDecision: FIRST_NEW_DECISION,
    requests: [],
  };
}

export const backend: Backend = freshBackend();

export function resetBackend(): void {
  Object.assign(backend, freshBackend());
}

/** The requests the UI sent with one method to one path. */
export function requestsTo({ method, path }: { method: string; path: string }): RecordedRequest[] {
  return backend.requests.filter(
    (request) => request.method === method && request.path === path,
  );
}

async function record(request: Request): Promise<unknown> {
  const url = new URL(request.url);
  const text = await request.text();
  const body: unknown = text === '' ? null : JSON.parse(text);
  backend.requests.push({ method: request.method, path: `${url.pathname}${url.search}`, body });
  return body;
}

export function errorResponse({
  status,
  code,
  message,
}: {
  status: number;
  code: ErrorCode;
  message: string;
}) {
  const body: ErrorResponse = { error: { code, message } };
  return HttpResponse.json(body, { status });
}

function validationError(message: string) {
  return errorResponse({ status: 400, code: ErrorCode.ValidationError, message });
}

function ticketNotFound() {
  return errorResponse({
    status: 404,
    code: ErrorCode.TicketNotFound,
    message: 'Ticket not found',
  });
}

function changeOpenCount({ agentId, by }: { agentId: string; by: number }): void {
  backend.agents = backend.agents.map((agent) =>
    agent.id === agentId ? { ...agent, open_count: agent.open_count + by } : agent,
  );
}

type OpenTicket = Extract<TicketView, { status: typeof TicketStatus.Open }>;

/** Gives a ticket to Sam, as the service does when Sam is the pick, and returns the saved row. */
function assignToSam(ticketId: TicketId): OpenTicket {
  const sam = backend.agents.find((agent) => agent.id === AgentIds.Sam);
  if (sam === undefined) throw new Error('The fixtures have no agent Sam');
  const reason: AssignedReason = {
    rule: Rule.FewestOpen,
    selected: {
      agent_id: sam.id,
      open: sam.open_count,
      limit: sam.ticket_limit,
      last_assigned_at: '2026-10-14T14:00:00Z',
    },
    rejected: [
      { agent_id: AgentIds.Rahul, code: RejectionCode.NotOnShift },
      { agent_id: AgentIds.Lee, code: RejectionCode.AtLimit, open: 3 },
    ],
  };
  const existing = backend.tickets.find((ticket) => ticket.ticket_id === ticketId);
  const assigned: OpenTicket = {
    ticket_id: ticketId,
    created_at: existing?.created_at ?? NOW,
    decision_id: decisionId(backend.nextDecision),
    status: TicketStatus.Open,
    agent: { id: sam.id, name: sam.name },
    assigned_at: NOW,
    closed_at: null,
    reason,
  };
  backend.nextDecision += 1;
  backend.tickets =
    existing === undefined
      ? [...backend.tickets, assigned]
      : backend.tickets.map((ticket) => (ticket.ticket_id === ticketId ? assigned : ticket));
  changeOpenCount({ agentId: sam.id, by: 1 });
  return assigned;
}

function retryOne(ticketId: TicketId): RetryResult {
  const ticket = backend.tickets.find((candidate) => candidate.ticket_id === ticketId);
  if (ticket === undefined) {
    return {
      outcome: RetryOutcome.Failed,
      ticket_id: ticketId,
      error: { code: ErrorCode.TicketNotFound, message: 'Ticket not found' },
    };
  }
  if (ticket.status !== TicketStatus.Unassigned) {
    return { outcome: RetryOutcome.Skipped, ticket_id: ticketId, status: ticket.status };
  }
  const assigned = assignToSam(ticketId);
  return {
    outcome: RetryOutcome.Assigned,
    ticket_id: ticketId,
    agent: assigned.agent,
    decision_id: assigned.decision_id,
    reason: assigned.reason,
  };
}

const handlers = [
  http.get('/api/companies', async ({ request }) => {
    await record(request);
    const body: CompaniesResponse = { companies: [ACME, GLOBEX] };
    return HttpResponse.json(body);
  }),

  http.get(`${ACME_PATH}/agents`, async ({ request }) => {
    await record(request);
    const body: AgentsResponse = { agents: backend.agents };
    return HttpResponse.json(body);
  }),

  http.put(`${ACME_PATH}/agents/:agentId`, async ({ request, params }) => {
    const parsed = UpdateAgentRequestSchema.safeParse(await record(request));
    if (!parsed.success) return validationError(parsed.error.message);
    const agent = backend.agents.find((candidate) => candidate.id === params.agentId);
    if (agent === undefined) {
      return errorResponse({
        status: 404,
        code: ErrorCode.AgentNotFound,
        message: 'Agent not found',
      });
    }
    const updated: AgentView = {
      ...agent,
      timezone: parsed.data.timezone,
      ticket_limit: parsed.data.ticket_limit,
      shifts: parsed.data.shifts.map((shift) => ({
        weekday: shift.weekday,
        start: minuteToClockText(shift.start),
        end: minuteToClockText(shift.end),
      })),
    };
    backend.agents = backend.agents.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    );
    return HttpResponse.json(updated);
  }),

  http.get(`${ACME_PATH}/coverage`, async ({ request }) => {
    await record(request);
    const monday = new URL(request.url).searchParams.get('week');
    if (monday === null) return validationError('week: week must be "YYYY-MM-DD"');
    return HttpResponse.json(acmeCoverage({ monday, hours: backend.hours }));
  }),

  http.put(`${ACME_PATH}/coverage-hours`, async ({ request }) => {
    const parsed = UpdateCoverageHoursRequestSchema.safeParse(await record(request));
    if (!parsed.success) return validationError(parsed.error.message);
    backend.hours = parsed.data.hours.map((range) => ({
      weekday: range.weekday,
      start: minuteToClockText(range.start),
      end: minuteToClockText(range.end),
    }));
    const body: CoverageHoursResponse = { hours: backend.hours };
    return HttpResponse.json(body);
  }),

  http.get(`${ACME_PATH}/tickets`, async ({ request }) => {
    await record(request);
    const query = TicketsQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) return validationError(query.error.message);
    const { status, order } = query.data;
    const oldestFirst = backend.tickets
      .filter((ticket) => status === undefined || ticket.status === status)
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at));
    const body: TicketsResponse = {
      tickets: order === TicketOrder.Oldest ? oldestFirst : oldestFirst.toReversed(),
    };
    return HttpResponse.json(body);
  }),

  http.post(`${ACME_PATH}/assignments`, async ({ request }) => {
    const parsed = AssignRequestSchema.safeParse(await record(request));
    if (!parsed.success) return validationError(parsed.error.message);
    const assigned = assignToSam(parsed.data.ticket_id);
    const body: AssignResponse = {
      ticket_id: assigned.ticket_id,
      assigned: true,
      agent: assigned.agent,
      decision_id: assigned.decision_id,
      reason: assigned.reason,
    };
    return HttpResponse.json(body);
  }),

  http.post(`${ACME_PATH}/assignments/retry`, async ({ request }) => {
    const parsed = RetryRequestSchema.safeParse(await record(request));
    if (!parsed.success) return validationError(parsed.error.message);
    const targets =
      'ticket_id' in parsed.data
        ? [parsed.data.ticket_id]
        : backend.tickets
            .filter((ticket) => ticket.status === TicketStatus.Unassigned)
            .map((ticket) => ticket.ticket_id);
    const body: RetryResponse = { results: targets.map(retryOne) };
    return HttpResponse.json(body);
  }),

  http.post(`${ACME_PATH}/tickets/:ticketId/close`, async ({ request, params }) => {
    await record(request);
    const ticket = backend.tickets.find((candidate) => candidate.ticket_id === params.ticketId);
    if (ticket === undefined) return ticketNotFound();
    const closed: TicketView = {
      ticket_id: ticket.ticket_id,
      created_at: ticket.created_at,
      decision_id: ticket.decision_id,
      status: TicketStatus.Closed,
      agent: ticket.agent,
      assigned_at: ticket.assigned_at,
      closed_at: ticket.closed_at ?? NOW,
      reason: ticket.reason,
    };
    backend.tickets = backend.tickets.map((candidate) =>
      candidate.ticket_id === closed.ticket_id ? closed : candidate,
    );
    if (ticket.status === TicketStatus.Open) changeOpenCount({ agentId: ticket.agent.id, by: -1 });
    const body: CloseResponse = {
      ticket_id: closed.ticket_id,
      status: TicketStatus.Closed,
      agent: closed.agent,
      closed_at: closed.closed_at,
    };
    return HttpResponse.json(body);
  }),
];

export const server = setupServer(...handlers);
