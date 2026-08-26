import postgres from "postgres";
import { hash } from "bcryptjs";

const dbUrl = "postgresql://sure_10_user:K7zAvCJ7eoxJ5OeOgtpnbqrBX95VZGXZ@dpg-da6vlf61egvs73esj6r0-a.oregon-postgres.render.com/sure_10";
const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

async function main() {
  console.log("=================================================");
  console.log("⚡ UPDATING ADMIN USER CREDENTIALS IN PRODUCTION DB");
  console.log("=================================================");

  const newEmail = "sure10@gmail.com";
  const newPassword = "Sure10-78";
  const passwordHash = await hash(newPassword, 10);

  // Insert or update sure10@gmail.com
  await sql`
    INSERT INTO users (email, password_hash, role)
    VALUES (${newEmail}, ${passwordHash}, 'admin')
    ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, role = 'admin';
  `;

  console.log(`✓ Admin user '${newEmail}' updated with new password!`);

  // Optionally check all users in DB
  const allUsers = await sql`SELECT id, email, role, created_at FROM users;`;
  console.log("Current users in DB:", allUsers);

  await sql.end();
}

main().catch(console.error);
