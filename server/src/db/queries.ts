import { DateTime } from 'luxon';
import { QueryTypes } from 'sequelize';
import type { Transaction } from 'sequelize';

import {
  AgentRefSchema,
  AssignedReasonSchema,
  UnassignedReasonSchema,
} from '../../../shared/api-types.ts';
import type { AssignedReason, UnassignedReason } from '../../../shared/api-types.ts';
import { TicketOrder, TicketStatus } from '../../../shared/codes.ts';
import type { DecisionOutcome } from '../codes.ts';
import {
  AgentIdSchema,
  CompanyIdSchema,
  DecisionIdSchema,
  TicketIdSchema,
} from '../../../shared/ids.ts';
import type { AgentId, CompanyId, DecisionId, TicketId } from '../../../shared/ids.ts';
import type { AgentSnapshot } from '../domain/select.ts';
import { UTC_ZONE } from '../domain/time.ts';
import type { WeeklyWindow } from '../domain/time.ts';
import { z } from '../../../shared/zod.ts';
import { Association } from './models/index.ts';
import type { Db } from './sequelize.ts';

/** The transaction a query joins, or null to run on its own. */
export type Tx = Transaction | null;

const InstantSchema = z.date().transform((date) => DateTime.fromJSDate(date, { zone: UTC_ZONE }));

const WindowRowSchema = z.object({
  weekday: z.number().int(),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
});

const CompanyRowSchema = z.object({
  id: CompanyIdSchema,
  name: z.string(),
  timezone: z.string(),
});
export type CompanyRecord = z.infer<typeof CompanyRowSchema>;

export async function findCompany(
  db: Db,
  { companyId, tx }: { companyId: CompanyId; tx: Tx },
): Promise<CompanyRecord | null> {
  const row = await db.models.Company.findByPk(companyId, { transaction: tx });
  return row === null ? null : CompanyRowSchema.parse(row.get({ plain: true }));
}

export async function listCompanies(db: Db): Promise<CompanyRecord[]> {
  const rows = await db.models.Company.findAll({ order: [['id', 'ASC']] });
  return z.array(CompanyRowSchema).parse(rows.map((row) => row.get({ plain: true })));
}

const AgentRowSchema = z.object({
  id: AgentIdSchema,
  name: z.string(),
  timezone: z.string(),
  ticketLimit: z.number().int(),
  shifts: z.array(WindowRowSchema),
});

const AgentLoadRowSchema = z.object({
  agent_id: AgentIdSchema,
  open_count: z.number().int(),
  last_assigned_at: InstantSchema.nullable(),
});

const AGENT_LOAD_SQL = `
  SELECT agent_id,
         (COUNT(*) FILTER (WHERE status = $open))::int AS open_count,
         MAX(assigned_at) AS last_assigned_at
    FROM tickets
   WHERE company_id = $companyId AND agent_id IS NOT NULL
   GROUP BY agent_id`;

export type AgentRecord = z.infer<typeof AgentRowSchema>;

export async function loadAgentsWithShifts(
  db: Db,
  { companyId, tx }: { companyId: CompanyId; tx: Tx },
): Promise<AgentRecord[]> {
  const rows = await db.models.Agent.findAll({
    where: { companyId },
    include: [{ model: db.models.Shift, as: Association.Shifts }],
    order: [['id', 'ASC']],
    transaction: tx,
  });
  return z.array(AgentRowSchema).parse(rows.map((row) => row.get({ plain: true })));
}

export async function loadAgentSnapshots(
  db: Db,
  { companyId, tx }: { companyId: CompanyId; tx: Tx },
): Promise<AgentSnapshot[]> {
  const agents = await loadAgentsWithShifts(db, { companyId, tx });

  const loadRows = await db.sequelize.query(AGENT_LOAD_SQL, {
    type: QueryTypes.SELECT,
    bind: { companyId, open: TicketStatus.Open },
    transaction: tx,
  });
  const loads = new Map(
    z
      .array(AgentLoadRowSchema)
      .parse(loadRows)
      .map((load) => [load.agent_id, load]),
  );

  return agents.map((agent) => {
    const load = loads.get(agent.id);
    return {
      ...agent,
      openCount: load?.open_count ?? 0,
      lastAssignedAt: load?.last_assigned_at ?? null,
    };
  });
}

