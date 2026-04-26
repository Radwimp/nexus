import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Inject,
} from '@nestjs/common';
import { SeedOrderBookHandler } from '../../application/market/commands/seed-orderbook.handler';
import { DRIZZLE, DrizzleDB } from '../../infrastructure/database/drizzle.module';
import * as schema from '../../infrastructure/database/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

@Controller('api/seed')
export class SeedController {
  constructor(
    private readonly seedOrderBookHandler: SeedOrderBookHandler,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  @Post('orderbook/:pair')
  async seedOrderBook(@Param('pair') pair: string) {
    const decodedPair = decodeURIComponent(pair);
    return this.seedOrderBookHandler.execute(decodedPair);
  }

  @Post('balance')
  async seedBalance(
    @Body() body: { userId: string; currency: string; amount: string },
  ) {
    const existing = await this.db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.userId, body.userId),
          eq(schema.balances.currency, body.currency),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(schema.balances)
        .set({ available: body.amount })
        .where(eq(schema.balances.id, existing[0].id));
    } else {
      await this.db.insert(schema.balances).values({
        userId: body.userId,
        currency: body.currency,
        available: body.amount,
        locked: '0',
      });
    }

    return { userId: body.userId, currency: body.currency, amount: body.amount };
  }
}
