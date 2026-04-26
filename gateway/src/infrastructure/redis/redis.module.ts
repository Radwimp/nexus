import { Module, Global, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../../config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_SUBSCRIBER = Symbol('REDIS_SUBSCRIBER');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const cfg = config();
        const logger = new Logger('RedisClient');
        const client = new Redis({
          host: cfg.redis.host,
          port: cfg.redis.port,
          maxRetriesPerRequest: null,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        });
        client.on('connect', () => logger.log('Redis client connected'));
        client.on('error', (err) => logger.error('Redis client error', err));
        return client;
      },
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: () => {
        const cfg = config();
        const logger = new Logger('RedisSubscriber');
        const client = new Redis({
          host: cfg.redis.host,
          port: cfg.redis.port,
          maxRetriesPerRequest: null,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        });
        client.on('connect', () => logger.log('Redis subscriber connected'));
        client.on('error', (err) =>
          logger.error('Redis subscriber error', err),
        );
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule {}
