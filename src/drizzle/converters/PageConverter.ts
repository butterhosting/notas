import { $page } from "@/drizzle/schema";
import { Page } from "@/models/Page";
import { Temporal } from "@js-temporal/polyfill";
import { InferSelectModel } from "drizzle-orm";

/**
 * Explicit directions: a partial of either side looks the same at runtime, and the wrong one hands `Temporal.Instant`s
 * to the driver.
 */
export namespace PageConverter {
  type $Page = InferSelectModel<typeof $page>;
  type $Summary = Omit<$Page, "markdown">;

  /** `null` clears an optional field; `undefined` leaves it. */
  export type Patch = Partial<Omit<Page, "parent" | "icon" | "cover" | "deleted">> & {
    parent?: string | null;
    deleted?: Page["deleted"] | null;
    icon?: string | null;
    cover?: Page.Cover | null;
  };

  export function toDatabase(model: Page): $Page;
  export function toDatabase(model: Patch): Partial<$Page>;
  export function toDatabase(model: Patch): Partial<$Page> {
    return {
      id: model.id,
      workspace: model.workspace,
      parent: model.parent,
      position: model.position,
      title: model.title,
      icon: model.icon,
      coverSrc: model.cover === null ? null : model.cover?.src,
      coverY: model.cover === null ? null : model.cover?.y,
      markdown: model.markdown,
      revision: model.revision,
      created: model.created?.toString(),
      updated: model.updated?.toString(),
      deleted: model.deleted === null ? null : model.deleted?.toString(),
    };
  }

  export function fromDatabase(db: $Page): Page;
  export function fromDatabase(db: $Summary): Page.Summary;
  export function fromDatabase(db: $Summary & { markdown?: string }): Page | Page.Summary {
    return {
      id: db.id,
      object: "page",
      workspace: db.workspace,
      parent: db.parent ?? undefined,
      position: db.position,
      title: db.title,
      icon: db.icon ?? undefined,
      cover: db.coverSrc ? { src: db.coverSrc, y: db.coverY ?? 50 } : undefined,
      ...(db.markdown === undefined ? {} : { markdown: db.markdown }),
      revision: db.revision,
      created: Temporal.Instant.from(db.created),
      updated: db.updated ? Temporal.Instant.from(db.updated) : undefined,
      deleted: db.deleted ? Temporal.Instant.from(db.deleted) : undefined,
    };
  }
}
