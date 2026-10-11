import { ZodParser } from "@/helpers/ZodParser";
import { Temporal } from "@js-temporal/polyfill";
import z from "zod/v4";

/** Someone a workspace is shared with, never its owner. */
export type Member = {
  object: "member";
  workspace: string;
  user: { id: string; username: string };
  role: Member.Role;
  created: Temporal.Instant;
};

export namespace Member {
  export type Role = "write" | "read";
  export const ROLES = ["write", "read"] as const;

  export const parse = ZodParser.forType<Member>()
    .ensureSchemaMatchesType(() =>
      z.object({
        object: z.literal("member"),
        workspace: z.uuid(),
        user: z.object({ id: z.uuid(), username: z.string() }),
        role: z.enum(ROLES),
        created: z.string().transform(ZodParser.instant),
      }),
    )
    .ensureTypeMatchesSchema();
}
