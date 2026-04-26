import { Controller, Get, Query, Inject } from '@nestjs/common';
import { DRIZZLE, DrizzleDB } from '../../infrastructure/database/drizzle.module';
import * as schema from '../../infrastructure/database/schema';
import { eq } from 'drizzle-orm';

@Controller('api/account')
export class AccountController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Get('balances')
  async getBalances(@Query('userId') userId: string) {
    const balances = await this.db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.userId, userId));

    return balances.map((b) => ({
      currency: b.currency,
      available: b.available,
      locked: b.locked,
    }));
  }
}
