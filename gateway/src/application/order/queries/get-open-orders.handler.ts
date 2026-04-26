import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE, DrizzleDB } from '../../../infrastructure/database/drizzle.module';
import * as schema from '../../../infrastructure/database/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';

@Injectable()
export class GetOpenOrdersHandler {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute(params: { userId: string; pair?: string }) {
    const conditions = [
      eq(schema.orders.userId, params.userId),
      inArray(schema.orders.status, ['open', 'partial']),
    ];
    if (params.pair) {
      conditions.push(eq(schema.orders.pair, params.pair));
    }

    return this.db
      .select()
      .from(schema.orders)
      .where(and(...conditions))
      .orderBy(desc(schema.orders.createdAt))
      .limit(100);
  }
}
