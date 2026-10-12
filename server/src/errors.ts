import { ConnectionAcquireTimeoutError } from 'sequelize';

import { ErrorCode } from '../../shared/codes.ts';
import { PgErrorCode } from './codes.ts';
import { z } from '../../shared/zod.ts';

export type AppErrorDetail =
  | { readonly code: typeof ErrorCode.ValidationError; readonly message: string }
  | { readonly code: typeof ErrorCode.CompanyNotFound; readonly companyId: string }
  | { readonly code: typeof ErrorCode.AgentNotFound; readonly agentId: string }
  | { readonly code: typeof ErrorCode.TicketNotFound; readonly ticketId: string }
  | { readonly code: typeof ErrorCode.RouteNotFound }
  | { readonly code: typeof ErrorCode.LockTimeout }
  | { readonly code: typeof ErrorCode.InternalError };

function describe(detail: AppErrorDetail): string {
  switch (detail.code) {
    case ErrorCode.ValidationError:
      return detail.message;
    case ErrorCode.CompanyNotFound:
      return `Company ${detail.companyId} does not exist`;
    case ErrorCode.AgentNotFound:
      return `Agent ${detail.agentId} does not exist in this company`;
    case ErrorCode.TicketNotFound:
      return `Ticket ${detail.ticketId} does not exist in this company`;
    case ErrorCode.RouteNotFound:
      return 'No such route';
    case ErrorCode.LockTimeout:
      return 'The company is busy. Try again.';
    case ErrorCode.InternalError:
      return 'Internal error';
    default: {
      const _exhaustive: never = detail;
      return _exhaustive;
    }
  }
}

export class AppError extends Error {
  readonly detail: AppErrorDetail;

  constructor(detail: AppErrorDetail, options?: ErrorOptions) {
    super(describe(detail), options);
    this.name = 'AppError';
    this.detail = detail;
  }
}

const LockTimeoutErrorSchema = z.object({
  original: z.object({ code: z.literal(PgErrorCode.LockNotAvailable) }),
});

/** Both a saturated connection pool and an expired lock wait are retryable busy responses. */
export function isLockTimeout(error: unknown): boolean {
  return (
    error instanceof ConnectionAcquireTimeoutError || LockTimeoutErrorSchema.safeParse(error).success
  );
}

const ClientErrorSchema = z.object({ status: z.number().int().min(400).max(499) });

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isLockTimeout(error)) return new AppError({ code: ErrorCode.LockTimeout }, { cause: error });
  if (ClientErrorSchema.safeParse(error).success) {
    return new AppError(
      { code: ErrorCode.ValidationError, message: 'The request body is not valid JSON' },
      { cause: error },
    );
  }
  return new AppError({ code: ErrorCode.InternalError }, { cause: error });
}
