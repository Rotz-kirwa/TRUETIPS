/**
 * init-missing-tables.js
 * Creates any tables missing from the local paylix DB using the app's own
 * DATABASE_URL from .env, then runs the full local-production test.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env
const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!process.env[key]) process.env[key] = val;
}

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/paylix";
console.log(`\n🔌 Connecting to: ${DATABASE_URL.replace(/:\/\/[^@]+@/, "://<creds>@")}`);

// Use postgres.js directly (same as the app)
const { default: postgres } = await import("postgres");

const sql = postgres(DATABASE_URL, {
  max: 1,
  ssl: false,
  connect_timeout: 10,
  idle_timeout: 5,
});

async function run() {
  console.log("\n📦 Ensuring all required tables exist...\n");

  // Create all tables the app needs
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  ✅ users");

  await sql`
    CREATE TABLE IF NOT EXISTS mpesa_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL DEFAULT 'stk_push',
      status TEXT NOT NULL DEFAULT 'Pending',
      phone TEXT NOT NULL,
      payer_name TEXT,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      business_shortcode TEXT,
      till_number TEXT,
      merchant_request_id TEXT,
      checkout_request_id TEXT UNIQUE,
      mpesa_receipt_number TEXT UNIQUE,
      result_code INTEGER,
      result_desc TEXT,
      account_reference TEXT,
      transaction_desc TEXT,
      raw_request_json JSONB,
      raw_callback_json JSONB,
      initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    )
  `;
  console.log("  ✅ mpesa_payments");

  await sql`
    CREATE TABLE IF NOT EXISTS sms_automation_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL DEFAULT '',
      min_amount NUMERIC(12,2) NOT NULL,
      max_amount NUMERIC(12,2) NOT NULL,
      message_template TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  ✅ sms_automation_rules");

  await sql`
    CREATE TABLE IF NOT EXISTS sms_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id UUID REFERENCES mpesa_payments(id) ON DELETE SET NULL,
      rule_id UUID REFERENCES sms_automation_rules(id) ON DELETE SET NULL,
      phone TEXT NOT NULL,
      amount NUMERIC(12,2),
      message TEXT NOT NULL,
      provider_response JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  ✅ sms_logs");

  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  ✅ app_settings");

  await sql`
    CREATE TABLE IF NOT EXISTS predictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sport TEXT NOT NULL DEFAULT 'football',
      league TEXT NOT NULL DEFAULT '',
      match_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      team1 TEXT NOT NULL,
      team2 TEXT NOT NULL,
      prediction TEXT NOT NULL,
      odds NUMERIC(5,2) NOT NULL DEFAULT 1.85,
      prediction_type TEXT NOT NULL DEFAULT 'Gold',
      confidence INTEGER NOT NULL DEFAULT 85,
      score1 INTEGER,
      score2 INTEGER,
      actual_result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  ✅ predictions");

  await sql`
    CREATE TABLE IF NOT EXISTS jackpots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      jackpot_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT 'PREDICTIONLAB MEGA JACKPOT',
      total_odds NUMERIC(8,2) NOT NULL DEFAULT 10.00,
      status TEXT NOT NULL DEFAULT 'OPEN',
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  ✅ jackpots");

  await sql`
    CREATE TABLE IF NOT EXISTS jackpot_matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      jackpot_id UUID REFERENCES jackpots(id) ON DELETE CASCADE,
      match_order INTEGER NOT NULL DEFAULT 1,
      team1 TEXT NOT NULL,
      team2 TEXT NOT NULL,
      prediction TEXT NOT NULL,
      score1 INTEGER,
      score2 INTEGER,
      status TEXT NOT NULL DEFAULT 'pending'
    )
  `;
  console.log("  ✅ jackpot_matches");

  await sql`
    CREATE TABLE IF NOT EXISTS mpesa_callback_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      route TEXT NOT NULL,
      method TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source_ip TEXT,
      user_agent TEXT,
      content_type TEXT,
      trans_id TEXT,
      checkout_request_id TEXT,
      phone_masked TEXT,
      amount NUMERIC(12,2),
      shortcode TEXT,
      payload JSONB,
      raw_body TEXT,
      result_code INTEGER,
      result_desc TEXT,
      processing_status TEXT NOT NULL DEFAULT 'received',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_created_at ON mpesa_callback_events(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_trans_id ON mpesa_callback_events(trans_id)`;
  console.log("  ✅ mpesa_callback_events (+ indexes)");

  // Ensure admin user exists
  const { default: bcrypt } = await import("bcryptjs");
  const passwordHash = await bcrypt.hash("Sure10-78", 10);
  await sql`
    INSERT INTO users (email, password_hash, role)
    VALUES ('sure10@gmail.com', ${passwordHash}, 'admin')
    ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, role = 'admin'
  `;
  console.log("  ✅ admin user: sure10@gmail.com / Sure10-78");

  // Seed SMS rules if empty
  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM sms_automation_rules`;
  if (Number(count) === 0) {
    await sql`
      INSERT INTO sms_automation_rules (name, min_amount, max_amount, message_template, is_active)
      VALUES
        ('Daily Matches ⚽', 50, 50, 'DAILY MATCHES ⚽\n\n🏆 Play Smart, Win Big', true),
        ('Jackpot Matches 🏆', 100, 100, 'JACKPOT MATCHES 🏆\n\n🏆 Play Smart, Win Big', true),
        ('Basket Matches 🏀', 50, 50, 'BASKET MATCHES 🏀\n\n🏆 Play Smart, Win Big', true),
        ('Weekly Subscription 📅', 500, 500, 'WEEKLY SUBSCRIPTION 📅\nUnlimited access to premium predictions.\nValid for 7 Days.\n🏆 Play Smart, Win Big', true),
        ('Monthly Subscription 📆', 1500, 1500, 'MONTHLY SUBSCRIPTION 📆\nComplete access to premium predictions.\nValid for 30 Days.\n🏆 Play Smart, Win Big', true)
    `;
    console.log("  ✅ Default SMS rules seeded (5 tiers)");
  } else {
    console.log(`  ℹ️  SMS rules already exist (${count} rules)`);
  }

  // Final table count
  const tables = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  `;
  console.log(`\n📊 Tables in local DB (${tables.length} total):`);
  tables.forEach(t => console.log(`   • ${t.tablename}`));

  await sql.end();
  console.log("\n✅ Local database fully initialised!\n");
}

run().catch(err => {
  console.error("\n❌ DB init failed:", err.message);
  process.exit(1);
});
