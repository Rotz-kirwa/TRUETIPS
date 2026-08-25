import postgres from "postgres";
import bcrypt from "bcryptjs";

const dbUrl = process.env.DATABASE_URL || "postgres://postgres@127.0.0.1:5432/predictionlab";
console.log("Connecting to database:", dbUrl);
const sql = postgres(dbUrl);

async function main() {
  console.log("Initializing database tables...");

  // 1. Users
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  // 2. M-Pesa Payments
  await sql`
    CREATE TABLE IF NOT EXISTS mpesa_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL DEFAULT 'stk_push',
      status TEXT NOT NULL DEFAULT 'Pending',
      phone TEXT NOT NULL,
      payer_name TEXT,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
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
  `;

  // 3. SMS Automation Rules
  await sql`
    CREATE TABLE IF NOT EXISTS sms_automation_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL DEFAULT '',
      min_amount NUMERIC(12, 2) NOT NULL,
      max_amount NUMERIC(12, 2) NOT NULL,
      message_template TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  // 4. SMS Logs
  await sql`
    CREATE TABLE IF NOT EXISTS sms_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id UUID REFERENCES mpesa_payments(id) ON DELETE SET NULL,
      rule_id UUID REFERENCES sms_automation_rules(id) ON DELETE SET NULL,
      phone TEXT NOT NULL,
      amount NUMERIC(12, 2),
      message TEXT NOT NULL,
      provider_response JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  // 5. App Settings
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  // 6. Predictions
  await sql`
    CREATE TABLE IF NOT EXISTS predictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sport TEXT NOT NULL DEFAULT 'football',
      league TEXT NOT NULL DEFAULT '',
      match_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      team1 TEXT NOT NULL,
      team2 TEXT NOT NULL,
      prediction TEXT NOT NULL,
      odds NUMERIC(5, 2) NOT NULL DEFAULT 1.85,
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
  `;

  // 7. Jackpots
  await sql`
    CREATE TABLE IF NOT EXISTS jackpots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      jackpot_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT 'PREDICTIONLAB MEGA JACKPOT',
      total_odds NUMERIC(8, 2) NOT NULL DEFAULT 10.00,
      status TEXT NOT NULL DEFAULT 'OPEN',
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  // 8. Jackpot Matches
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
    );
  `;

  console.log("All tables created successfully!");

  // Seed Users
  const defaultPassHash = await bcrypt.hash("Joel@2030", 10);
  const devPassHash = await bcrypt.hash("matamu", 10);
  const adminUsers = [
    { email: "dev@gmail.com", hash: devPassHash },
    { email: "joelesabu2@gmail.com", hash: defaultPassHash },
    { email: "eliudkirwa451@gmail.com", hash: defaultPassHash },
    { email: "admin@predictionlab.com", hash: defaultPassHash },
  ];

  for (const user of adminUsers) {
    await sql`
      INSERT INTO users (email, password_hash, role)
      VALUES (${user.email}, ${user.hash}, 'admin')
      ON CONFLICT (email)
      DO UPDATE SET password_hash = ${user.hash}, role = 'admin';
    `;
    console.log(`Seeded user: ${user.email}`);
  }

  // Enable SMS automation setting
  await sql`
    INSERT INTO app_settings (key, value)
    VALUES ('sms_automation_enabled', 'true')
    ON CONFLICT (key) DO NOTHING;
  `;

  console.log("Database setup complete!");
  await sql.end();
}

main().catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});
