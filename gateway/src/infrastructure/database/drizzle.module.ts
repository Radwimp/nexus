import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';
import { config } from '../../config';

export const DRIZZLE = Symbol('DRIZZLE');
export type DrizzleDB = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: async () => {
        const cfg = config();
        const pool = new Pool({ connectionString: cfg.database.url });
        const db = drizzle(pool, { schema });
        return db;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule implements OnModuleInit {
  private readonly logger = new Logger(DrizzleModule.name);

  async onModuleInit() {
    this.logger.log('Database module initialized');
  }
}
