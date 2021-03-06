import { Knex } from 'knex';
import { ModelMysqlBasic } from '@dkdao/framework';
import config from '../helper/config';

export enum EToken {
  DePayRouter = 0,
  ERC20 = 20,
  ERC721 = 721,
}

export interface IToken {
  id: number;
  blockchainId: number;
  type: EToken;
  name: string;
  address: string;
  symbol: string;
  decimal: number;
  createdDate: string;
}

export class ModelToken extends ModelMysqlBasic<IToken> {
  constructor() {
    super(config.table.token);
  }

  public basicQuery(): Knex.QueryBuilder {
    return this.getDefaultKnex().select('*');
  }

  public getNft() {
    return this.get([
      {
        field: 'type',
        value: EToken.ERC721,
      },
    ]);
  }

  public getToken() {
    return this.get([
      {
        field: 'type',
        value: EToken.ERC20,
      },
    ]);
  }

  public getPayable(blockchainId?: number) {
    const query = this.basicQuery().whereIn('type', [EToken.DePayRouter, EToken.ERC20]);
    if (typeof blockchainId === 'number') {
      query.where({ blockchainId });
    }
    return query;
  }
}

export default ModelToken;
