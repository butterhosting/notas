import { ZodParser } from "@/helpers/ZodParser";
import z from "zod/v4";
import { Page } from "./Page";

/** Matched words in the excerpt are wrapped in `MARK_START` and `MARK_END`. */
export type SearchResult = {
  object: "search_result";
  page: Page.Summary;
  snippet: string;
};

export namespace SearchResult {
  export const MARK_START = "\u0002";
  export const MARK_END = "\u0003";

  export const parse = ZodParser.forType<SearchResult>()
    .ensureSchemaMatchesType(() =>
      z.object({
        object: z.literal("search_result"),
        page: Page.parseSummary.SCHEMA,
        snippet: z.string(),
      }),
    )
    .ensureTypeMatchesSchema();
}
