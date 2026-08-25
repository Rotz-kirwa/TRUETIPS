import postgres from "postgres";
import bcrypt from "bcryptjs";

const dbUrl = "postgresql://sure_10_user:K7zAvCJ7eoxJ5OeOgtpnbqrBX95VZGXZ@dpg-da6vlf61egvs73esj6r0-a.oregon-postgres.render.com/sure_10";
const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

async function seedRemote() {
  try {
    console.log("=================================================");
    console.log("🚀 INITIALIZING REMOTE RENDER POSTGRESQL DATABASE");
    console.log("=================================================");

    // 1. Create all tables
    await sql.unsafe(`
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
    `);

    console.log("✓ All database tables created successfully!");

    // 2. Insert admin user dev@gmail.com with password 'matamu'
    const passwordHash = await bcrypt.hash("matamu", 10);
    await sql`
      INSERT INTO users (email, password_hash, role)
      VALUES ('dev@gmail.com', ${passwordHash}, 'admin')
      ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, role = 'admin';
    `;
    console.log("✓ Admin user dev@gmail.com with password 'matamu' created/updated!");

    // 3. Insert default package SMS automation rules
    await sql`DELETE FROM sms_automation_rules;`;
    await sql`
      INSERT INTO sms_automation_rules (name, min_amount, max_amount, message_template, is_active)
      VALUES
        ('Daily Matches ⚽', 50, 50, 'DAILY MATCHES ⚽\n\n🏆 Play Smart, Win Big', true),
        ('Jackpot Matches 🏆', 100, 100, 'JACKPOT MATCHES 🏆\n\n🏆 Play Smart, Win Big', true),
        ('Basket Matches 🏀', 50, 50, 'BASKET MATCHES 🏀\n\n🏆 Play Smart, Win Big', true),
        ('Weekly Subscription 📅', 500, 500, 'WEEKLY SUBSCRIPTION 📅\nUnlimited access to premium PredictionLab predictions.\nValid for 7 Days.\n🏆 Play Smart, Win Big', true),
        ('Monthly Subscription 📆', 1500, 1500, 'MONTHLY SUBSCRIPTION 📆\nComplete access to PredictionLab premium predictions.\nValid for 30 Days.\n🏆 Play Smart, Win Big', true);
    `;
    console.log("✓ SMS automation rules seeded successfully!");

    // 4. Verify users table
    const usersList = await sql`SELECT id, email, role, created_at FROM users;`;
    console.log("-------------------------------------------------");
    console.log("Active Database Users:", usersList);
    console.log("=================================================");
    console.log("🎉 REMOTE DATABASE INITIALIZATION COMPLETE!");
  } catch (err) {
    console.error("❌ Error initializing remote DB:", err);
  } finally {
    await sql.end();
  }
}

seedRemote();
