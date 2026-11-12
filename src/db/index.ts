import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __viralchatDb?: DB };

function getDb(): DB {
  if (!globalForDb.__viralchatDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure Postgres.");
    }
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
    globalForDb.__viralchatDb = drizzle(client, { schema });
  }
  return globalForDb.__viralchatDb;
}

/** Lazily-initialised database handle so builds don't require DATABASE_URL. */
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