/** Returns false for an unknown agent. */
export async function replaceAgentConfig(
  db: Db,
  input: {
    companyId: CompanyId;
    agentId: AgentId;
    timezone: string;
    ticketLimit: number;
    shifts: readonly WeeklyWindow[];
    tx: Tx;
  },
): Promise<boolean> {
  const { companyId, agentId, timezone, ticketLimit, shifts, tx } = input;
  const [updated] = await db.models.Agent.update(
    { timezone, ticketLimit },
    { where: { id: agentId, companyId }, transaction: tx },
  );
  if (updated === 0) return false;
  await db.models.Shift.destroy({ where: { agentId }, transaction: tx });
  await db.models.Shift.bulkCreate(
    shifts.map((shift) => ({ agentId, ...shift })),
    { transaction: tx },
  );
  return true;
}

export async function listCoverageHours(
  db: Db,
  { companyId, tx }: { companyId: CompanyId; tx: Tx },
): Promise<WeeklyWindow[]> {
  const rows = await db.models.CoverageHour.findAll({
    where: { companyId },
    order: [
      ['weekday', 'ASC'],
      ['startMinute', 'ASC'],
    ],
    transaction: tx,
  });
  return z.array(WindowRowSchema).parse(rows.map((row) => row.get({ plain: true })));
}

export async function replaceCoverageHours(
  db: Db,
  { companyId, hours, tx }: { companyId: CompanyId; hours: readonly WeeklyWindow[]; tx: Tx },
): Promise<void> {
  await db.models.CoverageHour.destroy({ where: { companyId }, transaction: tx });
  await db.models.CoverageHour.bulkCreate(
    hours.map((window) => ({ companyId, ...window })),
    { transaction: tx },
  );
}

const ticketBase = {
  ticketId: TicketIdSchema,
  createdAt: InstantSchema,
  decisionId: DecisionIdSchema,
};

const StoredTicketSchema = z.union([
  z.object({
    ...ticketBase,
    status: z.literal(TicketStatus.Open),
    agent: AgentRefSchema,
    assignedAt: InstantSchema,
    closedAt: z.null(),
    decision: z.object({ reason: AssignedReasonSchema }),
  }),
  z.object({
    ...ticketBase,
    status: z.literal(TicketStatus.Closed),
    agent: AgentRefSchema,
    assignedAt: InstantSchema,
    closedAt: InstantSchema,
    decision: z.object({ reason: AssignedReasonSchema }),
  }),
  z.object({
    ...ticketBase,
    status: z.literal(TicketStatus.Closed),
    agent: z.null(),
    assignedAt: z.null(),
    closedAt: InstantSchema,
    decision: z.object({ reason: UnassignedReasonSchema }),
  }),
  z.object({
    ...ticketBase,
    status: z.literal(TicketStatus.Unassigned),
    agent: z.null(),
    assignedAt: z.null(),
    closedAt: z.null(),
    decision: z.object({ reason: UnassignedReasonSchema }),
  }),
]);
export type StoredTicket = z.infer<typeof StoredTicketSchema>;

function ticketIncludes(db: Db) {
  return [
    { model: db.models.Agent, as: Association.Agent },
    { model: db.models.Decision, as: Association.Decision, required: true },
  ];
}

export async function findTicket(
  db: Db,
  { companyId, ticketId, tx }: { companyId: CompanyId; ticketId: TicketId; tx: Tx },
): Promise<StoredTicket | null> {
  const row = await db.models.Ticket.findOne({
    where: { companyId, ticketId },
    include: ticketIncludes(db),
    transaction: tx,
  });
  return row === null ? null : StoredTicketSchema.parse(row.get({ plain: true }));
}

