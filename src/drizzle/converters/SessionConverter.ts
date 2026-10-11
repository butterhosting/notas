import { $session } from "@/drizzle/schema";
import { Session } from "@/models/internal/Session";
import { Temporal } from "@js-temporal/polyfill";
import { InferSelectModel } from "drizzle-orm";

export namespace SessionConverter {
  type $Session = InferSelectModel<typeof $session>;

  export function toDatabase(model: Session): $Session {
    return {
      id: model.id,
      user: model.user ?? null,
      expires: model.expires.toString(),
      created: model.created.toString(),
    };
  }

  export function fromDatabase(db: $Session): Session {
    return {
      id: db.id,
      user: db.user ?? undefined,
      expires: Temporal.Instant.from(db.expires),
      created: Temporal.Instant.from(db.created),
    };
  }
}
