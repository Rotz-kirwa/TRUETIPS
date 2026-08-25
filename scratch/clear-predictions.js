import postgres from "postgres";

const url = process.env.DATABASE_URL || "postgres://postgres@127.0.0.1:5432/predictionlab";
const sql = postgres(url);

async function clearPredictions() {
  try {
    console.log("Clearing all predictions and jackpots in database:", url);
    
    // Ensure app_settings exists
    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // Clear prediction tables
    await sql`DELETE FROM jackpot_matches;`;
    await sql`DELETE FROM jackpots;`;
    await sql`DELETE FROM predictions;`;

    // Mark as seeded so default games are NOT re-seeded automatically
    await sql`
      INSERT INTO app_settings (key, value)
      VALUES ('predictions_seeded', 'true'), ('jackpots_seeded', 'true')
      ON CONFLICT (key) DO UPDATE SET value = 'true';
    `;

    console.log("Successfully cleared all prediction games and set seeded flags!");
  } catch (err) {
    console.error("Error clearing predictions:", err);
  } finally {
    await sql.end();
  }
}

clearPredictions();
