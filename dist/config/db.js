"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
const env_1 = require("./env");
/** Cloud Postgres (Supabase direct, pooler, Neon, etc.) needs TLS; pooler hostnames may omit "supabase.co". */
function sslConfig(connectionString) {
    const u = connectionString.toLowerCase();
    if (u.includes("localhost") ||
        u.includes("127.0.0.1") ||
        process.env.DB_SSL === "false") {
        return undefined;
    }
    if (u.includes("supabase.co") ||
        u.includes("pooler.supabase.com") ||
        u.includes("sslmode=require") ||
        u.includes("sslmode=verify-full") ||
        u.includes("sslmode=no-verify") ||
        process.env.DB_SSL === "true") {
        return { rejectUnauthorized: false };
    }
    // Default: assume managed DB when not clearly local (Render/Heroku/etc.)
    return { rejectUnauthorized: false };
}
exports.db = new pg_1.Pool({
    connectionString: env_1.env.databaseUrl,
    ssl: sslConfig(env_1.env.databaseUrl)
});
