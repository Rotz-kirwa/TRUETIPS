import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/paylix';
const sql = postgres(dbUrl);

async function main() {
  console.log("=== RECENT MPESA PAYMENTS ===");
  const payments = await sql`SELECT id, phone, amount, status, source, created_at, mpesa_receipt_number, till_number FROM mpesa_payments ORDER BY created_at DESC LIMIT 15`;
  console.log(payments);

  console.log("\n=== RECENT CALLBACK AUDITS ===");
  const audits = await sql`SELECT id, endpoint, payload_type, status, created_at FROM callback_audits ORDER BY created_at DESC LIMIT 15`;
  console.log(audits);

  console.log("\n=== SMS AUTOMATION RULES ===");
  const rules = await sql`SELECT id, name, min_amount, max_amount, is_active FROM sms_automation_rules ORDER BY min_amount::numeric`;
  console.log(rules);

  await sql.end();
}

main().catch(console.error);
