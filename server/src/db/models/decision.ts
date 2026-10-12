import { DataTypes, Model } from 'sequelize';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from 'sequelize';

import { DecisionOutcome } from '../../codes.ts';

export class Decision extends Model<InferAttributes<Decision>, InferCreationAttributes<Decision>> {
  declare id: CreationOptional<number>;
  declare companyId: string;
  declare ticketId: string;
  declare decidedAt: Date;
  declare outcome: DecisionOutcome;
  declare reason: unknown;
}

export function initDecision(sequelize: Sequelize): typeof Decision {
  return Decision.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.TEXT, allowNull: false },
      ticketId: { type: DataTypes.TEXT, allowNull: false },
      decidedAt: { type: DataTypes.DATE, allowNull: false },
      outcome: { type: DataTypes.ENUM(...Object.values(DecisionOutcome)), allowNull: false },
      reason: { type: DataTypes.JSONB, allowNull: false },
    },
    { sequelize, tableName: 'decisions', underscored: true, timestamps: false },
  );
}
