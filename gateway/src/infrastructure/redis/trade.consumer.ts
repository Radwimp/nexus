import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { sql, eq } from 'drizzle-orm';
import { REDIS_CLIENT } from './redis.module';
import { DRIZZLE } from '../database/drizzle.module';
import type { DrizzleDB } from '../database/drizzle.module';
import * as schema from '../database/schema';
import { MarketGateway } from '../websocket/market.gateway';
import Decimal from 'decimal.js';

const TRADES_STREAM = 'trades:executed';
const ORDER_STATUS_STREAM = 'orders:status';
const CONSUMER_GROUP = 'gateway';
const CONSUMER_NAME = 'gateway-0';

interface TradePayload {
  id: string;
  pair: string;
  buy_order_id: string;
  sell_order_id: string;
  buyer_id: string;
  seller_id: string;
  price: string;
  quantity: string;
  timestamp: string;
}

interface OrderStatusPayload {
  order_id: string;
  status: 'open' | 'partial' | 'filled' | 'cancelled' | 'rejected';
  filled: string;
  remaining: string;
}

@Injectable()
export class TradeConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradeConsumer.name);
  private running = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly marketGateway: MarketGateway,
  ) {}

  async onModuleInit() {
    await this.ensureConsumerGroups();
    this.running = true;
    this.consumeLoop();
  }

  onModuleDestroy() {
    this.running = false;
  }

  private async ensureConsumerGroups() {
    for (const stream of [TRADES_STREAM, ORDER_STATUS_STREAM]) {
      try {
        await this.redis.xgroup('CREATE', stream, CONSUMER_GROUP, '$', 'MKSTREAM');
        this.logger.log(`Created consumer group for ${stream}`);
      } catch (err: unknown) {
        if (err instanceof Error && err.message?.includes('BUSYGROUP')) {
          this.logger.log(`Consumer group already exists for ${stream}`);
        } else {
          throw err;
        }
      }
    }
  }

  private async consumeLoop() {
    this.logger.log('Trade consumer loop started');

    while (this.running) {
      try {
        const results = await this.redis.xreadgroup(
          'GROUP',
          CONSUMER_GROUP,
          CONSUMER_NAME,
          'COUNT',
          '100',
          'BLOCK',
          '1000',
          'STREAMS',
          TRADES_STREAM,
          ORDER_STATUS_STREAM,
          '>',
          '>',
        ) as [string, [string, string[]][]][] | null;

        if (!results) continue;

        for (const [streamName, messages] of results) {
          for (const [msgId, fields] of messages) {
            const dataIdx = fields.indexOf('data');
            if (dataIdx === -1) continue;
            const data = fields[dataIdx + 1];

            try {
              if (streamName === TRADES_STREAM) {
                await this.handleTrade(JSON.parse(data) as TradePayload);
              } else if (streamName === ORDER_STATUS_STREAM) {
                await this.handleOrderStatus(JSON.parse(data) as OrderStatusPayload);
              }
            } catch (err) {
              this.logger.error(`Failed to process message ${msgId}`, err);
            }

            await this.redis.xack(streamName, CONSUMER_GROUP, msgId);
          }
        }
      } catch (err) {
        this.logger.error('Consumer loop error', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async handleTrade(trade: TradePayload) {
    this.logger.log(`Trade: ${trade.pair} ${trade.quantity}@${trade.price}`);

    const [baseCurrency, quoteCurrency] = trade.pair.split('/');
    const qty = new Decimal(trade.quantity);
    const total = qty.mul(new Decimal(trade.price));

    // All balance mutations for a single trade must be atomic
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.trades).values({
        id: trade.id,
        pair: trade.pair,
        buyOrderId: trade.buy_order_id,
        sellOrderId: trade.sell_order_id,
        buyerId: trade.buyer_id,
        sellerId: trade.seller_id,
        price: trade.price,
        quantity: trade.quantity,
      });

      // Buyer: deduct locked quote (money spent)
      await this.updateBalanceInTx(tx, trade.buyer_id, quoteCurrency, (b) => {
        b.locked = new Decimal(b.locked).minus(total).toString();
      });
      // Buyer: credit available base (coins received)
      await this.updateBalanceInTx(tx, trade.buyer_id, baseCurrency, (b) => {
        b.available = new Decimal(b.available).plus(qty).toString();
      });
      // Seller: deduct locked base (coins sold)
      await this.updateBalanceInTx(tx, trade.seller_id, baseCurrency, (b) => {
        b.locked = new Decimal(b.locked).minus(qty).toString();
      });
      // Seller: credit available quote (money received)
      await this.updateBalanceInTx(tx, trade.seller_id, quoteCurrency, (b) => {
        b.available = new Decimal(b.available).plus(total).toString();
      });
    });

    this.marketGateway.broadcastTrade(trade.pair, {
      id: trade.id,
      price: trade.price,
      quantity: trade.quantity,
      timestamp: trade.timestamp,
    });
  }

  private async handleOrderStatus(status: OrderStatusPayload) {
    this.logger.debug(`Order status: ${status.order_id} -> ${status.status}`);

    // Rejected orders were never inserted into the DB; nothing to update
    if (status.status === 'rejected') return;

    await this.db
      .update(schema.orders)
      .set({
        status: status.status as 'open' | 'partial' | 'filled' | 'cancelled',
        filled: status.filled,
      })
      .where(eq(schema.orders.id, status.order_id));
  }

  // Runs inside a transaction; uses SELECT FOR UPDATE to prevent lost updates
  private async updateBalanceInTx(
    tx: DrizzleDB,
    userId: string,
    currency: string,
    updater: (b: { available: string; locked: string }) => void,
  ) {
    const result = await tx.execute(sql`
      SELECT id, available, locked
      FROM balances
      WHERE user_id = ${userId} AND currency = ${currency}
      LIMIT 1
      FOR UPDATE
    `);

    if (!result.rows || result.rows.length === 0) {
      const b = { available: '0', locked: '0' };
      updater(b);
      await tx.insert(schema.balances).values({
        userId,
        currency,
        available: new Decimal(b.available).gte(0) ? b.available : '0',
        locked: new Decimal(b.locked).gte(0) ? b.locked : '0',
      });
    } else {
      const row = result.rows[0] as { id: string; available: string; locked: string };
      const b = {
        available: row.available ?? '0',
        locked: row.locked ?? '0',
      };
      updater(b);
      // GREATEST guards against negative values caused by rounding or data inconsistency
      await tx.execute(sql`
        UPDATE balances
        SET available = GREATEST(${b.available}::numeric, 0),
            locked    = GREATEST(${b.locked}::numeric, 0)
        WHERE id = ${row.id}
      `);
    }
  }
}
