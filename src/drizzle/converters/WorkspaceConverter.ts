import { $membership, $workspace } from "@/drizzle/schema";
import { Member } from "@/models/Member";
import { Workspace } from "@/models/Workspace";
import { Temporal } from "@js-temporal/polyfill";
import { InferSelectModel } from "drizzle-orm";

/** Reads back with the owner's username and the reader's role, joined in by the repository. */
export namespace WorkspaceConverter {
  type $Workspace = InferSelectModel<typeof $workspace>;
  type $Membership = InferSelectModel<typeof $membership>;

  export function toDatabase(model: Pick<Workspace, "id" | "name" | "created"> & { owner: string }): $Workspace;
  export function toDatabase(model: Partial<Pick<Workspace, "name" | "updated">>): Partial<$Workspace>;
  export function toDatabase(model: Partial<Pick<Workspace, "id" | "name" | "created" | "updated">> & { owner?: string }): Partial<$Workspace> {
    return {
      id: model.id,
      owner: model.owner,
      name: model.name,
      created: model.created?.toString(),
      updated: model.updated?.toString(),
    };
  }

  export function fromDatabase(db: $Workspace & { ownerUsername: string; role: Workspace.Role }): Workspace {
    return {
      id: db.id,
      object: "workspace",
      name: db.name,
      owner: { id: db.owner, username: db.ownerUsername },
      role: db.role,
      created: Temporal.Instant.from(db.created),
      updated: db.updated ? Temporal.Instant.from(db.updated) : undefined,
    };
  }

  export function memberToDatabase(model: Pick<Member, "workspace" | "role" | "created"> & { user: string }): $Membership {
    return {
      workspace: model.workspace,
      user: model.user,
      role: model.role,
      created: model.created.toString(),
    };
  }

  export function memberFromDatabase(db: $Membership & { username: string }): Member {
    return {
      object: "member",
      workspace: db.workspace,
      user: { id: db.user, username: db.username },
      role: db.role as Member.Role,
      created: Temporal.Instant.from(db.created),
    };
  }
}
