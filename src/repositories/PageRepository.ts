import { PageConverter } from "@/drizzle/converters/PageConverter";
import { $page } from "@/drizzle/schema";
import { Sqlite } from "@/drizzle/sqlite";
import { Page } from "@/models/Page";
import { SearchResult } from "@/models/SearchResult";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { PersistenceError } from "./error/PersistenceError";

export class PageRepository {
  public constructor(private readonly sqlite: Sqlite) {}

  public async list(workspace: string): Promise<Page.Summary[]> {
    const { markdown: _, ...columns } = getTableColumns($page);
    const pages = await this.sqlite.select(columns).from($page).where(eq($page.workspace, workspace)).orderBy($page.position, $page.created);
    return pages.map((page) => PageConverter.fromDatabase(page));
  }

  public async find(id: string): Promise<Page | undefined> {
    const page = await this.sqlite.query.$page.findFirst({
      where: eq($page.id, id),
    });
    return page ? PageConverter.fromDatabase(page) : undefined;
  }

  public async create(page: Page): Promise<Page> {
    return await this.sqlite
      .insert($page)
      .values(PageConverter.toDatabase(page))
      .then(
        () => page,
        (err) => {
          throw PersistenceError.tryCast(err);
        },
      );
  }

  /** With an `expectedRevision`, applies only while the page is at that revision, and bumps it. */
  public async update(id: string, patch: PageConverter.Patch, expectedRevision?: number): Promise<Page | undefined> {
    const [page] = await this.sqlite
      .update($page)
      .set(PageConverter.toDatabase({ ...patch, revision: expectedRevision === undefined ? undefined : expectedRevision + 1 }))
      .where(expectedRevision === undefined ? eq($page.id, id) : and(eq($page.id, id), eq($page.revision, expectedRevision)))
      .returning()
      .catch((err) => {
        throw PersistenceError.tryCast(err);
      });
    return page ? PageConverter.fromDatabase(page) : undefined;
  }

  public async search(workspace: string, terms: string[], limit: number): Promise<{ id: string; snippet: string }[]> {
    if (terms.length === 0) {
      return [];
    }
    // quoted so no term reads as fts5 syntax; `*` makes it a prefix
    const match = terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" ");
    return await this.sqlite.all<{ id: string; snippet: string }>(sql`
      select page_search.id as id, snippet(page_search, -1, ${SearchResult.MARK_START}, ${SearchResult.MARK_END}, '…', 16) as snippet
      from page_search join page on page.rowid = page_search.rowid
      where page_search match ${match} and page.workspace = ${workspace}
      order by bm25(page_search, 0.0, 10.0, 1.0)
      limit ${limit}
    `);
  }

  /** The schema cascades to every descendant. */
  public async delete(id: string): Promise<Page | undefined> {
    const [page] = await this.sqlite.delete($page).where(eq($page.id, id)).returning();
    return page ? PageConverter.fromDatabase(page) : undefined;
  }
}
