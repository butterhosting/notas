import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const $page = sqliteTable("page", {
  id: text().primaryKey(),
  workspace: text().notNull(),
  parent: text(),
  position: real().notNull(),
  title: text().notNull(),
  icon: text(),
  coverSrc: text(),
  coverY: real(),
  markdown: text().notNull(),
  revision: integer().notNull(),
  created: text().notNull(),
  updated: text(),
  deleted: text(),
});
