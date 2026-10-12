import type { Express } from 'express';
import request from 'supertest';

import {
  AgentsResponseSchema,
  AgentViewSchema,
  AssignResponseSchema,
  CloseResponseSchema,
  CompaniesResponseSchema,
  CoverageHoursResponseSchema,
  CoverageResponseSchema,
  ErrorResponseSchema,
  RetryResponseSchema,
  TicketsResponseSchema,
} from '../../../shared/api-types.ts';
import type {
  AssignResponse,
  ErrorResponse,
  RetryRequest,
  UpdateAgentBody,
  UpdateCoverageHoursBody,
} from '../../../shared/api-types.ts';
import type { z } from '../../../shared/zod.ts';

/** The status, headers, and unparsed body of one response. */
export type Reply = { status: number; body: unknown; headers: Record<string, string> };

type Method = 'get' | 'post' | 'put';

/** A typed client for the nine calls, on top of supertest. */
export function client(app: Express) {
  const send = async (method: Method, path: string, body?: object | string): Promise<Reply> => {
    const pending = request(app)[method](path).set('Content-Type', 'application/json');
    const response = await (body === undefined ? pending : pending.send(body));
    const payload: unknown = response.body;
    return { status: response.status, body: payload, headers: response.headers };
  };

  const ok = async <Schema extends z.ZodType>(
    schema: Schema,
    reply: Promise<Reply>,
  ): Promise<z.infer<Schema>> => {
    const { status, body } = await reply;
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return schema.parse(body);
  };

  const base = (company: string): string => `/api/companies/${company}`;

  return {
    send,
    assign: (ticket: string, company = 'c1') =>
      ok(AssignResponseSchema, send('post', `${base(company)}/assignments`, { ticket_id: ticket })),
    close: (ticket: string, company = 'c1') =>
      ok(CloseResponseSchema, send('post', `${base(company)}/tickets/${ticket}/close`)),
    retry: (body: { ticket_id: string } | Extract<RetryRequest, { all: true }>, company = 'c1') =>
      ok(RetryResponseSchema, send('post', `${base(company)}/assignments/retry`, body)),
    companies: () => ok(CompaniesResponseSchema, send('get', '/api/companies')),
    agents: (company = 'c1') => ok(AgentsResponseSchema, send('get', `${base(company)}/agents`)),
    updateAgent: (agent: string, body: UpdateAgentBody, company = 'c1') =>
      ok(AgentViewSchema, send('put', `${base(company)}/agents/${agent}`, body)),
    coverage: (week: string, company = 'c1') =>
      ok(CoverageResponseSchema, send('get', `${base(company)}/coverage?week=${week}`)),
    updateCoverageHours: (hours: UpdateCoverageHoursBody['hours'], company = 'c1') =>
      ok(CoverageHoursResponseSchema, send('put', `${base(company)}/coverage-hours`, { hours })),
    tickets: (query = '', company = 'c1') =>
      ok(TicketsResponseSchema, send('get', `${base(company)}/tickets${query}`)),
  };
}

export type Client = ReturnType<typeof client>;

/** Checks the status of an error reply and returns its parsed error. */
export function errorOf(reply: Reply, status: number): ErrorResponse['error'] {
  if (reply.status !== status) {
    throw new Error(`Expected ${status}, got ${reply.status}: ${JSON.stringify(reply.body)}`);
  }
  return ErrorResponseSchema.parse(reply.body).error;
}

/** Narrows an assign response to the one of an open ticket with an agent. */
export function assigned(response: AssignResponse) {
  if (!response.assigned || 'closed' in response) {
    throw new Error(`Expected an open assignment: ${JSON.stringify(response)}`);
  }
  return response;
}

/** Narrows an assign response to the one with no eligible agent. */
export function unassigned(response: AssignResponse) {
  if (response.assigned || !('rejected' in response.reason)) {
    throw new Error(`Expected no assignment: ${JSON.stringify(response)}`);
  }
  return { ...response, reason: response.reason };
}
