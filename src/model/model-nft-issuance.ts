/* eslint-disable no-await-in-loop */
import { ethers } from 'ethers';
import { Knex } from 'knex';
import { v4 as uuidV4 } from 'uuid';
import { Utilities } from 'noqueue';
import { ModelMysqlBasic, IPagination, IModelCondition, IResponse, Transaction } from '@dkdao/framework';
import { EPaymentStatus, ModelPayment } from './model-payment';
import logger from '../helper/logger';
import { BigNum } from '../helper/utilities';
import { calculateDistribution, calculateNumberOfLootBoxes } from '../helper/calculate-loot-boxes';
import config from '../helper/config';
import ModelDiscount from './model-discount';

export enum ENftIssuanceStatus {
  New = 0,
  Opening = 1,
  Opened = 2,
  ResultArrived = 3,
  Error = 255,
}

export interface INftIssuance {
  id: number;
  phase: number;
  issuanceUuid: string;
  numberOfBox: number;
  totalBoxes: number;
  transactionHash: string | null;
  owner: string;
  status: ENftIssuanceStatus;
  updatedDate: string;
  createdDate: string;
}

export class ModelNftIssuance extends ModelMysqlBasic<INftIssuance> {
  constructor() {
    super(config.table.nftIssuance);
  }

  public basicQuery(): Knex.QueryBuilder {
    return this.getDefaultKnex().select('*');
  }

  public async openLootBox(
    contractCallback: (campaignId: number, owner: string, numberOfBox: number) => Promise<ethers.ContractTransaction>,
  ): Promise<void> {
    const opening = <INftIssuance | undefined>(
      await this.basicQuery().where({ status: ENftIssuanceStatus.New }).orderBy('id', 'asc').limit(1).first()
    );
    if (opening) {
      await Transaction.getInstance()
        .process(async (tx: Knex.Transaction) => {
          logger.info(`Trying to issue: ${opening.numberOfBox} loot boxes for ${opening.owner}, id: ${opening.id}`);
          const txResult = await Utilities.TillSuccess<ethers.ContractTransaction>(async () => {
            return contractCallback(opening.phase, opening.owner, opening.numberOfBox);
          });
          // Update status and update transaction hash
          await tx(this.tableName)
            .update(<Partial<INftIssuance>>{ status: ENftIssuanceStatus.Opened, transactionHash: txResult.hash })
            .where({ id: opening.id });
        })
        .catch(async (error: Error) => {
          logger.error('Can not open loot boxes', error);
          await this.getDefaultKnex()
            .update(<Partial<INftIssuance>>{ status: ENftIssuanceStatus.Error })
            .where({ id: opening.id });
        })
        .exec();
    } else {
      logger.debug('We run out of schedule to open loot boxes');
    }
  }

  public async getScheduling(
    pagination: IPagination = { offset: 0, limit: 20, order: [] },
    conditions?: IModelCondition<INftIssuance>[],
  ): Promise<IResponse<INftIssuance>> {
    return this.getListByCondition<INftIssuance>(this.attachConditions(this.basicQuery(), conditions), pagination);
  }

  // Perform batch buy based on recorded event
  public async batchBuy(): Promise<void> {
    const imDiscount = new ModelDiscount();
    const imPayment = new ModelPayment();
    const issuanceUuid = uuidV4();
    const payment = await imPayment.getPaymentEventDetail();
    // We will end the process if event is undefined
    if (typeof payment === 'undefined') {
      return;
    }

    await Transaction.getInstance()
      .process(async (tx: Knex.Transaction) => {
        const floatVal = BigNum.fromHexString(payment.value).div(BigNum.from(10).pow(payment.tokenDecimal)).toNumber();
        let numberOfLootBoxes = 0;
        let discount = 0;

        // Issue boxes for donors
        discount = await imDiscount.getDiscountByAddress(payment.sender);
        numberOfLootBoxes = calculateNumberOfLootBoxes(floatVal, discount);

        logger.info(`Processing ${floatVal} for: ${payment.sender} discount: ${discount * 100}%`);

        if (!Number.isFinite(floatVal) || floatVal < 0 || numberOfLootBoxes <= 0) {
          throw new Error(`Unexpected result, value: ${floatVal}, No boxes ${numberOfLootBoxes}`);
        }
        // Calculate distribution of loot boxes

        const lootBoxDistribution = calculateDistribution(numberOfLootBoxes);
        logger.info(
          `Total number of loot boxes: ${numberOfLootBoxes} (${lootBoxDistribution}) for: ${payment.sender} discount: ${
            discount * 100
          }%`,
        );
        const records = lootBoxDistribution.map((item) => {
          return <Partial<INftIssuance>>{
            phase: config.activeCampaignId,
            issuanceUuid,
            eventId: payment.id,
            totalBoxes: numberOfLootBoxes,
            owner: payment.sender,
            numberOfBox: item,
          };
        });
        for (let i = 0; i < records.length; i += 1) {
          await tx(this.tableName).insert(records[i]);
        }
        // Update status to succeed
        await tx(config.table.payment).update({ status: EPaymentStatus.Success }).where({ id: payment.id });
      })
      .catch(async (error: Error) => {
        logger.error('Can not perform batch buy', error);
        await this.getKnex()(config.table.payment).update({ status: EPaymentStatus.Error }).where({ id: payment.id });
      })
      .exec();
  }
}

export default ModelNftIssuance;