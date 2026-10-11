import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const $media = sqliteTable("media", {
  id: text().primaryKey(),
  workspace: text().notNull(),
  filename: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  created: text().notNull(),
  unreferenced: text(),
});
