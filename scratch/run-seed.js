import { ensureDatabaseTablesAndSeed } from '../src/lib/db/init-schema.server.ts';

async function main() {
  console.log("Running ensureDatabaseTablesAndSeed()...");
  await ensureDatabaseTablesAndSeed();
  console.log("Database initialized successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
