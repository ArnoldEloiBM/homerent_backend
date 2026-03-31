-- Drop unique on user name (email remains unique)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_name_key";

-- Paid tracking on payments
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Prevent duplicate rentals for same tenant/property/start
CREATE UNIQUE INDEX IF NOT EXISTS "rentals_tenant_property_start_unique" ON "rentals"("tenant_id", "property_id", "start_date");

-- Chat: faster lookups by sender
CREATE INDEX IF NOT EXISTS "idx_messages_sender_id" ON "messages"("sender_id");
