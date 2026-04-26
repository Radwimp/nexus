import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

const ORDERS_STREAM = 'orders:incoming';
const CANCEL_STREAM = 'orders:cancel';

export interface PlaceOrderPayload {
  id: string;
  user_id: string;
  pair: string;
  side: 'buy' | 'sell';
  order_type: 'limit' | 'market';
  price: string;
  quantity: string;
}

export interface CancelOrderPayload {
  order_id: string;
  pair: string;
}

@Injectable()
export class OrderPublisher {
  private readonly logger = new Logger(OrderPublisher.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publishOrder(payload: PlaceOrderPayload): Promise<string> {
    const data = JSON.stringify(payload);
    const id = await this.redis.xadd(ORDERS_STREAM, '*', 'data', data);
    this.logger.debug(`Published order ${payload.id} -> ${id}`);
    return id!;
  }

  async publishCancel(payload: CancelOrderPayload): Promise<string> {
    const data = JSON.stringify(payload);
    const id = await this.redis.xadd(CANCEL_STREAM, '*', 'data', data);
    this.logger.debug(`Published cancel ${payload.order_id} -> ${id}`);
    return id!;
  }
}
