import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from './infrastructure/database/schema';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://exchange:exchange_dev@localhost:5432/exchange';

async function migrate() {
  console.log('Running migrations...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  // Create enums
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE order_side AS ENUM ('buy', 'sell');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE order_type AS ENUM ('limit', 'market');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE order_status AS ENUM ('open', 'partial', 'filled', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS balances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      available DECIMAL(36, 18) NOT NULL DEFAULT '0',
      locked DECIMAL(36, 18) NOT NULL DEFAULT '0'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      pair TEXT NOT NULL,
      side order_side NOT NULL,
      order_type order_type NOT NULL,
      price DECIMAL(36, 18) NOT NULL,
      quantity DECIMAL(36, 18) NOT NULL,
      filled DECIMAL(36, 18) NOT NULL DEFAULT '0',
      status order_status NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trades (
      id UUID PRIMARY KEY,
      pair TEXT NOT NULL,
      buy_order_id UUID NOT NULL,
      sell_order_id UUID NOT NULL,
      buyer_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      price DECIMAL(36, 18) NOT NULL,
      quantity DECIMAL(36, 18) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trading_pairs (
      id TEXT PRIMARY KEY,
      base TEXT NOT NULL,
      quote TEXT NOT NULL,
      price_precision INTEGER NOT NULL,
      quantity_precision INTEGER NOT NULL,
      min_quantity DECIMAL(36, 18) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true
    );
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_pair_status ON orders(pair, status);
    CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades(pair, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_balances_user ON balances(user_id);
  `);

  // Seed trading pairs
  await pool.query(`
    INSERT INTO trading_pairs (id, base, quote, price_precision, quantity_precision, min_quantity, active)
    VALUES
      ('BTC/USDT', 'BTC', 'USDT', 2, 6, 0.000001, true),
      ('ETH/USDT', 'ETH', 'USDT', 2, 5, 0.00001, true),
      ('ETH/BTC', 'ETH', 'BTC', 6, 4, 0.0001, true)
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log('Migrations complete!');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
