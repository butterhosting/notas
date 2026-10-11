import { MediaConverter } from "@/drizzle/converters/MediaConverter";
import { $media } from "@/drizzle/schema";
import { Sqlite } from "@/drizzle/sqlite";
import { Env } from "@/Env";
import { Media } from "@/models/Media";
import { Temporal } from "@js-temporal/polyfill";
import { and, eq, isNotNull, isNull, not, sql } from "drizzle-orm";
import { mkdir, rm } from "fs/promises";
import { dirname, join } from "path";
import { PersistenceError } from "./error/PersistenceError";

export class MediaRepository {
  public constructor(
    private readonly sqlite: Sqlite,
    private readonly env: Env.Private,
  ) {}

  /**
   * Streamed chunk by chunk: `Bun.write(path, request)` buffers the whole body (a 400 MB upload grew the process by
   * ~1 GB; this way ~9 MB). A reader, not `for await`: in Bun 1.3 that fails once the handler has awaited anything.
   */
  public async writeFile(media: Pick<Media, "id" | "workspace" | "filename">, body: ReadableStream<Uint8Array>): Promise<{ size: number }> {
    const path = this.path(media);
    await mkdir(dirname(path), { recursive: true });
    const reader = body.getReader();
    const sink = Bun.file(path).writer();
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        sink.write(value);
      }
    } finally {
      await sink.end();
    }
    return { size };
  }

  public async deleteFile(media: Pick<Media, "id" | "workspace">): Promise<void> {
    await rm(join(this.env.NOTAS_MEDIA, media.workspace, media.id), { recursive: true, force: true });
  }

  public async deleteWorkspaceFiles(workspace: string): Promise<void> {
    await rm(join(this.env.NOTAS_MEDIA, workspace), { recursive: true, force: true });
  }

  public file(media: Media): Bun.BunFile {
    return Bun.file(this.path(media), { type: media.mime });
  }

  public async create(media: Media): Promise<Media> {
    return await this.sqlite
      .insert($media)
      .values(MediaConverter.toDatabase(media))
      .then(
        () => media,
        (err) => {
          throw PersistenceError.tryCast(err);
        },
      );
  }

  public async find(id: string): Promise<Media | undefined> {
    const media = await this.sqlite.query.$media.findFirst({
      where: eq($media.id, id),
    });
    return media ? MediaConverter.fromDatabase(media) : undefined;
  }

  /** Stamps files no page links to with when that was first seen, and clears it once one does. Any page counts. */
  public async markReferences(now: Temporal.Instant): Promise<void> {
    await this.sqlite
      .update($media)
      .set({ unreferenced: now.toString() })
      .where(and(isNull($media.unreferenced), not(MediaRepository.REFERENCED)));
    await this.sqlite.update($media).set({ unreferenced: null }).where(and(isNotNull($media.unreferenced), MediaRepository.REFERENCED));
  }

  public async findUnreferencedSince(cutoff: Temporal.Instant): Promise<Media[]> {
    const media = await this.sqlite.query.$media.findMany({
      where: and(isNotNull($media.unreferenced), sql`julianday(${$media.unreferenced}) <= julianday(${cutoff.toString()})`),
    });
    return media.map(MediaConverter.fromDatabase);
  }

  public async delete(id: string): Promise<void> {
    await this.sqlite.delete($media).where(eq($media.id, id));
  }

  public async deleteAll(): Promise<void> {
    await this.sqlite.delete($media);
    await rm(this.env.NOTAS_MEDIA, { recursive: true, force: true });
    await mkdir(this.env.NOTAS_MEDIA, { recursive: true });
  }

  private path(media: Pick<Media, "id" | "workspace" | "filename">) {
    return join(this.env.NOTAS_MEDIA, media.workspace, media.id, media.filename);
  }
}

export namespace MediaRepository {
  /** Raw SQL: in an `update media`, drizzle leaves columns unqualified, and a bare `id` here would mean the page's. */
  export const REFERENCED = sql.raw(
    "exists (select 1 from page where instr(page.markdown, '/media/' || media.id || '/') > 0 or instr(coalesce(page.cover_src, ''), '/media/' || media.id || '/') > 0)",
  );
}
