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
      useFactory: (config: AppConfig): Db => drizzle(new Pool({ connectionString: config.databaseUrl, max: 5 }), { schema }),
    },
  ],
  exports: [DB],
})
export class DbModule {}
