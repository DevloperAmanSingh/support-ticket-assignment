import { DataTypes, Model } from 'sequelize';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from 'sequelize';

export class Shift extends Model<InferAttributes<Shift>, InferCreationAttributes<Shift>> {
  declare id: CreationOptional<number>;
  declare agentId: string;
  declare weekday: number;
  declare startMinute: number;
  declare endMinute: number;
}

export function initShift(sequelize: Sequelize): typeof Shift {
  return Shift.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      agentId: { type: DataTypes.TEXT, allowNull: false },
      weekday: { type: DataTypes.SMALLINT, allowNull: false },
      startMinute: { type: DataTypes.SMALLINT, allowNull: false },
      endMinute: { type: DataTypes.SMALLINT, allowNull: false },
    },
    { sequelize, tableName: 'shifts', underscored: true, timestamps: false },
  );
}
