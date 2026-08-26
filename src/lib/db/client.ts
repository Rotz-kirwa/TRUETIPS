import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  let url = process.env.DATABASE_URL?.trim();

  if (!url || !url.startsWith("postgres")) {
    if (url && !url.includes("://")) {
      console.warn(
        `[db] DATABASE_URL '${url}' is missing 'postgres://' protocol scheme. Defaulting to local postgres fallback.`,
      );
    }
    url = "postgres://postgres@127.0.0.1:5432/paylix";
  }

  // Validate URL format before passing to postgres client
  try {
    new URL(url);
  } catch {
    console.error(`[db] Invalid DATABASE_URL format: '${url}'. Fallback to local postgres.`);
    url = "postgres://postgres@127.0.0.1:5432/paylix";
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
