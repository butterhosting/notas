import { ZodParser } from "@/helpers/ZodParser";
import { OmitBetter } from "@/types/OmitBetter";
import { Temporal } from "@js-temporal/polyfill";
import z from "zod/v4";

export type Page = {
  id: string;
  object: "page";
  workspace: string;
  parent?: string;
  position: number;
  title: string;
  icon?: string;
  cover?: Page.Cover;
  markdown: string;
  revision: number;
  created: Temporal.Instant;
  updated?: Temporal.Instant;
  /** Set on the trashed page only; its descendants are in the trash with it, unmarked. */
  deleted?: Temporal.Instant;
};

export namespace Page {
  /** `src`: a media url, an external url or `preset:<name>`; `y`: the vertical focus point, in percent. */
  export type Cover = {
    src: string;
    y: number;
  };

  export type Summary = OmitBetter<Page, "markdown">;

  const CoverSchema = z.object({
    src: z.string(),
    y: z.number(),
  });

  const summaryShape = {
    id: z.uuid(),
    object: z.literal("page"),
    workspace: z.uuid(),
    parent: z.uuid().optional(),
    position: z.number(),
    title: z.string(),
    icon: z.string().optional(),
    cover: CoverSchema.optional(),
    revision: z.number(),
    created: z.string().transform(ZodParser.instant),
    updated: z.string().transform(ZodParser.instant).optional(),
    deleted: z.string().transform(ZodParser.instant).optional(),
  };

  export const parse = ZodParser.forType<Page>()
    .ensureSchemaMatchesType(() =>
      z.object({
        ...summaryShape,
        markdown: z.string(),
      }),
    )
    .ensureTypeMatchesSchema();

  export const parseSummary = ZodParser.forType<Summary>()
    .ensureSchemaMatchesType(() => z.object(summaryShape))
    .ensureTypeMatchesSchema();

  export function summarize({ markdown: _, ...summary }: Page): Summary {
    return summary;
  }

  /** Trashed pages and everything under them. */
  export function trashed(pages: Pick<Page, "id" | "parent" | "deleted">[]): Set<string> {
    return new Set(pages.filter(({ deleted }) => deleted).flatMap(({ id }) => [id, ...descendants(pages, id)]));
  }

  export function descendants(pages: Pick<Page, "id" | "parent">[], id: string): string[] {
    const children = pages.filter(({ parent }) => parent === id).map((page) => page.id);
    return children.flatMap((child) => [child, ...descendants(pages, child)]);
  }
}
