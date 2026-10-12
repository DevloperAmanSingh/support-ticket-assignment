import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export class Company extends Model<InferAttributes<Company>, InferCreationAttributes<Company>> {
  declare id: string;
  declare name: string;
  declare timezone: string;
}

export function initCompany(sequelize: Sequelize): typeof Company {
  return Company.init(
    {
      id: { type: DataTypes.TEXT, primaryKey: true },
      name: { type: DataTypes.TEXT, allowNull: false },
      timezone: { type: DataTypes.TEXT, allowNull: false },
    },
    { sequelize, tableName: 'companies', underscored: true, timestamps: false },
  );
}
