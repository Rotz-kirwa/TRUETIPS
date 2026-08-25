import postgres from "postgres";
import bcrypt from "bcryptjs";

const dbUrl = process.env.DATABASE_URL || "postgres://postgres@127.0.0.1:5432/predictionlab";
const sql = postgres(dbUrl);

async function run() {
  const targetEmail = "dev@gmail.com";
  const rawPassword = "matamu";

  console.log(`Hashing password for ${targetEmail}...`);
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Check existing users
  const existingUsers = await sql`SELECT id, email, role FROM users;`;
  console.log("Current users in database:", existingUsers);

  // Upsert user
  await sql`
    INSERT INTO users (email, password_hash, role)
    VALUES (${targetEmail}, ${passwordHash}, 'admin')
    ON CONFLICT (email) 
    DO UPDATE SET 
      password_hash = EXCLUDED.password_hash,
      role = 'admin';
  `;

  console.log(`Successfully updated/inserted user ${targetEmail} with password ${rawPassword}!`);

  const updatedUsers = await sql`SELECT id, email, role, created_at FROM users;`;
  console.log("Updated users list:", updatedUsers);

  await sql.end();
}

run().catch(console.error);
