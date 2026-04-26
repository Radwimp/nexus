import { Injectable, Inject, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { DRIZZLE, DrizzleDB } from '../../../infrastructure/database/drizzle.module';
import { OrderPublisher } from '../../../infrastructure/redis/order.publisher';
import * as schema from '../../../infrastructure/database/schema';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class SeedOrderBookHandler {
  private readonly logger = new Logger(SeedOrderBookHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly orderPublisher: OrderPublisher,
  ) {}

  async execute(pair: string) {
    const [base, quote] = pair.split('/');

    const basePrices: Record<string, number> = {
      'BTC/USDT': 67500,
      'ETH/USDT': 3450,
      'ETH/BTC': 0.051,
    };

    const basePrice = basePrices[pair];
    if (!basePrice) {
      throw new Error(`Unknown pair: ${pair}`);
    }

    const seedUserId = 'seed-market-maker';

    await this.ensureBalance(seedUserId, base, '1000000');
    await this.ensureBalance(seedUserId, quote, '1000000000');

    const orders: Array<{
      side: 'buy' | 'sell';
      price: string;
      quantity: string;
    }> = [];

    for (let i = 1; i <= 20; i++) {
      const spread = basePrice * 0.001 * i;
      const pricePrecision = pair === 'ETH/BTC' ? 6 : 2;
      const bidPrice = new Decimal(basePrice).minus(spread).toFixed(pricePrecision);
      const askPrice = new Decimal(basePrice).plus(spread).toFixed(pricePrecision);
      const qty = new Decimal(Math.random() * 2 + 0.1).toFixed(6);

      orders.push({ side: 'buy', price: bidPrice, quantity: qty });
      orders.push({ side: 'sell', price: askPrice, quantity: qty });
    }

    let count = 0;
    for (const o of orders) {
      const orderId = uuidv4();

      const lockCurrency = o.side === 'buy' ? quote : base;
      const lockAmount =
        o.side === 'buy'
          ? new Decimal(o.price).mul(new Decimal(o.quantity))
          : new Decimal(o.quantity);

      const balRows = await this.db
        .select()
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.userId, seedUserId),
            eq(schema.balances.currency, lockCurrency),
          ),
        )
        .limit(1);

      if (balRows.length > 0) {
        const bal = balRows[0];
        await this.db
          .update(schema.balances)
          .set({
            available: new Decimal(bal.available ?? '0')
              .minus(lockAmount)
              .toString(),
            locked: new Decimal(bal.locked ?? '0')
              .plus(lockAmount)
              .toString(),
          })
          .where(eq(schema.balances.id, bal.id));
      }

      await this.db.insert(schema.orders).values({
        id: orderId,
        userId: seedUserId,
        pair,
        side: o.side,
        orderType: 'limit',
        price: o.price,
        quantity: o.quantity,
        filled: '0',
        status: 'open',
      });

      await this.orderPublisher.publishOrder({
        id: orderId,
        user_id: seedUserId,
        pair,
        side: o.side,
        order_type: 'limit',
        price: o.price,
        quantity: o.quantity,
      });

      count++;
    }

    this.logger.log(`Seeded ${count} orders for ${pair}`);
    return { pair, ordersCreated: count };
  }

  private async ensureBalance(
    userId: string,
    currency: string,
    amount: string,
  ) {
    const existing = await this.db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.userId, userId),
          eq(schema.balances.currency, currency),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(schema.balances).values({
        userId,
        currency,
        available: amount,
        locked: '0',
      });
    }
  }
}
