import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('airdrop', (table: Knex.CreateTableBuilder) => {
    table.increments('id').unsigned().notNullable().primary();

    table.integer('blockchainId').unsigned().references('blockchain.id').comment('Foreign key to blockchain.id');

    table.integer('tokenId').unsigned().references('token.id').comment('Foreign key to token.id');

    table.string('owner', 42).notNullable().comment('Owner of NFT token');

    table.string('value', 66).notNullable().comment('Value of transaction');

    table.timestamp('createdDate').defaultTo(knex.fn.now()).index().comment('Created date');

    table.index(['blockchainId', 'tokenId', 'owner', 'value', 'createdDate'], 'indexed_fields');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('airdrop');
}
