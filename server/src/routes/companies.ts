import { Router } from 'express';

import type { CompaniesResponse } from '../../../shared/api-types.ts';
import { listCompanies } from '../db/queries.ts';
import type { ServiceDeps } from '../services/deps.ts';

export function companiesRouter(deps: ServiceDeps): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const response: CompaniesResponse = { companies: await listCompanies(deps.db) };
    res.json(response);
  });

  return router;
}
