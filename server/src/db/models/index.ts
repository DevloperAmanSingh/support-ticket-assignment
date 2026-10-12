import type { Sequelize } from 'sequelize';

import { Agent, initAgent } from './agent.ts';
import { Company, initCompany } from './company.ts';
import { CoverageHour, initCoverageHour } from './coverageHour.ts';
import { Decision, initDecision } from './decision.ts';
import { initShift, Shift } from './shift.ts';
import { initTicket, Ticket } from './ticket.ts';

export { Agent, Company, CoverageHour, Decision, Shift, Ticket };

export const Association = {
  Shifts: 'shifts',
  Agent: 'agent',
  Decision: 'decision',
} as const;

export type Models = {
  readonly Company: typeof Company;
  readonly Agent: typeof Agent;
  readonly Shift: typeof Shift;
  readonly CoverageHour: typeof CoverageHour;
  readonly Decision: typeof Decision;
  readonly Ticket: typeof Ticket;
};

export function initModels(sequelize: Sequelize): Models {
  initCompany(sequelize);
  initAgent(sequelize);
  initShift(sequelize);
  initCoverageHour(sequelize);
  initDecision(sequelize);
  initTicket(sequelize);

  Company.hasMany(Agent, { foreignKey: 'companyId' });
  Agent.belongsTo(Company, { foreignKey: 'companyId' });
  Agent.hasMany(Shift, { foreignKey: 'agentId', as: Association.Shifts });
  Shift.belongsTo(Agent, { foreignKey: 'agentId' });
  Company.hasMany(CoverageHour, { foreignKey: 'companyId' });
  CoverageHour.belongsTo(Company, { foreignKey: 'companyId' });
  Company.hasMany(Decision, { foreignKey: 'companyId' });
  Decision.belongsTo(Company, { foreignKey: 'companyId' });
  Company.hasMany(Ticket, { foreignKey: 'companyId' });
  Ticket.belongsTo(Company, { foreignKey: 'companyId' });
  Ticket.belongsTo(Agent, { foreignKey: 'agentId', as: Association.Agent });
  Ticket.belongsTo(Decision, { foreignKey: 'decisionId', as: Association.Decision });

  return { Company, Agent, Shift, CoverageHour, Decision, Ticket };
}
