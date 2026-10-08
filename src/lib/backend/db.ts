import { Pool } from 'pg';

const globalDb = globalThis as unknown as { inventoryPool?: Pool };
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum dikonfigurasi');
  if (!globalDb.inventoryPool) globalDb.inventoryPool = new Pool({
    connectionString: process.env.DATABASE_URL, max: 8,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: 30000,
  });
  return globalDb.inventoryPool;
}
