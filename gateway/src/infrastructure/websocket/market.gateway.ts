import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { REDIS_SUBSCRIBER } from '../redis/redis.module';

@Injectable()
@WsGateway({
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000' },
  namespace: '/market',
})
export class MarketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MarketGateway.name);
  private subscribedPairs = new Set<string>();

  constructor(
    @Inject(REDIS_SUBSCRIBER) private readonly redisSub: Redis,
  ) {}

  async onModuleInit() {
    // Subscribe to orderbook updates for all pairs
    const pairs = ['BTC/USDT', 'ETH/USDT', 'ETH/BTC'];
    for (const pair of pairs) {
      const channel = `orderbook:updates:${pair}`;
      await this.redisSub.subscribe(channel);
      this.subscribedPairs.add(channel);
      this.logger.log(`Subscribed to ${channel}`);
    }

    this.redisSub.on('message', (channel: string, message: string) => {
      // channel = "orderbook:updates:BTC/USDT"
      const pair = channel.replace('orderbook:updates:', '');
      const room = `orderbook:${pair}`;
      try {
        const data = JSON.parse(message);
        this.server?.to(room).emit('orderbook', data);
      } catch (err) {
        this.logger.error(`Failed to parse orderbook update: ${err}`);
      }
    });
  }

  async onModuleDestroy() {
    for (const channel of this.subscribedPairs) {
      await this.redisSub.unsubscribe(channel);
    }
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { pair: string },
  ) {
    const room = `orderbook:${data.pair}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} subscribed to ${room}`);
    return { event: 'subscribed', data: { pair: data.pair } };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { pair: string },
  ) {
    const room = `orderbook:${data.pair}`;
    client.leave(room);
    this.logger.debug(`Client ${client.id} unsubscribed from ${room}`);
    return { event: 'unsubscribed', data: { pair: data.pair } };
  }

  // Called by TradeConsumer to broadcast trades
  broadcastTrade(
    pair: string,
    trade: { id: string; price: string; quantity: string; side?: string; timestamp: string },
  ) {
    const room = `orderbook:${pair}`;
    this.server?.to(room).emit('trade', trade);
  }
}
