import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { AppConfig, CONFIG } from '../config';
import * as schema from './schema';

export const DB = Symbol('DB');
export type Db = PgDatabase<any, typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [CONFIG],
      useFactory: (config: AppConfig): Db => {
        // Neon closes idle connections; without this handler an idle-client error would crash the process.
        const pool = new Pool({ connectionString: config.databaseUrl, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
        pool.on('error', (e) => console.error('Postgres pool error:', e.message));
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