function directionOf(order: TicketOrder): 'ASC' | 'DESC' {
  switch (order) {
    case TicketOrder.Oldest:
      return 'ASC';
    case TicketOrder.Newest:
      return 'DESC';
    default: {
      const _exhaustive: never = order;
      return _exhaustive;
    }
  }
}

export async function listTickets(
  db: Db,
  {
    companyId,
    status,
    order,
  }: { companyId: CompanyId; status: TicketStatus | null; order: TicketOrder },
): Promise<StoredTicket[]> {
  const direction = directionOf(order);
  const rows = await db.models.Ticket.findAll({
    where: status === null ? { companyId } : { companyId, status },
    include: ticketIncludes(db),
    order: [
      ['createdAt', direction],
      ['ticketId', direction],
    ],
  });
  return z.array(StoredTicketSchema).parse(rows.map((row) => row.get({ plain: true })));
}

export async function listUnassignedTicketIds(
  db: Db,
  { companyId }: { companyId: CompanyId },
): Promise<TicketId[]> {
  const rows = await db.models.Ticket.findAll({
    attributes: ['ticketId'],
    where: { companyId, status: TicketStatus.Unassigned },
    order: [
      ['createdAt', 'ASC'],
      ['ticketId', 'ASC'],
    ],
  });
  return rows.map((row) => TicketIdSchema.parse(row.ticketId));
}

/** What a new decision writes. The agent is part of the outcome, so the two cannot disagree. */
export type NewDecision =
  | {
      readonly outcome: typeof DecisionOutcome.Assigned;
      readonly reason: AssignedReason;
      readonly agentId: AgentId;
    }
  | {
      readonly outcome: typeof DecisionOutcome.Unassigned;
      readonly reason: UnassignedReason;
      readonly agentId: null;
    };

// `created_at` comes from the application clock at the first decision, not from a database default.
const UPSERT_TICKET_SQL = `
  INSERT INTO tickets (company_id, ticket_id, status, agent_id, created_at, assigned_at, decision_id)
  VALUES ($companyId, $ticketId, $status, $agentId, $createdAt, $assignedAt, $decisionId)
  ON CONFLICT (company_id, ticket_id) DO UPDATE
     SET status = EXCLUDED.status,
         agent_id = EXCLUDED.agent_id,
         assigned_at = EXCLUDED.assigned_at,
         decision_id = EXCLUDED.decision_id`;

/**
 * Adds the decision row and saves its ticket: open with the agent, or unassigned without one.
 * A new ticket row gets `created_at = now`; an old row keeps its own. Returns the decision id.
 */
export async function saveDecision(
  db: Db,
  input: {
    companyId: CompanyId;
    ticketId: TicketId;
    now: DateTime;
    decision: NewDecision;
    tx: Tx;
  },
): Promise<DecisionId> {
  const { companyId, ticketId, now, decision, tx } = input;
  const { outcome, reason, agentId } = decision;
  const decidedAt = now.toJSDate();
  const row = await db.models.Decision.create(
    { companyId, ticketId, decidedAt, outcome, reason },
    { transaction: tx },
  );
  const decisionId = DecisionIdSchema.parse(row.id);
  await db.sequelize.query(UPSERT_TICKET_SQL, {
    type: QueryTypes.INSERT,
    bind: {
      companyId,
      ticketId,
      status: agentId === null ? TicketStatus.Unassigned : TicketStatus.Open,
      agentId,
      createdAt: decidedAt,
      assignedAt: agentId === null ? null : decidedAt,
      decisionId,
    },
    transaction: tx,
  });
  return decisionId;
}

export async function markTicketClosed(
  db: Db,
  input: { companyId: CompanyId; ticketId: TicketId; now: DateTime; tx: Tx },
): Promise<void> {
  const { companyId, ticketId, now, tx } = input;
  await db.models.Ticket.update(
    { status: TicketStatus.Closed, closedAt: now.toJSDate() },
    { where: { companyId, ticketId }, transaction: tx },
  );
}
