import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const $membership = sqliteTable("membership", {
  workspace: text().notNull(),
  user: text().notNull(),
  role: text().notNull(),
  created: text().notNull(),
});
