import { Env } from "@/Env";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export type Sqlite = Awaited<ReturnType<typeof Sqlite.initialize>>;

export namespace Sqlite {
  export async function initialize(env: Env.Private) {
    const database = new Database(env.NOTAS_DATABASE, { create: true });
    const sqlite = drizzle(database, {
      casing: "snake_case",
      schema,
    });
    migrate(sqlite, {
      migrationsFolder: "src/drizzle/migrations",
    });
    sqlite.run("PRAGMA foreign_keys = ON");
    // WAL: readers and writers stop blocking each other, and `sqlite3 .backup` stops stalling the app. `NORMAL` skips
    // the per-commit fsync: a crash can cost the last commits, never the database. A locked writer waits up to 5 s.
    sqlite.run("PRAGMA journal_mode = WAL");
    sqlite.run("PRAGMA synchronous = NORMAL");
    sqlite.run("PRAGMA busy_timeout = 5000");
    return Object.assign(sqlite, {
      close: () => database.close(),
    });
  }
}
