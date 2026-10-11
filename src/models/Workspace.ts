import { ZodParser } from "@/helpers/ZodParser";
import { Temporal } from "@js-temporal/polyfill";
import z from "zod/v4";

/** `role` is that of whoever asked. */
export type Workspace = {
  id: string;
  object: "workspace";
  name: string;
  owner: Workspace.Owner;
  role: Workspace.Role;
  created: Temporal.Instant;
  updated?: Temporal.Instant;
};

export namespace Workspace {
  export type Owner = { id: string; username: string };
  export type Role = "owner" | "write" | "read";
  export const ROLES = ["owner", "write", "read"] as const;

  export const PERSONAL = "Personal Workspace";

  export function canWrite(role: Role | undefined): boolean {
    return role === "owner" || role === "write";
  }

  export const parse = ZodParser.forType<Workspace>()
    .ensureSchemaMatchesType(() =>
      z.object({
        id: z.uuid(),
        object: z.literal("workspace"),
        name: z.string(),
        owner: z.object({ id: z.uuid(), username: z.string() }),
        role: z.enum(ROLES),
        created: z.string().transform(ZodParser.instant),
        updated: z.string().transform(ZodParser.instant).optional(),
      }),
    )
    .ensureTypeMatchesSchema();
}
