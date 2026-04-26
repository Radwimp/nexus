import { Module } from '@nestjs/common';

// Infrastructure
import { DrizzleModule } from './infrastructure/database/drizzle.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { OrderPublisher } from './infrastructure/redis/order.publisher';
import { TradeConsumer } from './infrastructure/redis/trade.consumer';
import { MarketGateway } from './infrastructure/websocket/market.gateway';

// Application handlers
import { PlaceOrderHandler } from './application/order/commands/place-order.handler';
import { CancelOrderHandler } from './application/order/commands/cancel-order.handler';
import { GetOpenOrdersHandler } from './application/order/queries/get-open-orders.handler';
import {
  GetOrderBookHandler,
  GetRecentTradesHandler,
} from './application/market/queries/get-orderbook.handler';
import { SeedOrderBookHandler } from './application/market/commands/seed-orderbook.handler';

// Presentation
import { OrderController } from './presentation/order/order.controller';
import { MarketController } from './presentation/market/market.controller';
import { SeedController } from './presentation/seed/seed.controller';
import { AccountController } from './presentation/account/account.controller';

@Module({
  imports: [DrizzleModule, RedisModule],
  controllers: [
    OrderController,
    MarketController,
    SeedController,
    AccountController,
  ],
  providers: [
    // Infrastructure services
    OrderPublisher,
    TradeConsumer,
    MarketGateway,

    // Application handlers
    PlaceOrderHandler,
    CancelOrderHandler,
    GetOpenOrdersHandler,
    GetOrderBookHandler,
    GetRecentTradesHandler,
    SeedOrderBookHandler,
  ],
})
export class AppModule {}
