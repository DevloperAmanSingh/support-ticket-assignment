import type { CoverageResponse } from '@shared/api-types.ts';

import { AgentIds } from './fixtures.ts';

/** New York repeats 01:00 on Sunday. The 01:45 EDT–01:15 EST gap lasts 30 real minutes. */
export const fallBackCoverage: CoverageResponse = {
  timezone: 'America/New_York',
  week_start: '2026-10-26T00:00:00-04:00',
  week_end: '2026-11-02T00:00:00-05:00',
  hours: [{ weekday: 0, start: '01:00', end: '03:00' }],
  gaps: [
    { start: '2026-11-01T01:00:00-04:00', end: '2026-11-01T01:15:00-04:00' },
    { start: '2026-11-01T01:45:00-04:00', end: '2026-11-01T01:15:00-05:00' },
    { start: '2026-11-01T01:45:00-05:00', end: '2026-11-01T03:00:00-05:00' },
  ],
  agents: [{
    agent_id: AgentIds.Sam,
    name: 'Sam',
    timezone: 'America/New_York',
    intervals: [
      { start: '2026-11-01T01:15:00-04:00', end: '2026-11-01T01:45:00-04:00' },
      { start: '2026-11-01T01:15:00-05:00', end: '2026-11-01T01:45:00-05:00' },
    ],
  }],
};

/** The clock jumps from 01:59 to 03:00; the shift starting at missing 02:15 begins at 03:00. */
export const springForwardCoverage: CoverageResponse = {
  ...fallBackCoverage,
  week_start: '2026-03-02T00:00:00-05:00',
  week_end: '2026-03-09T00:00:00-04:00',
  hours: [{ weekday: 0, start: '01:00', end: '04:00' }],
  gaps: [
    { start: '2026-03-08T01:00:00-05:00', end: '2026-03-08T03:00:00-04:00' },
    { start: '2026-03-08T03:15:00-04:00', end: '2026-03-08T04:00:00-04:00' },
  ],
  agents: [{
    agent_id: AgentIds.Sam, name: 'Sam', timezone: 'America/New_York',
    intervals: [{ start: '2026-03-08T03:00:00-04:00', end: '2026-03-08T03:15:00-04:00' }],
  }],
};
