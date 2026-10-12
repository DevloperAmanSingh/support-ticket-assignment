import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@shared/codes.ts';
import { z } from '@shared/zod.ts';

import { errorResponse, server } from '@/test/server.ts';

import { ApiError, classifyError, ErrorKind, getJson, postJson, ResponseParseError } from './client.ts';

const PATH = '/api/thing';
const ThingSchema = z.object({ value: z.number() });

/** Runs a call that must fail and returns what it threw. */
async function failureOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error('The call did not fail');
}

describe('api client', () => {
  const logged = vi.spyOn(console, 'error');

  beforeEach(() => {
    logged.mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockReset();
  });

  it('parses a good body with the schema', async () => {
    server.use(http.get(PATH, () => HttpResponse.json({ value: 7, extra: 'dropped' })));

    await expect(getJson({ path: PATH, schema: ThingSchema })).resolves.toEqual({ value: 7 });
  });

  it('sends the body as JSON', async () => {
    let received: unknown = null;
    server.use(
      http.post(PATH, async ({ request }) => {
        received = {
          body: await request.json(),
          contentType: request.headers.get('content-type'),
        };
        return HttpResponse.json({ value: 1 });
      }),
    );

    await postJson({ path: PATH, body: { ticket_id: 'T-1' }, schema: ThingSchema });

    expect(received).toEqual({ body: { ticket_id: 'T-1' }, contentType: 'application/json' });
  });

  it('throws ApiError with the code and the message of a 400', async () => {
    server.use(
      http.get(PATH, () =>
        errorResponse({
          status: 400,
          code: ErrorCode.ValidationError,
          message: 'ticket_limit must be 1 or more',
        }),
      ),
    );

    const error = await failureOf(getJson({ path: PATH, schema: ThingSchema }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: ErrorCode.ValidationError,
      message: 'ticket_limit must be 1 or more',
    });
    expect(error instanceof Error && classifyError(error)).toEqual({
      kind: ErrorKind.Validation,
      message: 'ticket_limit must be 1 or more',
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it('throws ApiError on a 503 and classifies it as busy', async () => {
    server.use(
      http.get(PATH, () =>
        errorResponse({ status: 503, code: ErrorCode.LockTimeout, message: 'Lock wait timed out' }),
      ),
    );

    const error = await failureOf(getJson({ path: PATH, schema: ThingSchema }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: ErrorCode.LockTimeout });
    expect(error instanceof Error && classifyError(error)).toEqual({ kind: ErrorKind.Busy });
    expect(logged).not.toHaveBeenCalled();
  });

  it('classifies a 404 as not found with the message of the service', async () => {
    server.use(
      http.get(PATH, () =>
        errorResponse({ status: 404, code: ErrorCode.CompanyNotFound, message: 'Company not found' }),
      ),
    );

    const error = await failureOf(getJson({ path: PATH, schema: ThingSchema }));

    expect(error instanceof Error && classifyError(error)).toEqual({
      kind: ErrorKind.NotFound,
      message: 'Company not found',
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it('throws on a 200 body that fails the schema, and logs it', async () => {
    server.use(http.get(PATH, () => HttpResponse.json({ value: 'seven' })));

    const error = await failureOf(getJson({ path: PATH, schema: ThingSchema }));

    expect(error).toBeInstanceOf(ResponseParseError);
    expect(error).toMatchObject({ status: 200 });
    expect(error instanceof Error && classifyError(error)).toEqual({ kind: ErrorKind.Unexpected });
    expect(logged).toHaveBeenCalledOnce();
  });

  it('throws on an error body that is not the error shape of the service', async () => {
    server.use(http.get(PATH, () => new HttpResponse('Bad gateway', { status: 502 })));

    const error = await failureOf(getJson({ path: PATH, schema: ThingSchema }));

    expect(error).toBeInstanceOf(ResponseParseError);
    expect(error).toMatchObject({ status: 502 });
    expect(logged).toHaveBeenCalledOnce();
  });

  it('logs a 500 as unexpected', async () => {
    server.use(
      http.get(PATH, () =>
        errorResponse({ status: 500, code: ErrorCode.InternalError, message: 'Internal error' }),
      ),
    );

    const error = await failureOf(getJson({ path: PATH, schema: ThingSchema }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error instanceof Error && classifyError(error)).toEqual({ kind: ErrorKind.Unexpected });
    expect(logged).toHaveBeenCalledOnce();
  });
});
