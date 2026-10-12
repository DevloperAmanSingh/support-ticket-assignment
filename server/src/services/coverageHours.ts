import { listCoverageHours, replaceCoverageHours } from '../db/queries.ts';
import { ErrorCode } from '../../../shared/codes.ts';
import type { CompanyId } from '../../../shared/ids.ts';
import { hasOverlap } from '../domain/time.ts';
import type { WeeklyWindow } from '../domain/time.ts';
import { AppError } from '../errors.ts';
import type { ServiceDeps } from './deps.ts';
import { withCompanyLock } from './lock.ts';

/** An empty list means every hour. */
export async function updateCoverageHours(
  deps: ServiceDeps,
  { companyId, hours }: { companyId: CompanyId; hours: readonly WeeklyWindow[] },
): Promise<WeeklyWindow[]> {
  if (hasOverlap(hours)) {
    throw new AppError({
      code: ErrorCode.ValidationError,
      message: 'hours: the coverage ranges of one weekday must not overlap',
    });
  }
  const saved = await withCompanyLock({ deps, companyId }, async (tx) => {
    await replaceCoverageHours(deps.db, { companyId, hours, tx });
    return listCoverageHours(deps.db, { companyId, tx });
  });
  deps.logger.info({ company_id: companyId }, 'coverage hours updated');
  return saved;
}
