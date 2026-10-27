import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL to your Neon connection string first.');
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  const { rows } = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  await pool.end();
  console.log(`Migrations applied on ${new URL(url).hostname}. Tables: ${rows.map((r) => r.table_name).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
