export const config = () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  database: {
    url:
      process.env.DATABASE_URL ||
      'postgres://exchange:exchange_dev@localhost:5432/exchange',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
});

export type AppConfig = ReturnType<typeof config>;
