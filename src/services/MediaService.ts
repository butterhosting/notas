import { MediaError } from "@/errors/MediaError";
import { ServerError } from "@/errors/ServerError";
import { WorkspaceError } from "@/errors/WorkspaceError";
import { ZodProblem } from "@/helpers/ZodIssues";
import { Logger } from "@/Logger";
import { Media } from "@/models/Media";
import { User } from "@/models/User";
import { MediaRepository } from "@/repositories/MediaRepository";
import { Temporal } from "@js-temporal/polyfill";
import { Yexception } from "yexception";
import z from "zod/v4";
import { WorkspaceService } from "./WorkspaceService";

export class MediaService {
  private readonly log = new Logger(__filename);
  private sweeper?: Timer;

  public constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly workspaceService: WorkspaceService,
  ) {}

  /** An interrupted or empty upload leaves neither a row nor a file behind. */
  public async upload(user: User, workspace: string, unknown: z.input<typeof MediaService.Upload>, body: ReadableStream<Uint8Array> | null): Promise<Media> {
    const { filename, mime } = MediaService.Upload.parse(unknown);
    await this.workspaceService.require(user, workspace, "write");
    if (!body) {
      throw MediaError.missing_body();
    }
    const id = Bun.randomUUIDv7();
    try {
      const { size } = await this.mediaRepository.writeFile({ id, workspace, filename }, body);
      if (size === 0) {
        throw MediaError.missing_body();
      }
      return await this.mediaRepository.create({
        id,
        object: "media",
        workspace,
        filename,
        mime: mime || Bun.file(filename).type,
        size,
        url: Media.url(id, filename),
        created: Temporal.Now.instant(),
      });
    } catch (e) {
      await this.mediaRepository.deleteFile({ id, workspace });
      throw e;
    }
  }

  public async open(user: User, id: string): Promise<{ media: Media; file: Bun.BunFile }> {
    const media = await this.mediaRepository.find(id);
    if (!media) {
      throw MediaError.not_found({ id });
    }
    await this.workspaceService.require(user, media.workspace, "read").catch((err) => {
      throw Yexception.isInstance(err) && WorkspaceError.not_found.matches(err) ? MediaError.not_found({ id }) : err;
    });
    return { media, file: this.mediaRepository.file(media) };
  }

  /** Deletes uploads unlinked for a day: until then an undo, or a cut-and-paste, can still bring the link back. */
  public async sweep(now: Temporal.Instant = Temporal.Now.instant()): Promise<Media[]> {
    await this.mediaRepository.markReferences(now);
    const unused = await this.mediaRepository.findUnreferencedSince(now.subtract(MediaService.GRACE));
    for (const media of unused) {
      await this.mediaRepository.delete(media.id);
      await this.mediaRepository.deleteFile(media);
    }
    return unused;
  }

  public startSweeping = () => {
    const sweep = () =>
      this.sweep().then(
        (unused) => unused.length > 0 && this.log.info(`Deleted ${unused.length} unused upload(s): ${unused.map(({ url }) => url).join(", ")}`),
        (err) => this.log.error("Sweeping unused uploads failed", err),
      );
    void sweep();
    this.sweeper ??= setInterval(sweep, MediaService.SWEEP_INTERVAL_MS);
  };

  public async purge(): Promise<void> {
    await this.mediaRepository.deleteAll();
  }
}

export namespace MediaService {
  export const GRACE = Temporal.Duration.from({ hours: 24 });
  export const SWEEP_INTERVAL_MS = 10 * 60 * 1_000;

  export const Upload = z
    .object({
      filename: z.string().transform(sanitizeFilename).pipe(z.string().min(1)),
      // browsers send an empty type for what they don't recognize
      mime: z
        .string()
        .optional()
        .transform((mime) => mime?.split(";")[0]?.trim() ?? ""),
    })
    .catch((e) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });

  /** The filename becomes a path segment on disk: no separators, no leading dots. */
  export function sanitizeFilename(filename: string): string {
    return filename
      .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
      .replace(/^[.\s]+/, "")
      .trim()
      .slice(-200);
  }
}
