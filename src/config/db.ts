import { Pool, PoolConfig } from "pg";
import { env } from "./env";

/** Cloud Postgres (Supabase direct, pooler, Neon, etc.) needs TLS; pooler hostnames may omit "supabase.co". */
function sslConfig(connectionString: string): PoolConfig["ssl"] {
  const u = connectionString.toLowerCase();
  if (
    u.includes("localhost") ||
    u.includes("127.0.0.1") ||
    process.env.DB_SSL === "false"
  ) {
    return undefined;
  }
  if (
    u.includes("supabase.co") ||
    u.includes("pooler.supabase.com") ||
    u.includes("sslmode=require") ||
    u.includes("sslmode=verify-full") ||
    u.includes("sslmode=no-verify") ||
    process.env.DB_SSL === "true"
  ) {
    return { rejectUnauthorized: false };
  }
  // Default: assume managed DB when not clearly local (Render/Heroku/etc.)
  return { rejectUnauthorized: false };
}

export const db = new Pool({
  connectionString: env.databaseUrl,
  ssl: sslConfig(env.databaseUrl)
});

export async function checkDbConnection(): Promise<void> {
  await db.query("SELECT 1");
}
