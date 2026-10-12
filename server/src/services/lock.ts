import { Transaction } from 'sequelize';

import { findCompany } from '../db/queries.ts';
import type { CompanyRecord, Tx } from '../db/queries.ts';
import type { Db } from '../db/sequelize.ts';
import { ErrorCode } from '../../../shared/codes.ts';
import type { CompanyId } from '../../../shared/ids.ts';
import { AppError, isLockTimeout } from '../errors.ts';
import type { ServiceDeps } from './deps.ts';

export async function requireCompany(
  db: Db,
  { companyId, tx }: { companyId: CompanyId; tx: Tx },
): Promise<CompanyRecord> {
  const company = await findCompany(db, { companyId, tx });
  if (company === null) throw new AppError({ code: ErrorCode.CompanyNotFound, companyId });
  return company;
}

/** Runs work in one transaction that holds the lock of the company, or fails with LOCK_TIMEOUT. */
export async function withCompanyLock<T>(
  { deps, companyId }: { deps: ServiceDeps; companyId: CompanyId },
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const { sequelize } = deps.db;
  const timeoutMs = Math.max(1, Math.trunc(deps.lockTimeoutMs));
  // Use elapsed real time, not the injected business clock used to evaluate shifts.
  const deadline = performance.now() + timeoutMs;
  try {
    const options = { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED };
    return await sequelize.transaction(options, async (tx) => {
      // Pool acquisition and transaction setup have already spent part of the wait budget.
      const remainingMs = Math.floor(deadline - performance.now());
      if (remainingMs <= 0) throw new AppError({ code: ErrorCode.LockTimeout });
      await sequelize.query(`SET LOCAL lock_timeout = '${remainingMs}ms'`, { transaction: tx });
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext($companyId))', {
        bind: { companyId },
        transaction: tx,
      });
      await requireCompany(deps.db, { companyId, tx });
      return await work(tx);
    });
  } catch (error) {
    if (isLockTimeout(error)) throw new AppError({ code: ErrorCode.LockTimeout }, { cause: error });
    throw error;
  }
}
