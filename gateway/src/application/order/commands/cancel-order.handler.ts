import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { sql, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../../../infrastructure/database/drizzle.module';
import * as schema from '../../../infrastructure/database/schema';
import { OrderPublisher } from '../../../infrastructure/redis/order.publisher';
import Decimal from 'decimal.js';

@Injectable()
export class CancelOrderHandler {
  private readonly logger = new Logger(CancelOrderHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly orderPublisher: OrderPublisher,
  ) {}

  async execute(params: { orderId: string; userId: string }) {
    let pair!: string;

    await this.db.transaction(async (tx) => {
      // Lock the order row to prevent concurrent cancellations of the same order
      const orderResult = await tx.execute(sql`
        SELECT id, user_id, pair, side, price, quantity, filled, status
        FROM orders
        WHERE id = ${params.orderId} AND user_id = ${params.userId}
        FOR UPDATE
      `);

      if (!orderResult.rows || orderResult.rows.length === 0) {
        throw new NotFoundException('Order not found');
      }

      const order = orderResult.rows[0] as {
        id: string;
        pair: string;
        side: string;
        price: string;
        quantity: string;
        filled: string;
        status: string;
      };

      if (order.status === 'filled' || order.status === 'cancelled') {
        throw new NotFoundException('Order already completed or cancelled');
      }

      pair = order.pair;
      const remaining = new Decimal(order.quantity ?? '0').minus(
        new Decimal(order.filled ?? '0'),
      );
      const [base, quoteCurrency] = order.pair.split('/');
      const unlockCurrency = order.side === 'buy' ? quoteCurrency : base;
      const unlockAmount =
        order.side === 'buy'
          ? new Decimal(order.price ?? '0').mul(remaining)
          : remaining;

      // Atomic unlock: GREATEST guards against going negative if data is inconsistent
      await tx.execute(sql`
        UPDATE balances
        SET available = available + ${unlockAmount.toString()}::numeric,
            locked    = GREATEST(locked - ${unlockAmount.toString()}::numeric, 0)
        WHERE user_id  = ${params.userId}
          AND currency = ${unlockCurrency}
      `);

      await tx
        .update(schema.orders)
        .set({ status: 'cancelled' })
        .where(eq(schema.orders.id, params.orderId));
    });

    // Publish outside the transaction
    await this.orderPublisher.publishCancel({
      order_id: params.orderId,
      pair,
    });

    this.logger.log(`Order cancelled: ${params.orderId}`);
    return { id: params.orderId, status: 'cancelled' };
  }
}
