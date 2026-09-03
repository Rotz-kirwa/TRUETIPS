import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const DEFAULT_REMOTE_DB =
    "postgresql://truetips_db_user:xNiZ9q0LdMkE2seXw5BKwkIg4Gv9NV6R@dpg-dacie4uq1p3s738a02ng-a.oregon-postgres.render.com/truetips_db";

  let url = process.env.DATABASE_URL?.trim();

  if (!url || !url.startsWith("postgres")) {
    url = DEFAULT_REMOTE_DB;
  }

  // If running outside Render internal network (e.g. Vercel), convert internal dpg- host to public endpoint
  if (url.includes("dpg-") && !url.includes(".render.com") && !url.includes("127.0.0.1") && !url.includes("localhost")) {
    url = url.replace(/@(dpg-[^/:]+)/, "@$1.oregon-postgres.render.com");
  }

  // Validate URL format before passing to postgres client
  try {
    new URL(url);
  } catch {
    console.error(`[db] Invalid DATABASE_URL format: '${url}'. Fallback to remote production postgres.`);
    url = DEFAULT_REMOTE_DB;
  }

  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");

  const client = postgres(url, {
    max: 1, // single connection per worker instance
    ssl: isLocal ? false : { rejectUnauthorized: false },
    types: {
      // parse NUMERIC columns as JS numbers instead of strings
      numeric: {
        to: 0,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => parseFloat(x),
      },
    },
  });

  return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop, receiver) {
    if (!_db) _db = createDb();
    return Reflect.get(_db, prop, receiver);
  },
});
