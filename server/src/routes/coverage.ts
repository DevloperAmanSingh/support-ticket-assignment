import { Router } from 'express';

import {
  CoverageQuerySchema,
  UpdateCoverageHoursRequestSchema,
} from '../../../shared/api-types.ts';
import type { CoverageHoursResponse, CoverageResponse } from '../../../shared/api-types.ts';
import { formatInstant } from '../domain/time.ts';
import { getCoverage } from '../services/coverage.ts';
import type { CoverageView } from '../services/coverage.ts';
import { updateCoverageHours } from '../services/coverageHours.ts';
import type { ServiceDeps } from '../services/deps.ts';
import { CompanyParamsSchema, parseRequest } from './parse.ts';
import { toIntervalView, toWindowView } from './views.ts';

function toCoverageResponse({ company, hours, report }: CoverageView): CoverageResponse {
  return {
    timezone: company.timezone,
    week_start: formatInstant(report.weekStart),
    week_end: formatInstant(report.weekEnd),
    // No call reads the coverage hours alone, so the coverage view carries them for the UI.
    hours: hours.map(toWindowView),
    gaps: report.gaps.map(toIntervalView),
    agents: report.agents.map(({ agent, intervals }) => ({
      agent_id: agent.id,
      name: agent.name,
      timezone: agent.timezone,
      intervals: intervals.map(toIntervalView),
    })),
  };
}

export function coverageRouter(deps: ServiceDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/coverage', async (req, res) => {
    const { companyId } = parseRequest(CompanyParamsSchema, req.params);
    const { week } = parseRequest(CoverageQuerySchema, req.query);
    res.json(toCoverageResponse(await getCoverage(deps, { companyId, week })));
  });

  router.put('/coverage-hours', async (req, res) => {
    const { companyId } = parseRequest(CompanyParamsSchema, req.params);
    const body = parseRequest(UpdateCoverageHoursRequestSchema, req.body);
    const hours = await updateCoverageHours(deps, {
      companyId,
      hours: body.hours.map((range) => ({
        weekday: range.weekday,
        startMinute: range.start,
        endMinute: range.end,
      })),
    });
    const response: CoverageHoursResponse = { hours: hours.map(toWindowView) };
    res.json(response);
  });

  return router;
}
