// The issues of a failed form parse, keyed by field path, so each one shows under its field.
import type { z } from '@shared/zod.ts';

/** Field path ("shifts.0.start") to the first message of that field. */
export type FieldErrors = ReadonlyMap<string, string>;

export const NO_FIELD_ERRORS: FieldErrors = new Map();

export function fieldPath(...parts: readonly PropertyKey[]): string {
  return parts.map(String).join('.');
}

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors = new Map<string, string>();
  for (const issue of error.issues) {
    const path = fieldPath(...issue.path);
    if (!errors.has(path)) errors.set(path, issue.message);
  }
  return errors;
}

/** Drops the errors of one field and of everything under it: "shifts" also drops "shifts.0.start". */
export function withoutErrorsAt(errors: FieldErrors, ...parts: readonly PropertyKey[]): FieldErrors {
  const path = fieldPath(...parts);
  const kept = [...errors].filter(([key]) => key !== path && !key.startsWith(`${path}.`));
  return kept.length === errors.size ? errors : new Map(kept);
}

export function errorAt(errors: FieldErrors, ...parts: readonly PropertyKey[]): string | null {
  return errors.get(fieldPath(...parts)) ?? null;
}
