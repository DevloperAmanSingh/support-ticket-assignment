import type { AgentView, IntervalView, WindowView } from '../../../shared/api-types.ts';
import type { Interval } from '../domain/coverage.ts';
import { minuteToClockText } from '../../../shared/time.ts';
import { formatInstant } from '../domain/time.ts';
import type { WeeklyWindow } from '../domain/time.ts';
import type { AgentStatus } from '../services/agents.ts';

export function toWindowView(window: WeeklyWindow): WindowView {
  return {
    weekday: window.weekday,
    start: minuteToClockText(window.startMinute),
    end: minuteToClockText(window.endMinute),
  };
}

export function toIntervalView(interval: Interval): IntervalView {
  return { start: formatInstant(interval.start), end: formatInstant(interval.end) };
}

export function toAgentView({ agent, onShift }: AgentStatus): AgentView {
  return {
    id: agent.id,
    name: agent.name,
    timezone: agent.timezone,
    ticket_limit: agent.ticketLimit,
    shifts: agent.shifts.map(toWindowView),
    open_count: agent.openCount,
    on_shift: onShift,
  };
}
