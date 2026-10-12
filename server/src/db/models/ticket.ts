import { DataTypes, Model } from 'sequelize';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
  Sequelize,
} from 'sequelize';

import { TicketStatus } from '../../../../shared/codes.ts';
import type { Agent } from './agent.ts';
import type { Decision } from './decision.ts';

export class Ticket extends Model<InferAttributes<Ticket>, InferCreationAttributes<Ticket>> {
  declare companyId: string;
  declare ticketId: string;
  declare status: TicketStatus;
  declare agentId: CreationOptional<string | null>;
  declare createdAt: Date;
  declare assignedAt: CreationOptional<Date | null>;
  declare closedAt: CreationOptional<Date | null>;
  declare decisionId: number;
  declare agent?: NonAttribute<Agent | null>;
  declare decision?: NonAttribute<Decision>;
}

export function initTicket(sequelize: Sequelize): typeof Ticket {
  return Ticket.init(
    {
      companyId: { type: DataTypes.TEXT, primaryKey: true },
      ticketId: { type: DataTypes.TEXT, primaryKey: true },
      status: { type: DataTypes.ENUM(...Object.values(TicketStatus)), allowNull: false },
      agentId: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      assignedAt: { type: DataTypes.DATE, allowNull: true },
      closedAt: { type: DataTypes.DATE, allowNull: true },
      decisionId: { type: DataTypes.INTEGER, allowNull: false },
    },
    { sequelize, tableName: 'tickets', underscored: true, timestamps: false },
  );
}
