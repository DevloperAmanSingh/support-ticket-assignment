import { DataTypes, Model } from 'sequelize';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from 'sequelize';

export class CoverageHour extends Model<
  InferAttributes<CoverageHour>,
  InferCreationAttributes<CoverageHour>
> {
  declare id: CreationOptional<number>;
  declare companyId: string;
  declare weekday: number;
  declare startMinute: number;
  declare endMinute: number;
}

export function initCoverageHour(sequelize: Sequelize): typeof CoverageHour {
  return CoverageHour.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.TEXT, allowNull: false },
      weekday: { type: DataTypes.SMALLINT, allowNull: false },
      startMinute: { type: DataTypes.SMALLINT, allowNull: false },
      endMinute: { type: DataTypes.SMALLINT, allowNull: false },
    },
    { sequelize, tableName: 'coverage_hours', underscored: true, timestamps: false },
  );
}
