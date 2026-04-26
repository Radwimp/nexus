import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../../../infrastructure/database/drizzle.module';
import * as schema from '../../../infrastructure/database/schema';
import { OrderPublisher } from '../../../infrastructure/redis/order.publisher';
import { TRADING_PAIRS } from '../../../domain/market/entities/trading-pair.entity';

@Injectable()
export class PlaceOrderHandler {
  private readonly logger = new Logger(PlaceOrderHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly orderPublisher: OrderPublisher,
  ) {}

  async execute(params: {
    userId: string;
    pair: string;
    side: 'buy' | 'sell';
    orderType: 'limit' | 'market';
    price: string;
    quantity: string;
  }) {
    const tradingPair = TRADING_PAIRS.find(
      (p: { id: string }) => p.id === params.pair,
    );
    if (!tradingPair) {
      throw new BadRequestException(`Unknown trading pair: ${params.pair}`);
    }

    const price = new Decimal(params.price);
    const quantity = new Decimal(params.quantity);

    if (quantity.lte(0)) {
      throw new BadRequestException('Quantity must be positive');
    }
    if (params.orderType === 'limit' && price.lte(0)) {
      throw new BadRequestException('Price must be positive for limit orders');
    }

    const [base, quote] = params.pair.split('/');
    let lockCurrency: string;
    let lockAmount: Decimal;

    if (params.side === 'buy') {
      lockCurrency = quote;
      lockAmount = price.mul(quantity);
    } else {
      lockCurrency = base;
      lockAmount = quantity;
    }

    const orderId = uuidv4();

    // Transaction: atomic balance lock + order insert.
    // Using a single UPDATE with a WHERE available >= lockAmount guard prevents
    // the read-check-update race condition that could overdraw balances.
    await this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE balances
        SET available = available - ${lockAmount.toString()}::numeric,
            locked    = locked    + ${lockAmount.toString()}::numeric
        WHERE user_id  = ${params.userId}
          AND currency = ${lockCurrency}
          AND available >= ${lockAmount.toString()}::numeric
        RETURNING id
      `);

      if (!result.rows || result.rows.length === 0) {
        const check = await tx.execute(sql`
          SELECT available FROM balances
          WHERE user_id = ${params.userId} AND currency = ${lockCurrency}
          LIMIT 1
        `);
        if (!check.rows || check.rows.length === 0) {
          throw new BadRequestException(
            `No ${lockCurrency} balance. Deposit funds first.`,
          );
        }
        throw new BadRequestException(
          `Insufficient ${lockCurrency} balance: required=${lockAmount}`,
        );
      }

      await tx.insert(schema.orders).values({
        id: orderId,
        userId: params.userId,
        pair: params.pair,
        side: params.side,
        orderType: params.orderType,
        price: params.price,
        quantity: params.quantity,
        filled: '0',
        status: 'open',
      });
    });

    // Publish outside the transaction — Redis I/O must not hold a DB connection open
    await this.orderPublisher.publishOrder({
      id: orderId,
      user_id: params.userId,
      pair: params.pair,
      side: params.side,
      order_type: params.orderType,
      price: params.price,
      quantity: params.quantity,
    });

    this.logger.log(
      `Order placed: ${orderId} ${params.side} ${params.quantity} ${params.pair} @ ${params.price}`,
    );

    return {
      id: orderId,
      userId: params.userId,
      pair: params.pair,
      side: params.side,
      orderType: params.orderType,
      price: params.price,
      quantity: params.quantity,
      filled: '0',
      status: 'open',
    };
  }
}
