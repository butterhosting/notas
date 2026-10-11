import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const $session = sqliteTable("session", {
  id: text().primaryKey(),
  user: text(),
  expires: text().notNull(),
  created: text().notNull(),
});
