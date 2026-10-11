import { WorkspaceConverter } from "@/drizzle/converters/WorkspaceConverter";
import { $membership, $user, $workspace } from "@/drizzle/schema";
import { Sqlite } from "@/drizzle/sqlite";
import { Member } from "@/models/Member";
import { Workspace } from "@/models/Workspace";
import { and, eq, or, sql } from "drizzle-orm";
import { PersistenceError } from "./error/PersistenceError";

export class WorkspaceRepository {
  public constructor(private readonly sqlite: Sqlite) {}

  public async listFor(user: string): Promise<Workspace[]> {
    const rows = await this.selectFor(user).where(or(eq($workspace.owner, user), eq($membership.user, user))).orderBy($workspace.created);
    return rows.map((row) => WorkspaceConverter.fromDatabase(row));
  }

  public async findFor(id: string, user: string): Promise<Workspace | undefined> {
    const [row] = await this.selectFor(user).where(and(eq($workspace.id, id), or(eq($workspace.owner, user), eq($membership.user, user))));
    return row ? WorkspaceConverter.fromDatabase(row) : undefined;
  }

  public async idsOwnedBy(user: string): Promise<string[]> {
    const rows = await this.sqlite.select({ id: $workspace.id }).from($workspace).where(eq($workspace.owner, user));
    return rows.map(({ id }) => id);
  }

  public async audience(id: string): Promise<string[]> {
    const [workspace] = await this.sqlite.select({ owner: $workspace.owner }).from($workspace).where(eq($workspace.id, id));
    const members = await this.sqlite.select({ user: $membership.user }).from($membership).where(eq($membership.workspace, id));
    return [...(workspace ? [workspace.owner] : []), ...members.map(({ user }) => user)];
  }

  public async create(workspace: { id: string; owner: string; name: string; created: Workspace["created"] }): Promise<void> {
    await this.sqlite
      .insert($workspace)
      .values(WorkspaceConverter.toDatabase(workspace))
      .catch((err) => {
        throw PersistenceError.tryCast(err);
      });
  }

  public async update(id: string, patch: Partial<Pick<Workspace, "name" | "updated">>): Promise<boolean> {
    const rows = await this.sqlite
      .update($workspace)
      .set(WorkspaceConverter.toDatabase(patch))
      .where(eq($workspace.id, id))
      .returning({ id: $workspace.id })
      .catch((err) => {
        throw PersistenceError.tryCast(err);
      });
    return rows.length > 0;
  }

  /** Cascades to pages, media rows and memberships; the media files are the caller's. */
  public async delete(id: string): Promise<boolean> {
    const rows = await this.sqlite.delete($workspace).where(eq($workspace.id, id)).returning({ id: $workspace.id });
    return rows.length > 0;
  }

  public async members(id: string): Promise<Member[]> {
    const rows = await this.sqlite
      .select({ ...this.membershipColumns(), username: $user.username })
      .from($membership)
      .innerJoin($user, eq($user.id, $membership.user))
      .where(eq($membership.workspace, id))
      .orderBy($user.username);
    return rows.map((row) => WorkspaceConverter.memberFromDatabase(row));
  }

  public async setMember(member: Pick<Member, "workspace" | "role" | "created"> & { user: string }): Promise<void> {
    await this.sqlite
      .insert($membership)
      .values(WorkspaceConverter.memberToDatabase(member))
      .onConflictDoUpdate({ target: [$membership.workspace, $membership.user], set: { role: member.role } })
      .catch((err) => {
        throw PersistenceError.tryCast(err);
      });
  }

  public async removeMember(workspace: string, user: string): Promise<boolean> {
    const rows = await this.sqlite
      .delete($membership)
      .where(and(eq($membership.workspace, workspace), eq($membership.user, user)))
      .returning({ user: $membership.user });
    return rows.length > 0;
  }

  private selectFor(user: string) {
    return this.sqlite
      .select({
        id: $workspace.id,
        owner: $workspace.owner,
        name: $workspace.name,
        created: $workspace.created,
        updated: $workspace.updated,
        ownerUsername: $user.username,
        role: sql<Workspace.Role>`case when ${$workspace.owner} = ${user} then 'owner' else ${$membership.role} end`,
      })
      .from($workspace)
      .innerJoin($user, eq($user.id, $workspace.owner))
      .leftJoin($membership, and(eq($membership.workspace, $workspace.id), eq($membership.user, user)));
  }

  private membershipColumns() {
    return { workspace: $membership.workspace, user: $membership.user, role: $membership.role, created: $membership.created };
  }
}
