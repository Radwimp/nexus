import {
  pgTable,
  uuid,
  text,
  decimal,
  timestamp,
  pgEnum,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────

export const orderSideEnum = pgEnum('order_side', ['buy', 'sell']);
export const orderTypeEnum = pgEnum('order_type', ['limit', 'market']);
export const orderStatusEnum = pgEnum('order_status', [
  'open',
  'partial',
  'filled',
  'cancelled',
]);

// ─── Tables ───────────────────────────────────────────────────

export const balances = pgTable('balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  currency: text('currency').notNull(),
  available: decimal('available', { precision: 36, scale: 18 })
    .notNull()
    .default('0'),
  locked: decimal('locked', { precision: 36, scale: 18 })
    .notNull()
    .default('0'),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey(),
  userId: text('user_id').notNull(),
  pair: text('pair').notNull(),
  side: orderSideEnum('side').notNull(),
  orderType: orderTypeEnum('order_type').notNull(),
  price: decimal('price', { precision: 36, scale: 18 }).notNull(),
  quantity: decimal('quantity', { precision: 36, scale: 18 }).notNull(),
  filled: decimal('filled', { precision: 36, scale: 18 })
    .notNull()
    .default('0'),
  status: orderStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey(),
  pair: text('pair').notNull(),
  buyOrderId: uuid('buy_order_id').notNull(),
  sellOrderId: uuid('sell_order_id').notNull(),
  buyerId: text('buyer_id').notNull(),
  sellerId: text('seller_id').notNull(),
  price: decimal('price', { precision: 36, scale: 18 }).notNull(),
  quantity: decimal('quantity', { precision: 36, scale: 18 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const tradingPairs = pgTable('trading_pairs', {
  id: text('id').primaryKey(),
  base: text('base').notNull(),
  quote: text('quote').notNull(),
  pricePrecision: integer('price_precision').notNull(),
  quantityPrecision: integer('quantity_precision').notNull(),
  minQuantity: decimal('min_quantity', { precision: 36, scale: 18 }).notNull(),
  active: boolean('active').notNull().default(true),
});
