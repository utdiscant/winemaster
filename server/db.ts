import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Enable SSL only when the database actually requires it — driven by the
// connection string (sslmode=require) or PGSSL=true. Fly's internal Postgres
// network does not use SSL, whereas hosted providers like Neon do. (Previously
// SSL was forced whenever NODE_ENV=production, which breaks Fly's internal DB.)
const requiresSsl =
  process.env.PGSSL === 'true' ||
  /[?&]sslmode=require/i.test(process.env.DATABASE_URL ?? '');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
