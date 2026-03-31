import { db } from "../config/db";
import { hashPassword } from "../utils/security";

/**
 * Prisma (and some older DBs) use a PostgreSQL enum `RentalStatus` with only active|cancelled.
 * The API inserts rentals with status `pending`, which fails until the enum includes pending|rejected.
 */
async function ensureRentalStatusEnumValues(): Promise<void> {
  const typ = await db.query<{ oid: number }>(`SELECT oid FROM pg_type WHERE typname = 'RentalStatus'`);
  if (!typ.rowCount) return;

  const oid = typ.rows[0].oid;
  for (const label of ["pending", "rejected"]) {
    const exists = await db.query(
      `SELECT 1 FROM pg_enum WHERE enumtypid = $1 AND enumlabel = $2`,
      [oid, label]
    );
    if (exists.rowCount) continue;
    try {
      await db.query(`ALTER TYPE "RentalStatus" ADD VALUE '${label}'`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== "42710") throw err;
    }
  }
}

async function main(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('tenant','landlord','admin')),
      is_verified BOOLEAN NOT NULL DEFAULT false,
      is_suspended BOOLEAN NOT NULL DEFAULT false,
      profile_image_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS landlord_applications (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) NOT NULL UNIQUE,
      phone VARCHAR(40) NOT NULL,
      id_card_image TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES users(id),
      title VARCHAR(180) NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      location VARCHAR(255) NOT NULL,
      bedrooms INTEGER NOT NULL,
      bathrooms INTEGER NOT NULL,
      area VARCHAR(120),
      description TEXT,
      image_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rentals (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES users(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      total_amount NUMERIC(12,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      rental_id INTEGER NOT NULL REFERENCES rentals(id),
      amount NUMERIC(12,2) NOT NULL,
      paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      proof_image_url TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES users(id),
      landlord_id INTEGER NOT NULL REFERENCES users(id),
      property_id INTEGER REFERENCES properties(id),
      admin_landlord BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT,
      image_url TEXT,
      video_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code VARCHAR(6) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_properties_landlord_id ON properties(landlord_id);
    CREATE INDEX IF NOT EXISTS idx_rentals_tenant_id ON rentals(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_rentals_property_id ON rentals(property_id);
    CREATE INDEX IF NOT EXISTS idx_payments_rental_id ON payments(rental_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);

    CREATE TABLE IF NOT EXISTS conversation_reads (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, conversation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_reads_user_id ON conversation_reads(user_id);
  `);

  await db.query(`
    ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_status_check;
    ALTER TABLE rentals ADD CONSTRAINT rentals_status_check
      CHECK (status IN ('pending','active','cancelled','rejected'));
  `);

  await ensureRentalStatusEnumValues();

    await db.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_name_key;
    `);
    await db.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
    `);
    await db.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_url TEXT;
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS conversation_reads (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, conversation_id)
      );
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_reads_user_id ON conversation_reads(user_id);
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS rentals_tenant_property_start_unique
      ON rentals (tenant_id, property_id, start_date);
    `);
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
  `);
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
  `);

  const existing = await db.query("SELECT id FROM users WHERE email = $1", ["eloibuyange@gmail.com"]);
  if (!existing.rowCount) {
    const password = await hashPassword("Admin@123");
    await db.query(
      "INSERT INTO users (name, email, password, role, is_verified) VALUES ($1,$2,$3,'admin', true)",
      ["Arnold Buyange", "eloibuyange@gmail.com", password]
    );
  }

  console.log("Database initialized successfully.");
  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end();
  process.exit(1);
});
