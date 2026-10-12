import { pino } from 'pino';
import type { Logger } from 'pino';

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({ level });
}
