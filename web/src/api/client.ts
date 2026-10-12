import { ErrorResponseSchema } from '@shared/api-types.ts';
import { ErrorCode } from '@shared/codes.ts';
import type { z } from '@shared/zod.ts';

export const HttpStatus = {
  BadRequest: 400,
  NotFound: 404,
  ServiceUnavailable: 503,
} as const;

const HttpMethod = { Get: 'GET', Post: 'POST', Put: 'PUT' } as const;
type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor({ status, code, message }: { status: number; code: ErrorCode; message: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class ResponseParseError extends Error {
  readonly status: number;

  constructor({ status, path, cause }: { status: number; path: string; cause: unknown }) {
    super(`Unexpected response body from ${path}`, { cause });
    this.name = 'ResponseParseError';
    this.status = status;
  }
}

export const ErrorKind = {
  Busy: 'busy',
  Validation: 'validation',
  NotFound: 'not_found',
  Unexpected: 'unexpected',
} as const;

export type ClassifiedError =
  | { readonly kind: typeof ErrorKind.Busy }
  | { readonly kind: typeof ErrorKind.Validation; readonly message: string }
  | { readonly kind: typeof ErrorKind.NotFound; readonly message: string }
  | { readonly kind: typeof ErrorKind.Unexpected };

export function classifyError(error: Error): ClassifiedError {
  if (!(error instanceof ApiError)) return { kind: ErrorKind.Unexpected };
  if (error.status === HttpStatus.ServiceUnavailable) return { kind: ErrorKind.Busy };
  if (error.status === HttpStatus.BadRequest && error.code === ErrorCode.ValidationError) {
    return { kind: ErrorKind.Validation, message: error.message };
  }
  if (error.status === HttpStatus.NotFound) {
    return { kind: ErrorKind.NotFound, message: error.message };
  }
  return { kind: ErrorKind.Unexpected };
}

async function readJson({ response, path }: { response: Response; path: string }): Promise<unknown> {
  try {
    const payload: unknown = await response.json();
    return payload;
  } catch (cause) {
    throw new ResponseParseError({ status: response.status, path, cause });
  }
}

function toResponseError({
  status,
  path,
  payload,
}: {
  status: number;
  path: string;
  payload: unknown;
}): ApiError | ResponseParseError {
  const parsed = ErrorResponseSchema.safeParse(payload);
  if (!parsed.success) return new ResponseParseError({ status, path, cause: parsed.error });
  return new ApiError({ status, ...parsed.data.error });
}

async function request<Schema extends z.ZodType>({
  method,
  path,
  body,
  schema,
}: {
  method: HttpMethod;
  path: string;
  body: object | null;
  schema: Schema;
}): Promise<z.infer<Schema>> {
  try {
    // An absolute URL, so the same call works in the browser and under the Node fetch of the tests.
    const response = await fetch(
      new URL(path, window.location.origin),
      body === null ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(body) },
    );
    const payload = await readJson({ response, path });
    if (!response.ok) throw toResponseError({ status: response.status, path, payload });
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ResponseParseError({ status: response.status, path, cause: parsed.error });
    }
    return parsed.data;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    if (classifyError(error).kind === ErrorKind.Unexpected) {
      console.error('api request failed', { method, path, error });
    }
    throw error;
  }
}

export function getJson<Schema extends z.ZodType>({
  path,
  schema,
}: {
  path: string;
  schema: Schema;
}): Promise<z.infer<Schema>> {
  return request({ method: HttpMethod.Get, path, body: null, schema });
}

export function postJson<Schema extends z.ZodType>({
  path,
  body,
  schema,
}: {
  path: string;
  body: object | null;
  schema: Schema;
}): Promise<z.infer<Schema>> {
  return request({ method: HttpMethod.Post, path, body, schema });
}

export function putJson<Schema extends z.ZodType>({
  path,
  body,
  schema,
}: {
  path: string;
  body: object;
  schema: Schema;
}): Promise<z.infer<Schema>> {
  return request({ method: HttpMethod.Put, path, body, schema });
}
