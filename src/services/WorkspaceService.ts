import { ServerError } from "@/errors/ServerError";
import { WorkspaceError } from "@/errors/WorkspaceError";
import { Event } from "@/events/Event";
import { EventBus } from "@/events/EventBus";
import { ZodProblem } from "@/helpers/ZodIssues";
import { Member } from "@/models/Member";
import { User } from "@/models/User";
import { Workspace } from "@/models/Workspace";
import { PersistenceError } from "@/repositories/error/PersistenceError";
import { MediaRepository } from "@/repositories/MediaRepository";
import { UserRepository } from "@/repositories/UserRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { Temporal } from "@js-temporal/polyfill";
import z from "zod/v4";

export class WorkspaceService {
  public constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly userRepository: UserRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly eventBus: EventBus,
  ) {}

  public async list(user: User): Promise<Workspace[]> {
    return await this.workspaceRepository.listFor(user.id);
  }

  /** No access at all reads as not found; too little as forbidden. */
  public async require(user: User, id: string, need: "read" | "write" | "owner"): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findFor(id, user.id);
    if (!workspace) {
      throw WorkspaceError.not_found({ id });
    }
    if ((need === "write" && !Workspace.canWrite(workspace.role)) || (need === "owner" && workspace.role !== "owner")) {
      throw ServerError.forbidden();
    }
    return workspace;
  }

  public async create(user: User, unknown: z.input<typeof WorkspaceService.Create>): Promise<Workspace> {
    const { name } = WorkspaceService.Create.parse(unknown);
    const id = Bun.randomUUIDv7();
    await this.workspaceRepository.create({ id, owner: user.id, name, created: Temporal.Now.instant() }).catch((err) => {
      if (PersistenceError.isUniqueViolation(err)) {
        throw WorkspaceError.name_taken({ name });
      }
      throw err;
    });
    this.eventBus.publish(Event.Type.workspaces_changed, { users: [user.id] });
    return await this.require(user, id, "owner");
  }

  public async rename(user: User, id: string, unknown: z.input<typeof WorkspaceService.Create>): Promise<Workspace> {
    const { name } = WorkspaceService.Create.parse(unknown);
    await this.require(user, id, "owner");
    await this.workspaceRepository.update(id, { name, updated: Temporal.Now.instant() }).catch((err) => {
      if (PersistenceError.isUniqueViolation(err)) {
        throw WorkspaceError.name_taken({ name });
      }
      throw err;
    });
    this.eventBus.publish(Event.Type.workspaces_changed, { users: await this.workspaceRepository.audience(id) });
    return await this.require(user, id, "owner");
  }

  public async delete(user: User, id: string): Promise<Workspace> {
    const workspace = await this.require(user, id, "owner");
    const audience = await this.workspaceRepository.audience(id);
    await this.workspaceRepository.delete(id);
    await this.mediaRepository.deleteWorkspaceFiles(id);
    this.eventBus.publish(Event.Type.workspaces_changed, { users: audience });
    return workspace;
  }

  public async members(user: User, id: string): Promise<Member[]> {
    await this.require(user, id, "owner");
    return await this.workspaceRepository.members(id);
  }

  public async share(user: User, id: string, unknown: z.input<typeof WorkspaceService.Share>): Promise<Member> {
    const { username, role } = WorkspaceService.Share.parse(unknown);
    const workspace = await this.require(user, id, "owner");
    const member = await this.userRepository.findByUsername(username);
    if (!member) {
      throw WorkspaceError.user_not_found({ username });
    }
    if (member.id === workspace.owner.id) {
      throw WorkspaceError.owner_cannot_be_member({ username });
    }
    await this.workspaceRepository.setMember({ workspace: id, user: member.id, role, created: Temporal.Now.instant() });
    this.eventBus.publish(Event.Type.workspaces_changed, { users: [member.id] });
    return (await this.workspaceRepository.members(id)).find(({ user }) => user.id === member.id)!;
  }

  public async changeRole(user: User, id: string, member: string, unknown: z.input<typeof WorkspaceService.Role>): Promise<Member> {
    const { role } = WorkspaceService.Role.parse(unknown);
    await this.require(user, id, "owner");
    const existing = (await this.workspaceRepository.members(id)).find((candidate) => candidate.user.id === member);
    if (!existing) {
      throw WorkspaceError.member_not_found({ id, user: member });
    }
    await this.workspaceRepository.setMember({ workspace: id, user: member, role, created: existing.created });
    this.eventBus.publish(Event.Type.workspaces_changed, { users: [member] });
    return { ...existing, role };
  }

  /** The owner removes anyone; a member only themselves. */
  public async unshare(user: User, id: string, member: string): Promise<void> {
    await this.require(user, id, user.id === member ? "read" : "owner");
    if (!(await this.workspaceRepository.removeMember(id, member))) {
      throw WorkspaceError.member_not_found({ id, user: member });
    }
    this.eventBus.publish(Event.Type.workspaces_changed, { users: [member] });
  }

  /** The users who hear about what happens in the workspace. */
  public async audience(id: string): Promise<string[]> {
    return await this.workspaceRepository.audience(id);
  }
}

export namespace WorkspaceService {
  export const Create = z
    .object({
      name: z.string().trim().min(1).max(100),
    })
    .catch((e: z.core.$ZodCatchCtx) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });

  export const Share = z
    .object({
      username: z.string().transform((s) => s.trim().toLowerCase()),
      role: z.enum(Member.ROLES),
    })
    .catch((e: z.core.$ZodCatchCtx) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });

  export const Role = z
    .object({
      role: z.enum(Member.ROLES),
    })
    .catch((e: z.core.$ZodCatchCtx) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });
}
