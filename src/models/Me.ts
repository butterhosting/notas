import { ZodParser } from "@/helpers/ZodParser";
import z from "zod/v4";
import { User } from "./User";

export type Me = { object: "me"; kind: "admin" } | { object: "me"; kind: "user"; user: User };

export namespace Me {
  export const parse = ZodParser.forType<Me>()
    .ensureSchemaMatchesType(() =>
      z.union([
        z.object({ object: z.literal("me"), kind: z.literal("admin") }),
        z.object({ object: z.literal("me"), kind: z.literal("user"), user: User.parse.SCHEMA }),
      ]),
    )
    .ensureTypeMatchesSchema();
}
