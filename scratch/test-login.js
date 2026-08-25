import postgres from "postgres";
import bcrypt from "bcryptjs";

const externalUrl = "postgresql://sure_10_user:K7zAvCJ7eoxJ5OeOgtpnbqrBX95VZGXZ@dpg-da6vlf61egvs73esj6r0-a.oregon-postgres.render.com/sure_10";
const sql = postgres(externalUrl, { ssl: { rejectUnauthorized: false } });

async function testAuth() {
  console.log("Testing auth query on external Render Postgres database...");
  const rows = await sql`SELECT id, email, password_hash, role FROM users WHERE email = 'dev@gmail.com' LIMIT 1;`;
  console.log("Query result rows:", rows);

  if (rows.length === 0) {
    console.error("User dev@gmail.com NOT found in database!");
    process.exit(1);
  }

  const user = rows[0];
  const valid = await bcrypt.compare("matamu", user.password_hash);
  console.log("Password match for 'matamu':", valid);

  await sql.end();
}

testAuth().catch(console.error);
