import postgres from "postgres";

const url = process.env.DATABASE_URL || "postgres://postgres@127.0.0.1:5432/payvora";
const sql = postgres(url);

async function setCleanTemplates() {
  try {
    console.log("Setting clean empty match templates for SMS automation rules...");
    
    await sql`
      UPDATE sms_automation_rules
      SET message_template = 'DAILY MATCHES ⚽\n\n🏆 Play Smart, Win Big', updated_at = NOW()
      WHERE name LIKE '%Daily%';
    `;

    await sql`
      UPDATE sms_automation_rules
      SET message_template = 'JACKPOT MATCHES 🏆\n\n🏆 Play Smart, Win Big', updated_at = NOW()
      WHERE name LIKE '%Jackpot%';
    `;

    await sql`
      UPDATE sms_automation_rules
      SET message_template = 'BASKET MATCHES 🏀\n\n🏆 Play Smart, Win Big', updated_at = NOW()
      WHERE name LIKE '%Basket%';
    `;

    await sql`
      UPDATE sms_automation_rules
      SET message_template = 'WEEKLY SUBSCRIPTION 📅\nUnlimited access to premium OddsArena predictions.\nValid for 7 Days.\n🏆 Play Smart, Win Big', updated_at = NOW()
      WHERE name LIKE '%Weekly%';
    `;

    await sql`
      UPDATE sms_automation_rules
      SET message_template = 'MONTHLY SUBSCRIPTION 📆\nComplete access to OddsArena premium predictions.\nValid for 30 Days.\n🏆 Play Smart, Win Big', updated_at = NOW()
      WHERE name LIKE '%Monthly%';
    `;

    console.log("Successfully set clean templates for all package rules!");
  } catch (err) {
    console.error("Error setting clean templates:", err);
  } finally {
    await sql.end();
  }
}

setCleanTemplates();
