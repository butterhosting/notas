import { $media } from "@/drizzle/schema";
import { Media } from "@/models/Media";
import { Temporal } from "@js-temporal/polyfill";
import { InferSelectModel } from "drizzle-orm";

export namespace MediaConverter {
  type $Media = InferSelectModel<typeof $media>;

  export function toDatabase(model: Media): $Media {
    return {
      id: model.id,
      workspace: model.workspace,
      filename: model.filename,
      mime: model.mime,
      size: model.size,
      created: model.created.toString(),
      // in use until a sweep finds otherwise
      unreferenced: null,
    };
  }

  export function fromDatabase(db: $Media): Media {
    return {
      id: db.id,
      object: "media",
      workspace: db.workspace,
      filename: db.filename,
      mime: db.mime,
      size: db.size,
      url: Media.url(db.id, db.filename),
      created: Temporal.Instant.from(db.created),
    };
  }
}
