import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const $user = sqliteTable("user", {
  id: text().primaryKey(),
  username: text().notNull().unique(),
  passwordHash: text().notNull(),
  created: text().notNull(),
  updated: text(),
});
