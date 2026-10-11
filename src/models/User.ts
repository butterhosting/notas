import { ZodParser } from "@/helpers/ZodParser";
import { Temporal } from "@js-temporal/polyfill";
import z from "zod/v4";

/** Never carries the password hash. */
export type User = {
  id: string;
  object: "user";
  username: string;
  created: Temporal.Instant;
  updated?: Temporal.Instant;
};

export namespace User {
  export const ADMIN = "admin";

  export const parse = ZodParser.forType<User>()
    .ensureSchemaMatchesType(() =>
      z.object({
        id: z.uuid(),
        object: z.literal("user"),
        username: z.string(),
        created: z.string().transform(ZodParser.instant),
        updated: z.string().transform(ZodParser.instant).optional(),
      }),
    )
    .ensureTypeMatchesSchema();
}
