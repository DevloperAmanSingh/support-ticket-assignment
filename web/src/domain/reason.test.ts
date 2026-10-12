import { describe, expect, it } from 'vitest';

import type { AssignedReason, RejectedAgent } from '@shared/api-types.ts';
import { RejectionCode, Rule, TicketStatus } from '@shared/codes.ts';

import { AgentIds } from '@/test/fixtures.ts';

import {
  agentName,
  rejectedSummary,
  rejectionPhrase,
  rejectionSentence,
  ruleSentence,
  shortReason,
  statusLabel,
} from './reason.ts';
import type { AgentNames } from './reason.ts';

const TIMEZONE = 'America/New_York';

const names: AgentNames = new Map([
  [AgentIds.Priya, 'Priya'],
  [AgentIds.Sam, 'Sam'],
  [AgentIds.Lee, 'Lee'],
]);

// One rejection per code. A new code does not compile until it has a case and both sentences.
const REJECTIONS: Record<RejectionCode, RejectedAgent> = {
  [RejectionCode.NotOnShift]: { agent_id: AgentIds.Sam, code: RejectionCode.NotOnShift },
  [RejectionCode.AtLimit]: { agent_id: AgentIds.Sam, code: RejectionCode.AtLimit, open: 5 },
  [RejectionCode.MoreOpen]: { agent_id: AgentIds.Sam, code: RejectionCode.MoreOpen, open: 3 },
  [RejectionCode.AssignedMoreRecently]: {
    agent_id: AgentIds.Sam,
    code: RejectionCode.AssignedMoreRecently,
    last_assigned_at: '2026-10-13T04:10:00Z',
  },
  [RejectionCode.HigherId]: { agent_id: AgentIds.Sam, code: RejectionCode.HigherId },
};

const SENTENCES: Record<RejectionCode, string> = {
  [RejectionCode.NotOnShift]: 'Not on shift.',
  [RejectionCode.AtLimit]: 'At the ticket limit with 5 open.',
  [RejectionCode.MoreOpen]: 'Has more open tickets (3).',
  [RejectionCode.AssignedMoreRecently]:
    'Same open count, but got a ticket more recently (Tue 13 Oct, 00:10).',
  [RejectionCode.HigherId]: 'Same open count and last assignment. The lower agent id wins.',
};

const PHRASES: Record<RejectionCode, string> = {
  [RejectionCode.NotOnShift]: 'not on shift',
  [RejectionCode.AtLimit]: 'at the ticket limit',
  [RejectionCode.MoreOpen]: 'more open tickets',
  [RejectionCode.AssignedMoreRecently]: 'assigned a ticket more recently',
  [RejectionCode.HigherId]: 'same count and time, higher agent id',
};

describe('rejection codes', () => {
  it.each(Object.values(RejectionCode))('writes a sentence with the compared value for %s', (code) => {
    expect(rejectionSentence({ rejected: REJECTIONS[code], timezone: TIMEZONE })).toBe(
      SENTENCES[code],
    );
  });

  it.each(Object.values(RejectionCode))('writes a short phrase for %s', (code) => {
    expect(rejectionPhrase(code)).toBe(PHRASES[code]);
  });
});

describe('rules', () => {
  const RULES: Record<Rule, string> = {
    [Rule.FewestOpen]: 'The agent on shift with the fewest open tickets gets the ticket.',
    [Rule.NoAgentOnShift]: 'No agent is on shift.',
    [Rule.AllAtLimit]: 'Every agent on shift is at the ticket limit.',
    [Rule.TicketClosed]: 'The ticket is closed.',
  };

  it.each(Object.values(Rule))('writes a sentence for %s', (rule) => {
    expect(ruleSentence(rule)).toBe(RULES[rule]);
  });
});

describe('short reason', () => {
  const assigned: AssignedReason = {
    rule: Rule.FewestOpen,
    selected: { agent_id: AgentIds.Priya, open: 2, limit: 5, last_assigned_at: null },
    rejected: [
      { agent_id: AgentIds.Sam, code: RejectionCode.NotOnShift },
      { agent_id: AgentIds.Lee, code: RejectionCode.AtLimit, open: 3 },
    ],
  };

  it('names the selected agent with the open count and the limit', () => {
    expect(shortReason({ reason: assigned, names })).toBe(
      'Priya is on shift and has the fewest open tickets (2, with a limit of 5).',
    );
  });

  it('lists each rejected agent with the cause', () => {
    expect(rejectedSummary({ rejected: assigned.rejected, names })).toBe(
      'Sam (not on shift), Lee (at the ticket limit).',
    );
  });

  it('has no rejected line when nobody was rejected', () => {
    expect(rejectedSummary({ rejected: [], names })).toBeNull();
  });

  it('says why nobody got the ticket', () => {
    expect(
      shortReason({ reason: { rule: Rule.NoAgentOnShift, selected: null, rejected: [] }, names }),
    ).toBe('No agent is on shift.');
    expect(
      shortReason({ reason: { rule: Rule.AllAtLimit, selected: null, rejected: [] }, names }),
    ).toBe('Every agent on shift is at the ticket limit.');
  });

  it('shows the id of an agent that is not in the list', () => {
    expect(agentName({ names, agentId: AgentIds.Emma })).toBe('a5');
  });
});

describe('status label', () => {
  it.each([
    [TicketStatus.Open, 'Open'],
    [TicketStatus.Unassigned, 'Unassigned'],
    [TicketStatus.Closed, 'Closed'],
  ])('writes %s as %s', (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });
});
