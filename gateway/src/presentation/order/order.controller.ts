import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PlaceOrderHandler } from '../../application/order/commands/place-order.handler';
import { CancelOrderHandler } from '../../application/order/commands/cancel-order.handler';
import { GetOpenOrdersHandler } from '../../application/order/queries/get-open-orders.handler';
import { PlaceOrderDto } from './dto/place-order.dto';

@Controller('api/orders')
export class OrderController {
  constructor(
    private readonly placeOrderHandler: PlaceOrderHandler,
    private readonly cancelOrderHandler: CancelOrderHandler,
    private readonly getOpenOrdersHandler: GetOpenOrdersHandler,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async placeOrder(@Body() dto: PlaceOrderDto) {
    return this.placeOrderHandler.execute({
      userId: dto.userId,
      pair: dto.pair,
      side: dto.side,
      orderType: dto.orderType,
      price: dto.price,
      quantity: dto.quantity,
    });
  }

  @Delete(':id')
  async cancelOrder(
    @Param('id') orderId: string,
    @Query('userId') userId: string,
  ) {
    return this.cancelOrderHandler.execute({ orderId, userId });
  }

  @Get()
  async getOpenOrders(
    @Query('userId') userId: string,
    @Query('pair') pair?: string,
  ) {
    return this.getOpenOrdersHandler.execute({ userId, pair });
  }
}
