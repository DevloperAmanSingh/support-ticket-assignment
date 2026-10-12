import express, { Router } from 'express';
import type { Express } from 'express';

import { agentsRouter } from './routes/agents.ts';
import { assignmentsRouter } from './routes/assignments.ts';
import { companiesRouter } from './routes/companies.ts';
import { coverageRouter } from './routes/coverage.ts';
import { errorHandler, routeNotFound } from './routes/errors.ts';
import { ticketsRouter } from './routes/tickets.ts';
import type { ServiceDeps } from './services/deps.ts';

const COMPANIES_PATH = '/api/companies';
const COMPANY_PATH = `${COMPANIES_PATH}/:companyId`;

/** Groups the routes that act on one company, so the path prefix is written one time. */
function companyRouter(deps: ServiceDeps): Router {
  const router = Router({ mergeParams: true });
  router.use(assignmentsRouter(deps));
  router.use(ticketsRouter(deps));
  router.use(agentsRouter(deps));
  router.use(coverageRouter(deps));
  return router;
}

export function createApp(deps: ServiceDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(COMPANIES_PATH, companiesRouter(deps));
  app.use(COMPANY_PATH, companyRouter(deps));
  app.use(routeNotFound);
  app.use(errorHandler(deps.logger));
  return app;
}
