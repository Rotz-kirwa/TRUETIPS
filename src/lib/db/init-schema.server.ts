import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "./client";

let dbInitialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureDatabaseTablesAndSeed() {
  if (dbInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
    // 1. Create all required tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

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
      );

      CREATE TABLE IF NOT EXISTS sms_automation_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL DEFAULT '',
        min_amount NUMERIC(12,2) NOT NULL,
        max_amount NUMERIC(12,2) NOT NULL,
        message_template TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

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
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

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
      );

      CREATE TABLE IF NOT EXISTS jackpots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        jackpot_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL DEFAULT 'PREDICTIONLAB MEGA JACKPOT',
        total_odds NUMERIC(8,2) NOT NULL DEFAULT 10.00,
        status TEXT NOT NULL DEFAULT 'OPEN',
        is_published BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

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
      );

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
      );

      ALTER TABLE mpesa_callback_events ADD COLUMN IF NOT EXISTS payload JSONB;
      ALTER TABLE mpesa_callback_events ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'received';
      ALTER TABLE mpesa_callback_events ADD COLUMN IF NOT EXISTS error_message TEXT;
      ALTER TABLE mpesa_callback_events ADD COLUMN IF NOT EXISTS result_code INTEGER;
      ALTER TABLE mpesa_callback_events ADD COLUMN IF NOT EXISTS result_desc TEXT;
      ALTER TABLE mpesa_callback_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_created_at ON mpesa_callback_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_trans_id ON mpesa_callback_events(trans_id);
    `);

    // 2. Ensure default admin user sure10@gmail.com exists with password 'Sure10-78'
    const adminEmail = "sure10@gmail.com";
    const passwordHash = await hash("Sure10-78", 10);

    await db.execute(sql`
      INSERT INTO users (email, password_hash, role)
      VALUES (${adminEmail}, ${passwordHash}, 'admin')
      ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, role = 'admin';
    `);

    // 3. Ensure default SMS automation rules exist if empty
    const rulesCount = await db.execute(sql`SELECT COUNT(*)::int as count FROM sms_automation_rules`);
    const count = Number((rulesCount[0] as { count: number })?.count ?? 0);

    if (count === 0) {
      await db.execute(sql`
        INSERT INTO sms_automation_rules (name, min_amount, max_amount, message_template, is_active)
        VALUES
          ('Daily Matches ⚽', 100, 100, 'DAILY MATCHES ⚽\n\n🏆 Play Smart, Win Big', true),
          ('Jackpot Matches 🏆', 20, 20, 'JACKPOT MATCHES 🏆\n\n🏆 Play Smart, Win Big', true),
          ('Basket Matches 🏀', 40, 40, 'BASKET MATCHES 🏀\n\n🏆 Play Smart, Win Big', true),
          ('Weekly Subscription 📅', 500, 500, 'WEEKLY SUBSCRIPTION 📅\nUnlimited access to premium PredictionLab predictions.\nValid for 7 Days.\n🏆 Play Smart, Win Big', true),
          ('Monthly Subscription 📆', 1500, 1500, 'MONTHLY SUBSCRIPTION 📆\nComplete access to PredictionLab premium predictions.\nValid for 30 Days.\n🏆 Play Smart, Win Big', true);
      `);
    }

    dbInitialized = true;
    console.log("[db-init] Database tables & admin user initialized successfully.");
  } catch (err) {
    console.error("[db-init] Error initializing database tables:", err);
  } finally {
    initPromise = null;
  }
})();
return initPromise;
}
