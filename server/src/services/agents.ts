import { loadAgentSnapshots, replaceAgentConfig } from '../db/queries.ts';
import { ErrorCode } from '../../../shared/codes.ts';
import type { AgentId, CompanyId } from '../../../shared/ids.ts';
import type { AgentSnapshot } from '../domain/select.ts';
import { hasOverlap, isOnShift } from '../domain/time.ts';
import type { WeeklyWindow } from '../domain/time.ts';
import { AppError } from '../errors.ts';
import type { ServiceDeps } from './deps.ts';
import { requireCompany, withCompanyLock } from './lock.ts';

export type AgentStatus = { readonly agent: AgentSnapshot; readonly onShift: boolean };

export type AgentConfig = {
  readonly timezone: string;
  readonly ticketLimit: number;
  readonly shifts: readonly WeeklyWindow[];
};

export async function listAgents(
  deps: ServiceDeps,
  { companyId }: { companyId: CompanyId },
): Promise<AgentStatus[]> {
  await requireCompany(deps.db, { companyId, tx: null });
  const agents = await loadAgentSnapshots(deps.db, { companyId, tx: null });
  const now = deps.clock.now();
  return agents.map((agent) => ({
    agent,
    onShift: isOnShift({ now, timezone: agent.timezone, shifts: agent.shifts }),
  }));
}

export async function updateAgent(
  deps: ServiceDeps,
  input: { companyId: CompanyId; agentId: AgentId; config: AgentConfig },
): Promise<AgentStatus> {
  const { companyId, agentId, config } = input;
  if (hasOverlap(config.shifts)) {
    throw new AppError({
      code: ErrorCode.ValidationError,
      message: 'shifts: the shifts of one agent must not overlap',
    });
  }
  const status = await withCompanyLock({ deps, companyId }, async (tx) => {
    const now = deps.clock.now();
    const found = await replaceAgentConfig(deps.db, { companyId, agentId, ...config, tx });
    const agents = found ? await loadAgentSnapshots(deps.db, { companyId, tx }) : [];
    const agent = agents.find((entry) => entry.id === agentId);
    if (agent === undefined) throw new AppError({ code: ErrorCode.AgentNotFound, agentId });
    return { agent, onShift: isOnShift({ now, timezone: agent.timezone, shifts: agent.shifts }) };
  });
  deps.logger.info({ company_id: companyId, agent_id: agentId }, 'agent updated');
  return status;
}
