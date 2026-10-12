import { describe, expect, it } from 'vitest';

import { UpdateAgentRequestSchema } from '@shared/api-types.ts';

import { errorAt, NO_FIELD_ERRORS, toFieldErrors, withoutErrorsAt } from './fieldErrors.ts';

function errorsOf(body: unknown) {
  const parsed = UpdateAgentRequestSchema.safeParse(body);
  if (parsed.success) throw new Error('The body is valid');
  return toFieldErrors(parsed.error);
}

describe('field errors', () => {
  const errors = errorsOf({
    timezone: 'Mars/Olympus',
    ticket_limit: 0,
    shifts: [
      { weekday: 1, start: '09:02', end: '17:00' },
      { weekday: 2, start: '09:00', end: '09:00' },
    ],
  });

  it('keys each message by the path of its field', () => {
    expect(errorAt(errors, 'timezone')).toBe('timezone must be an IANA timezone name');
    expect(errorAt(errors, 'ticket_limit')).toBe('ticket_limit must be 1 or more');
    expect(errorAt(errors, 'shifts', 0, 'start')).toBe('time must be on a 5-minute step');
    expect(errorAt(errors, 'shifts', 1)).toBe('a shift start and end must differ');
    expect(errorAt(errors, 'shifts', 0, 'end')).toBeNull();
  });

  it('drops one field and leaves the others', () => {
    const next = withoutErrorsAt(errors, 'timezone');

    expect(errorAt(next, 'timezone')).toBeNull();
    expect(errorAt(next, 'ticket_limit')).toBe('ticket_limit must be 1 or more');
    expect(errorAt(next, 'shifts', 0, 'start')).toBe('time must be on a 5-minute step');
  });

  it('drops a list with every row under it', () => {
    const next = withoutErrorsAt(errors, 'shifts');

    expect(errorAt(next, 'shifts', 0, 'start')).toBeNull();
    expect(errorAt(next, 'shifts', 1)).toBeNull();
    expect(errorAt(next, 'timezone')).toBe('timezone must be an IANA timezone name');
  });

  it('does not match a field whose name only starts the same', () => {
    const similar = new Map([
      ['shifts', 'a'],
      ['shiftsCount', 'b'],
    ]);

    expect([...withoutErrorsAt(similar, 'shifts').keys()]).toEqual(['shiftsCount']);
  });

  it('returns the same map when nothing leaves', () => {
    expect(withoutErrorsAt(errors, 'name')).toBe(errors);
    expect(withoutErrorsAt(NO_FIELD_ERRORS, 'timezone')).toBe(NO_FIELD_ERRORS);
  });
});
