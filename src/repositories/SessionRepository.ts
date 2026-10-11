import { SessionConverter } from "@/drizzle/converters/SessionConverter";
import { $session } from "@/drizzle/schema";
import { Sqlite } from "@/drizzle/sqlite";
import { Session } from "@/models/internal/Session";
import { Temporal } from "@js-temporal/polyfill";
import { eq, lt } from "drizzle-orm";

export class SessionRepository {
  public constructor(private readonly sqlite: Sqlite) {}

  public async create(session: Session): Promise<Session> {
    await this.sqlite.insert($session).values(SessionConverter.toDatabase(session));
    return session;
  }

  public async find(id: string): Promise<Session | undefined> {
    const session = await this.sqlite.query.$session.findFirst({ where: eq($session.id, id) });
    return session ? SessionConverter.fromDatabase(session) : undefined;
  }

  public async extend(id: string, expires: Temporal.Instant): Promise<void> {
    await this.sqlite.update($session).set({ expires: expires.toString() }).where(eq($session.id, id));
  }

  public async delete(id: string): Promise<void> {
    await this.sqlite.delete($session).where(eq($session.id, id));
  }

  public async deleteForUser(user: string): Promise<void> {
    await this.sqlite.delete($session).where(eq($session.user, user));
  }

  public async deleteExpired(now: Temporal.Instant): Promise<void> {
    await this.sqlite.delete($session).where(lt($session.expires, now.toString()));
  }

  public async deleteAll(): Promise<void> {
    await this.sqlite.delete($session);
  }
}
