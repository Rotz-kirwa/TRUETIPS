import postgres from "postgres";

const dbUrl = "postgresql://sure_10_user:K7zAvCJ7eoxJ5OeOgtpnbqrBX95VZGXZ@dpg-da6vlf61egvs73esj6r0-a.oregon-postgres.render.com/sure_10";
const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

async function checkRules() {
  const rules = await sql`SELECT * FROM sms_automation_rules;`;
  console.log("Rules in DB:", JSON.stringify(rules, null, 2));
  await sql.end();
}

checkRules().catch(console.error);
