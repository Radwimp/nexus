import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';
import { DRIZZLE, DrizzleDB } from '../../../infrastructure/database/drizzle.module';
import * as schema from '../../../infrastructure/database/schema';
import { eq, desc } from 'drizzle-orm';

@Injectable()
export class GetOrderBookHandler {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async execute(pair: string) {
    const key = `orderbook:${pair}`;
    const data = await this.redis.get(key);
    if (!data) {
      return { pair, bids: [], asks: [], timestamp: new Date().toISOString() };
    }
    return JSON.parse(data);
  }
}

@Injectable()
export class GetRecentTradesHandler {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute(pair: string, limit = 50) {
    return this.db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.pair, pair))
      .orderBy(desc(schema.trades.createdAt))
      .limit(limit);
  }
}
