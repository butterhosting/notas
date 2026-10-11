import { ServerError } from "@/errors/ServerError";
import { UserError } from "@/errors/UserError";
import { Event } from "@/events/Event";
import { EventBus } from "@/events/EventBus";
import { ZodProblem } from "@/helpers/ZodIssues";
import { User } from "@/models/User";
import { Workspace } from "@/models/Workspace";
import { PersistenceError } from "@/repositories/error/PersistenceError";
import { MediaRepository } from "@/repositories/MediaRepository";
import { SessionRepository } from "@/repositories/SessionRepository";
import { UserRepository } from "@/repositories/UserRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { Temporal } from "@js-temporal/polyfill";
import z from "zod/v4";

export class UserService {
  public constructor(
    private readonly userRepository: UserRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly eventBus: EventBus,
  ) {}

  public async list(): Promise<User[]> {
    return await this.userRepository.list();
  }

  public async create(unknown: z.input<typeof UserService.Create>): Promise<User> {
    const { username, password } = UserService.Create.parse(unknown);
    const now = Temporal.Now.instant();
    const user = await this.userRepository
      .create({ id: Bun.randomUUIDv7(), object: "user", username, created: now }, await UserService.hash(password))
      .catch((err) => {
        if (PersistenceError.isUniqueViolation(err)) {
          throw UserError.username_taken({ username });
        }
        throw err;
      });
    await this.workspaceRepository.create({ id: Bun.randomUUIDv7(), owner: user.id, name: Workspace.PERSONAL, created: now });
    return user;
  }

  public async update(id: string, unknown: z.input<typeof UserService.Update>): Promise<User> {
    const { username, password } = UserService.Update.parse(unknown);
    const user = await this.userRepository
      .update(id, { username, updated: Temporal.Now.instant() }, password === undefined ? undefined : await UserService.hash(password))
      .catch((err) => {
        if (username && PersistenceError.isUniqueViolation(err)) {
          throw UserError.username_taken({ username });
        }
        throw err;
      });
    if (!user) {
      throw UserError.not_found({ id });
    }
    if (password !== undefined) {
      await this.sessionRepository.deleteForUser(id);
      this.eventBus.publish(Event.Type.sessions_revoked, { user: id });
    }
    return user;
  }

  /** A user's changes to their own account take their current password, so an unattended session can't take it over. */
  public async updateAccount(user: User, unknown: z.input<typeof UserService.AccountUpdate>): Promise<User> {
    const { currentPassword, ...patch } = UserService.AccountUpdate.parse(unknown);
    await this.checkPassword(user, currentPassword);
    return await this.update(user.id, patch);
  }

  public async deleteAccount(user: User, unknown: z.input<typeof UserService.AccountDelete>): Promise<User> {
    const { password } = UserService.AccountDelete.parse(unknown);
    await this.checkPassword(user, password);
    return await this.delete(user.id);
  }

  private async checkPassword(user: User, password: string): Promise<void> {
    const found = await this.userRepository.findWithPasswordHash(user.username);
    if (!found || !(await Bun.password.verify(password, found.passwordHash))) {
      throw UserError.wrong_password();
    }
  }

  /** With everything they own, including workspaces shared with others. */
  public async delete(id: string): Promise<User> {
    const owned = await this.workspaceRepository.idsOwnedBy(id);
    const audience = new Set((await Promise.all(owned.map((workspace) => this.workspaceRepository.audience(workspace)))).flat());
    const user = await this.userRepository.delete(id);
    if (!user) {
      throw UserError.not_found({ id });
    }
    await Promise.all(owned.map((workspace) => this.mediaRepository.deleteWorkspaceFiles(workspace)));
    audience.delete(id);
    this.eventBus.publish(Event.Type.sessions_revoked, { user: id });
    this.eventBus.publish(Event.Type.workspaces_changed, { users: [...audience] });
    return user;
  }
}

export namespace UserService {
  const username = z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(
      z
        .string()
        .regex(/^[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?$/)
        .refine((name) => name !== User.ADMIN, { message: "reserved" }),
    );
  const password = z.string().min(8).max(200);

  export const Create = z
    .object({ username, password })
    .catch((e) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });

  export const Update = z
    .object({ username: username.optional(), password: password.optional() })
    .catch((e) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });

  export const AccountUpdate = z
    .object({ currentPassword: z.string(), username: username.optional(), password: password.optional() })
    .catch((e) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });

  export const AccountDelete = z
    .object({ password: z.string() })
    .catch((e) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });

  export async function hash(password: string): Promise<string> {
    return await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
  }
}
