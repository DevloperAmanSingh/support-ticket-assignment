import { ErrorCode } from '../../../shared/codes.ts';
import { AgentIdSchema, CompanyIdSchema, TicketIdSchema } from '../../../shared/ids.ts';
import { AppError } from '../errors.ts';
import { z } from '../../../shared/zod.ts';

export const CompanyParamsSchema = z.object({ companyId: CompanyIdSchema });
export const AgentParamsSchema = z.object({ companyId: CompanyIdSchema, agentId: AgentIdSchema });
export const TicketParamsSchema = z.object({
  companyId: CompanyIdSchema,
  ticketId: TicketIdSchema,
});

export function parseRequest<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
  throw new AppError({ code: ErrorCode.ValidationError, message });
}
