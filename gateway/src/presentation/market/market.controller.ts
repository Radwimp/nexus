import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import {
  GetOrderBookHandler,
  GetRecentTradesHandler,
} from '../../application/market/queries/get-orderbook.handler';
import { TRADING_PAIRS } from '../../domain/market/entities/trading-pair.entity';

@Controller('api/markets')
export class MarketController {
  constructor(
    private readonly getOrderBookHandler: GetOrderBookHandler,
    private readonly getRecentTradesHandler: GetRecentTradesHandler,
  ) {}

  @Get()
  async getMarkets() {
    return TRADING_PAIRS;
  }

  @Get(':pair/orderbook')
  async getOrderBook(@Param('pair') pair: string) {
    // URL-decode: BTC%2FUSDT -> BTC/USDT
    const decodedPair = decodeURIComponent(pair);
    return this.getOrderBookHandler.execute(decodedPair);
  }

  @Get(':pair/trades')
  async getRecentTrades(
    @Param('pair') pair: string,
    @Query('limit') limit?: string,
  ) {
    const decodedPair = decodeURIComponent(pair);
    return this.getRecentTradesHandler.execute(
      decodedPair,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
