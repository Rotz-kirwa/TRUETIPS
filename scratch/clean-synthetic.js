import postgres from "postgres";

const renderUrl = "postgresql://sure_10_user:K7zAvCJ7eoxJ5OeOgtpnbqrBX95VZGXZ@dpg-da6vlf61egvs73esj6r0-a.oregon-postgres.render.com/sure_10";

async function main() {
  const sql = postgres(renderUrl, { ssl: { rejectUnauthorized: false } });
  console.log("=== CLEANING SYNTHETIC TEST PAYMENTS FROM DB ===");

  const deleted = await sql`
    DELETE FROM mpesa_payments
    WHERE mpesa_receipt_number LIKE '%INSPECT_%'
       OR mpesa_receipt_number LIKE '%VERIFY_%'
       OR mpesa_receipt_number LIKE '%TEST_%'
       OR mpesa_receipt_number LIKE '%SYNTHETIC_%'
       OR mpesa_receipt_number LIKE '%LIVE_DEPLOY_%'
       OR mpesa_receipt_number LIKE '%VERCEL_%'
       OR mpesa_receipt_number LIKE '%DOMAIN_%'
       OR mpesa_receipt_number LIKE '%POST_TEST_%'
       OR mpesa_receipt_number LIKE '%SURE10_LIVE_%'
    RETURNING id, mpesa_receipt_number;
  `;

  console.log(`Deleted ${deleted.length} synthetic test payment records.`);

  const current = await sql`SELECT id, source, status, phone, amount, mpesa_receipt_number, paid_at, created_at FROM mpesa_payments ORDER BY created_at DESC;`;
  console.log("\n=== REMAINING PAYMENTS IN DATABASE ===");
  console.table(current);

  await sql.end();
}

main().catch(console.error);
