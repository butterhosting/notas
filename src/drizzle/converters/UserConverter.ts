import { $user } from "@/drizzle/schema";
import { User } from "@/models/User";
import { Temporal } from "@js-temporal/polyfill";
import { InferSelectModel } from "drizzle-orm";

/** The password hash only ever goes in. */
export namespace UserConverter {
  type $User = InferSelectModel<typeof $user>;

  export function toDatabase(model: User, passwordHash: string): $User;
  export function toDatabase(model: Partial<User>, passwordHash?: string): Partial<$User>;
  export function toDatabase(model: Partial<User>, passwordHash?: string): Partial<$User> {
    return {
      id: model.id,
      username: model.username,
      passwordHash,
      created: model.created?.toString(),
      updated: model.updated?.toString(),
    };
  }

  export function fromDatabase(db: $User): User {
    return {
      id: db.id,
      object: "user",
      username: db.username,
      created: Temporal.Instant.from(db.created),
      updated: db.updated ? Temporal.Instant.from(db.updated) : undefined,
    };
  }
}
