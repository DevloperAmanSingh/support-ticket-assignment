import { DataTypes, Model } from 'sequelize';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
  Sequelize,
} from 'sequelize';

import { DEFAULT_TICKET_LIMIT } from '../../../../shared/codes.ts';
import type { Shift } from './shift.ts';

export class Agent extends Model<InferAttributes<Agent>, InferCreationAttributes<Agent>> {
  declare id: string;
  declare companyId: string;
  declare name: string;
  declare timezone: string;
  declare ticketLimit: CreationOptional<number>;
  declare shifts?: NonAttribute<Shift[]>;
}

export function initAgent(sequelize: Sequelize): typeof Agent {
  return Agent.init(
    {
      id: { type: DataTypes.TEXT, primaryKey: true },
      companyId: { type: DataTypes.TEXT, allowNull: false },
      name: { type: DataTypes.TEXT, allowNull: false },
      timezone: { type: DataTypes.TEXT, allowNull: false },
      ticketLimit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: DEFAULT_TICKET_LIMIT,
      },
    },
    { sequelize, tableName: 'agents', underscored: true, timestamps: false },
  );
}
