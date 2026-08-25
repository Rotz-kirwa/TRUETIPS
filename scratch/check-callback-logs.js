import postgres from "postgres";

const dbUrl = "postgresql://sure_10_user:K7zAvCJ7eoxJ5OeOgtpnbqrBX95VZGXZ@dpg-da6vlf61egvs73esj6r0-a.oregon-postgres.render.com/sure_10";
const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

async function checkLogs() {
  try {
    console.log("=================================================");
    console.log("🔍 CHECKING PAYMENTS, AUDITS, AND SMS LOGS IN DB");
    console.log("=================================================");

    const payments = await sql`SELECT * FROM mpesa_payments ORDER BY created_at DESC LIMIT 10;`;
    console.log(`\n📌 mpesa_payments (${payments.length} rows):`);
    console.log(JSON.stringify(payments, null, 2));

    const smsLogs = await sql`SELECT * FROM sms_logs ORDER BY created_at DESC LIMIT 10;`;
    console.log(`\n📌 sms_logs (${smsLogs.length} rows):`);
    console.log(JSON.stringify(smsLogs, null, 2));

    const audits = await sql`SELECT * FROM app_settings WHERE key LIKE 'audit_%' OR key LIKE '%callback%';`;
    console.log(`\n📌 app_settings audit entries:`);
    console.log(JSON.stringify(audits, null, 2));

  } catch (err) {
    console.error("Error checking logs:", err);
  } finally {
    await sql.end();
  }
}

checkLogs();
