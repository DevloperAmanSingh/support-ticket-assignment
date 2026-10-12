import type { DateTime } from 'luxon';

import type { Clock } from '../../src/clock.ts';
import { at } from './time.ts';

/** The test clock: it shows the instant the test sets, and can step forward on each read. */
export class FakeClock implements Clock {
  #current: DateTime;
  #stepMs = 0;

  constructor(start: string) {
    this.#current = at(start);
  }

  now(): DateTime {
    const value = this.#current;
    this.#current = value.plus({ milliseconds: this.#stepMs });
    return value;
  }

  /** Moves the clock to an instant. */
  set(iso: string): void {
    this.#current = at(iso);
  }

  /** Makes each later read move the clock forward. */
  stepBy(milliseconds: number): void {
    this.#stepMs = milliseconds;
  }
}
