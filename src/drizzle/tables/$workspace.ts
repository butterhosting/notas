import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const $workspace = sqliteTable("workspace", {
  id: text().primaryKey(),
  owner: text().notNull(),
  name: text().notNull(),
  created: text().notNull(),
  updated: text(),
});
