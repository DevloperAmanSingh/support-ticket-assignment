import { Router } from 'express';

import { UpdateAgentRequestSchema } from '../../../shared/api-types.ts';
import type { AgentsResponse, UpdateAgentResponse } from '../../../shared/api-types.ts';
import { listAgents, updateAgent } from '../services/agents.ts';
import type { ServiceDeps } from '../services/deps.ts';
import { AgentParamsSchema, CompanyParamsSchema, parseRequest } from './parse.ts';
import { toAgentView } from './views.ts';

export function agentsRouter(deps: ServiceDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/agents', async (req, res) => {
    const { companyId } = parseRequest(CompanyParamsSchema, req.params);
    const agents = await listAgents(deps, { companyId });
    const response: AgentsResponse = { agents: agents.map(toAgentView) };
    res.json(response);
  });

  router.put('/agents/:agentId', async (req, res) => {
    const { companyId, agentId } = parseRequest(AgentParamsSchema, req.params);
    const body = parseRequest(UpdateAgentRequestSchema, req.body);
    const status = await updateAgent(deps, {
      companyId,
      agentId,
      config: {
        timezone: body.timezone,
        ticketLimit: body.ticket_limit,
        shifts: body.shifts.map((shift) => ({
          weekday: shift.weekday,
          startMinute: shift.start,
          endMinute: shift.end,
        })),
      },
    });
    const response: UpdateAgentResponse = toAgentView(status);
    res.json(response);
  });

  return router;
}
