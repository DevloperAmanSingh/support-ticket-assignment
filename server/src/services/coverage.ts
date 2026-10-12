import { listCoverageHours, loadAgentsWithShifts } from '../db/queries.ts';
import type { CompanyRecord } from '../db/queries.ts';
import { computeCoverage, weekBounds } from '../domain/coverage.ts';
import type { CoverageReport } from '../domain/coverage.ts';
import type { CompanyId } from '../../../shared/ids.ts';
import type { WeeklyWindow } from '../domain/time.ts';
import type { ServiceDeps } from './deps.ts';
import { requireCompany } from './lock.ts';

export type CoverageView = {
  readonly company: CompanyRecord;
  readonly hours: readonly WeeklyWindow[];
  readonly report: CoverageReport;
};

export async function getCoverage(
  deps: ServiceDeps,
  { companyId, week }: { companyId: CompanyId; week: string },
): Promise<CoverageView> {
  const company = await requireCompany(deps.db, { companyId, tx: null });
  const hours = await listCoverageHours(deps.db, { companyId, tx: null });
  const agents = await loadAgentsWithShifts(deps.db, { companyId, tx: null });
  const { start, end } = weekBounds({ week, timezone: company.timezone });
  const report = computeCoverage({
    weekStart: start,
    weekEnd: end,
    timezone: company.timezone,
    hours,
    agents,
  });
  return { company, hours, report };
}
