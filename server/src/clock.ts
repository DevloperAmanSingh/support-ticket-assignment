import { DateTime } from 'luxon';

/** The source of the current instant. Production reads the system clock; tests inject a fake. */
export interface Clock {
  now(): DateTime;
}

export const systemClock: Clock = {
  now: () => DateTime.utc(),
};
