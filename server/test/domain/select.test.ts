import { describe, expect, it } from 'vitest';

import { RejectionCode, Rule } from '../../../shared/codes.ts';
import { DecisionOutcome } from '../../src/codes.ts';
import { selectAgent } from '../../src/domain/select.ts';
import type { AgentSnapshot } from '../../src/domain/select.ts';
import { agentId } from '../helpers/ids.ts';
import { at, MONDAY, window } from '../helpers/time.ts';

const now = at('2026-10-12T12:00:00Z');
const onNow = [window(MONDAY, '09:00', '17:00')];
const offNow = [window(MONDAY, '18:00', '20:00')];

function agent(id: string, overrides: Partial<AgentSnapshot> = {}): AgentSnapshot {
  return {
    id: agentId(id),
    name: id.toUpperCase(),
    timezone: 'UTC',
    ticketLimit: 5,
    shifts: onNow,
    openCount: 0,
    lastAssignedAt: null,
    ...overrides,
  };
}

function assigned(agents: AgentSnapshot[]) {
  const selection = selectAgent({ now, agents });
  if (selection.kind !== DecisionOutcome.Assigned) throw new Error('expected an assignment');
  return selection;
}

function unassigned(agents: AgentSnapshot[]) {
  const selection = selectAgent({ now, agents });
  if (selection.kind !== DecisionOutcome.Unassigned) throw new Error('expected no assignment');
  return selection;
}

describe('selection', () => {
  it('selects the agent with the fewest open tickets', () => {
    const selection = assigned([agent('a1', { openCount: 3 }), agent('a2', { openCount: 2 })]);
    expect(selection.rule).toBe(Rule.FewestOpen);
    expect(selection.selected).toEqual({
      agentId: 'a2',
      name: 'A2',
      open: 2,
      limit: 5,
      lastAssignedAt: null,
    });
    expect(selection.rejected).toEqual([{ code: RejectionCode.MoreOpen, agentId: 'a1', open: 3 }]);
  });

  it('breaks a tie with the oldest last assignment', () => {
    const older = at('2026-10-12T08:00:00Z');
    const newer = at('2026-10-12T10:00:00Z');
    const selection = assigned([
      agent('a1', { openCount: 1, lastAssignedAt: newer }),
      agent('a2', { openCount: 1, lastAssignedAt: older }),
    ]);
    expect(selection.selected.agentId).toBe('a2');
    expect(selection.rejected).toEqual([
      { code: RejectionCode.AssignedMoreRecently, agentId: 'a1', lastAssignedAt: newer },
    ]);
  });

  it('uses the last assignment of agents who have only closed tickets', () => {
    // Both have zero open tickets. The id order (a1, a2) opposes the assignment order (a2, a1).
    const selection = assigned([
      agent('a1', { lastAssignedAt: at('2026-10-11T15:00:00Z') }),
      agent('a2', { lastAssignedAt: at('2026-10-11T09:00:00Z') }),
    ]);
    expect(selection.selected.agentId).toBe('a2');
    expect(selection.rejected.map((entry) => entry.code)).toEqual([
      RejectionCode.AssignedMoreRecently,
    ]);
  });

  it('puts a never-assigned agent first', () => {
    const last = at('2026-10-01T00:00:00Z');
    const selection = assigned([agent('a1', { lastAssignedAt: last }), agent('a2')]);
    expect(selection.selected.agentId).toBe('a2');
    expect(selection.selected.lastAssignedAt).toBeNull();
    expect(selection.rejected).toEqual([
      { code: RejectionCode.AssignedMoreRecently, agentId: 'a1', lastAssignedAt: last },
    ]);
  });

  it('breaks a full tie with the lower agent id', () => {
    const same = at('2026-10-12T08:00:00Z');
    const selection = assigned([
      agent('a2', { lastAssignedAt: same }),
      agent('a1', { lastAssignedAt: same }),
    ]);
    expect(selection.selected.agentId).toBe('a1');
    expect(selection.rejected).toEqual([{ code: RejectionCode.HigherId, agentId: 'a2' }]);
  });

  it('rejects an agent at or above the limit', () => {
    const selection = assigned([
      agent('a1', { openCount: 2, ticketLimit: 2 }),
      agent('a2', { openCount: 4, ticketLimit: 3 }),
      agent('a3', { openCount: 4 }),
    ]);
    expect(selection.selected.agentId).toBe('a3');
    expect(selection.rejected).toEqual([
      { code: RejectionCode.AtLimit, agentId: 'a1', open: 2 },
      { code: RejectionCode.AtLimit, agentId: 'a2', open: 4 },
    ]);
  });

  it('reports NO_AGENT_ON_SHIFT when nobody is on shift', () => {
    const selection = unassigned([
      agent('a1', { shifts: offNow }),
      agent('a2', { shifts: [], openCount: 5 }),
    ]);
    expect(selection.rule).toBe(Rule.NoAgentOnShift);
    expect(selection.rejected).toEqual([
      { code: RejectionCode.NotOnShift, agentId: 'a1' },
      { code: RejectionCode.NotOnShift, agentId: 'a2' },
    ]);
  });

  it('reports NO_AGENT_ON_SHIFT with no rejected agents for an empty company', () => {
    const selection = unassigned([]);
    expect(selection.rule).toBe(Rule.NoAgentOnShift);
    expect(selection.rejected).toEqual([]);
  });

  it('reports ALL_AT_LIMIT when every on-shift agent is at the limit', () => {
    const selection = unassigned([
      agent('a1', { openCount: 5 }),
      agent('a2', { shifts: offNow }),
      agent('a3', { openCount: 1, ticketLimit: 1 }),
    ]);
    expect(selection.rule).toBe(Rule.AllAtLimit);
    expect(selection.rejected).toEqual([
      { code: RejectionCode.AtLimit, agentId: 'a1', open: 5 },
      { code: RejectionCode.NotOnShift, agentId: 'a2' },
      { code: RejectionCode.AtLimit, agentId: 'a3', open: 1 },
    ]);
  });

  it('gives every rejected code with its compared value', () => {
    const winnerLast = at('2026-10-12T07:00:00Z');
    const laterLast = at('2026-10-12T11:00:00Z');
    const selection = assigned([
      agent('a1', { openCount: 1, lastAssignedAt: winnerLast }),
      agent('a2', { openCount: 1, lastAssignedAt: winnerLast }),
      agent('a3', { openCount: 1, lastAssignedAt: laterLast }),
      agent('a4', { openCount: 2 }),
      agent('a5', { openCount: 5 }),
      agent('a6', { shifts: offNow }),
    ]);
    expect(selection.selected).toMatchObject({ agentId: 'a1', open: 1, lastAssignedAt: winnerLast });
    expect(selection.rejected).toEqual([
      { code: RejectionCode.HigherId, agentId: 'a2' },
      { code: RejectionCode.AssignedMoreRecently, agentId: 'a3', lastAssignedAt: laterLast },
      { code: RejectionCode.MoreOpen, agentId: 'a4', open: 2 },
      { code: RejectionCode.AtLimit, agentId: 'a5', open: 5 },
      { code: RejectionCode.NotOnShift, agentId: 'a6' },
    ]);
  });
});
