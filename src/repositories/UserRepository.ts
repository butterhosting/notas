import { UserConverter } from "@/drizzle/converters/UserConverter";
import { $user } from "@/drizzle/schema";
import { Sqlite } from "@/drizzle/sqlite";
import { User } from "@/models/User";
import { eq } from "drizzle-orm";
import { PersistenceError } from "./error/PersistenceError";

export class UserRepository {
  public constructor(private readonly sqlite: Sqlite) {}

  public async list(): Promise<User[]> {
    const users = await this.sqlite.query.$user.findMany({ orderBy: [$user.username] });
    return users.map((user) => UserConverter.fromDatabase(user));
  }

  public async find(id: string): Promise<User | undefined> {
    const user = await this.sqlite.query.$user.findFirst({ where: eq($user.id, id) });
    return user ? UserConverter.fromDatabase(user) : undefined;
  }

  public async findByUsername(username: string): Promise<User | undefined> {
    const user = await this.sqlite.query.$user.findFirst({ where: eq($user.username, username) });
    return user ? UserConverter.fromDatabase(user) : undefined;
  }

  public async findWithPasswordHash(username: string): Promise<{ user: User; passwordHash: string } | undefined> {
    const user = await this.sqlite.query.$user.findFirst({ where: eq($user.username, username) });
    return user ? { user: UserConverter.fromDatabase(user), passwordHash: user.passwordHash } : undefined;
  }

  public async create(user: User, passwordHash: string): Promise<User> {
    return await this.sqlite
      .insert($user)
      .values(UserConverter.toDatabase(user, passwordHash))
      .then(
        () => user,
        (err) => {
          throw PersistenceError.tryCast(err);
        },
      );
  }

  public async update(id: string, patch: Partial<Pick<User, "username" | "updated">>, passwordHash?: string): Promise<User | undefined> {
    const [user] = await this.sqlite
      .update($user)
      .set(UserConverter.toDatabase(patch, passwordHash))
      .where(eq($user.id, id))
      .returning()
      .catch((err) => {
        throw PersistenceError.tryCast(err);
      });
    return user ? UserConverter.fromDatabase(user) : undefined;
  }

  /** Cascades to sessions, workspaces (with their pages and media rows) and memberships. */
  public async delete(id: string): Promise<User | undefined> {
    const [user] = await this.sqlite.delete($user).where(eq($user.id, id)).returning();
    return user ? UserConverter.fromDatabase(user) : undefined;
  }
}
