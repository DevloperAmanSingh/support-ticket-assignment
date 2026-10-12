import { z } from './zod.ts';

const idText = z.string().min(1).max(200);

export const CompanyIdSchema = idText.brand<'CompanyId'>();
export type CompanyId = z.infer<typeof CompanyIdSchema>;

export const AgentIdSchema = idText.brand<'AgentId'>();
export type AgentId = z.infer<typeof AgentIdSchema>;

export const TicketIdSchema = idText.brand<'TicketId'>();
export type TicketId = z.infer<typeof TicketIdSchema>;

export const DecisionIdSchema = z.number().int().positive().brand<'DecisionId'>();
export type DecisionId = z.infer<typeof DecisionIdSchema>;
