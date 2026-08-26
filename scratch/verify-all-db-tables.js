import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/paylix';
const sql = postgres(dbUrl);

async function main() {
  console.log("=================================================");
  console.log("🔍 CHECKING SYSTEM DATABASE TABLES AND SCHEMA");
  console.log("=================================================");

  // Create mpesa_callback_events if not exists
  await sql`
    CREATE TABLE IF NOT EXISTS mpesa_callback_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      route TEXT NOT NULL,
      method TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      source_ip TEXT,
      user_agent TEXT,
      content_type TEXT,
      trans_id TEXT,
      checkout_request_id TEXT,
      phone_masked TEXT,
      amount NUMERIC(12,2),
      shortcode TEXT,
      raw_headers JSONB,
      raw_body TEXT,
      parsed_body JSONB,
      parse_error TEXT,
      processing_result_code INTEGER,
      processing_result_desc TEXT,
      error_details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const tables = [
    "users",
    "mpesa_payments",
    "sms_automation_rules",
    "sms_logs",
    "app_settings",
    "predictions",
    "jackpots",
    "jackpot_matches",
    "mpesa_callback_events"
  ];

  for (const table of tables) {
    try {
      const [{ count }] = await sql`SELECT count(*)::int as count FROM ${sql(table)}`;
      console.log(`✓ Table '${table}' EXISTS (Count: ${count} rows)`);
    } catch (err) {
      console.error(`❌ Table '${table}' MISSING or Error: ${err.message}`);
    }
  }

  console.log("\n-------------------------------------------------");
  console.log("📋 MPESA_PAYMENTS COLUMNS CHECK:");
  const columns = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'mpesa_payments'
    ORDER BY ordinal_position
  `;
  for (const col of columns) {
    console.log(`   - ${col.column_name} (${col.data_type})`);
  }

  console.log("\n-------------------------------------------------");
  console.log("📋 SMS_AUTOMATION_RULES LIST:");
  const rules = await sql`SELECT id, name, min_amount, max_amount, is_active FROM sms_automation_rules ORDER BY min_amount`;
  for (const r of rules) {
    console.log(`   - [Rule] "${r.name}" | Range: ${r.min_amount} - ${r.max_amount} KES | Active: ${r.is_active}`);
  }

  console.log("\n-------------------------------------------------");
  console.log("🔑 ADMIN USER CHECK:");
  const admin = await sql`SELECT email, role, created_at FROM users WHERE email = 'sure10@gmail.com'`;
  console.log("   Admin:", admin[0] || "None found");

  process.exit(0);
}

main().catch(console.error);
