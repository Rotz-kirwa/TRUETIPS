import postgres from "postgres";

const dbUrl = "postgresql://sure_10_user:K7zAvCJ7eoxJ5OeOgtpnbqrBX95VZGXZ@dpg-da6vlf61egvs73esj6r0-a.oregon-postgres.render.com/sure_10";
const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

async function main() {
  const settings = await sql`SELECT * FROM app_settings;`;
  console.log("app_settings in DB:", JSON.stringify(settings, null, 2));

  // Explicitly set sms_automation_enabled to true
  await sql`
    INSERT INTO app_settings (key, value)
    VALUES ('sms_automation_enabled', 'true')
    ON CONFLICT (key) DO UPDATE SET value = 'true';
  `;
  console.log("✓ Set sms_automation_enabled = 'true' in app_settings!");

  await sql.end();
}

main().catch(console.error);
