import type { ErrorRequestHandler, RequestHandler } from 'express';

import type { ErrorResponse } from '../../../shared/api-types.ts';
import { ErrorCode } from '../../../shared/codes.ts';
import { AppError, toAppError } from '../errors.ts';
import type { Logger } from '../logger.ts';

const RETRY_AFTER_SECONDS = '1';

function httpStatusOf(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.ValidationError:
      return 400;
    case ErrorCode.CompanyNotFound:
    case ErrorCode.AgentNotFound:
    case ErrorCode.TicketNotFound:
    case ErrorCode.RouteNotFound:
      return 404;
    case ErrorCode.LockTimeout:
      return 503;
    case ErrorCode.InternalError:
      return 500;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

export const routeNotFound: RequestHandler = () => {
  throw new AppError({ code: ErrorCode.RouteNotFound });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    const appError = toAppError(error);
    const { code } = appError.detail;
    if (code === ErrorCode.InternalError) {
      logger.error({ err: error, method: req.method, path: req.path }, 'request failed');
    }
    if (code === ErrorCode.LockTimeout) res.set('Retry-After', RETRY_AFTER_SECONDS);
    const body: ErrorResponse = { error: { code, message: appError.message } };
    res.status(httpStatusOf(code)).json(body);
  };
}
