import { ZodParser } from "@/helpers/ZodParser";
import { Temporal } from "@js-temporal/polyfill";
import z from "zod/v4";

export type Media = {
  id: string;
  object: "media";
  workspace: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  created: Temporal.Instant;
};

export namespace Media {
  export const parse = ZodParser.forType<Media>()
    .ensureSchemaMatchesType(() =>
      z.object({
        id: z.uuid(),
        object: z.literal("media"),
        workspace: z.uuid(),
        filename: z.string(),
        mime: z.string(),
        size: z.number(),
        url: z.string(),
        created: z.string().transform(ZodParser.instant),
      }),
    )
    .ensureTypeMatchesSchema();

  /** The filename in the url gives downloads and copied links a meaningful name. */
  export function url(id: string, filename: string) {
    return `/media/${id}/${encodeURIComponent(filename)}`;
  }
}
