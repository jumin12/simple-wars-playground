'use strict';
const { Pool } = require('pg');

// Payment data must never fall back to Render's ephemeral filesystem.
class CommerceStore {
  constructor(connectionString, environment, testPool) {
    this.environment = environment;
    this.pool = testPool || new Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
    this.pool.on('error', () => console.warn('[commerce] database connection interrupted'));
  }
  async initialize() {
    await this.pool.query('CREATE SEQUENCE IF NOT EXISTS steam_commerce_order_seq MINVALUE 9007199254740993 START 9007199254740993');
    await this.pool.query(`CREATE TABLE IF NOT EXISTS steam_commerce_accounts (
      environment TEXT NOT NULL, steam_id TEXT NOT NULL, data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(environment, steam_id))`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS steam_commerce_reports (
      environment TEXT PRIMARY KEY, cursor TEXT NOT NULL)`);
  }
  async nextOrderId() {
    const result = await this.pool.query("SELECT nextval('steam_commerce_order_seq')::text AS id");
    return result.rows[0].id;
  }
  async transaction(steamId, operation) {
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      await connection.query(`INSERT INTO steam_commerce_accounts(environment,steam_id,data)
        VALUES($1,$2,'{}') ON CONFLICT DO NOTHING`, [this.environment, steamId]);
      const result = await connection.query(`SELECT data FROM steam_commerce_accounts
        WHERE environment=$1 AND steam_id=$2 FOR UPDATE`, [this.environment, steamId]);
      const data = result.rows[0].data;
      const value = await operation(data);
      await connection.query(`UPDATE steam_commerce_accounts SET data=$3,updated_at=NOW()
        WHERE environment=$1 AND steam_id=$2`, [this.environment, steamId, JSON.stringify(data)]);
      await connection.query('COMMIT');
      return value;
    } catch (error) {
      await connection.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { connection.release(); }
  }
  async getCursor() {
    const r = await this.pool.query('SELECT cursor FROM steam_commerce_reports WHERE environment=$1', [this.environment]);
    return r.rows[0]?.cursor || '2026-10-30T00:00:00Z';
  }
  async setCursor(cursor) {
    await this.pool.query(`INSERT INTO steam_commerce_reports(environment,cursor) VALUES($1,$2)
      ON CONFLICT(environment) DO UPDATE SET cursor=EXCLUDED.cursor`, [this.environment, cursor]);
  }
  async close() { await this.pool.end(); }
}
module.exports = { CommerceStore };
