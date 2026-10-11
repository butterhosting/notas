import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { TestFixture } from "@/testing/TestFixture.test";
import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it } from "bun:test";
import { readdir } from "fs/promises";
import { join } from "path";
import { MediaRepository } from "./MediaRepository";

describe(MediaRepository.name, () => {
  let context: TestEnvironment.Context;
  let repository: MediaRepository;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    repository = context.mediaRepository;
    await context.persistWorkspace();
  });

  it("should store the bytes on disk and the metadata in the database", async () => {
    // given
    const media = TestFixture.media({ filename: "notes.txt", mime: "text/plain" });

    // when
    const { size } = await repository.writeFile(media, new Response("hello world").body!);
    await repository.create({ ...media, size });
    // then
    expect(size).toEqual(11);
    expect(await Bun.file(join(context.env.NOTAS_MEDIA, media.workspace, media.id, "notes.txt")).text()).toEqual("hello world");
    const found = await repository.find(media.id);
    expect(found).toEqual(expect.objectContaining({ filename: "notes.txt", size: 11, url: `/media/${media.id}/notes.txt` }));
    expect(await repository.file(found!).text()).toEqual("hello world");
    expect(repository.file(found!).type).toStartWith("text/plain");
  });

  it("should delete a single file, a workspace's files, or everything", async () => {
    // given
    const other = (await context.persistWorkspace(Bun.randomUUIDv7())).workspace;
    const first = TestFixture.media();
    const second = TestFixture.media();
    const third = TestFixture.media({ workspace: other });
    for (const media of [first, second, third]) {
      await repository.writeFile(media, new Response("abc").body!);
      await repository.create(media);
    }

    // when
    await repository.deleteFile(first);
    // then
    expect(await readdir(join(context.env.NOTAS_MEDIA, TestFixture.WORKSPACE))).toEqual([second.id]);

    // when
    await repository.deleteWorkspaceFiles(other);
    // then
    expect(await readdir(context.env.NOTAS_MEDIA)).toEqual([TestFixture.WORKSPACE]);

    // when
    await repository.deleteAll();
    // then
    expect(await readdir(context.env.NOTAS_MEDIA)).toEqual([]);
    expect(await repository.find(second.id)).toBeUndefined();
  });

  describe("references", () => {
    const T0 = Temporal.Instant.from("2026-10-11T10:00:00Z");
    const T1 = Temporal.Instant.from("2026-10-11T10:10:00.123Z");
    const T2 = Temporal.Instant.from("2026-10-11T10:20:00Z");

    it("should count a link from any page: in its text or as its cover, trashed, or in another workspace", async () => {
      // given
      const other = (await context.persistWorkspace(Bun.randomUUIDv7())).workspace;
      const [text, cover, trashed, elsewhere, unused] = [1, 2, 3, 4, 5].map(() => TestFixture.media());
      for (const media of [text, cover, trashed, elsewhere, unused]) {
        await repository.create(media!);
      }
      await context.pageRepository.create(TestFixture.page({ markdown: `![cat](${text!.url})` }));
      await context.pageRepository.create(TestFixture.page({ markdown: "", cover: { src: cover!.url, y: 50 } }));
      await context.pageRepository.create(TestFixture.page({ markdown: `::video{src="${trashed!.url}"}`, deleted: T0 }));
      await context.pageRepository.create(TestFixture.page({ workspace: other, markdown: `[clip](${elsewhere!.url})` }));

      // when
      await repository.markReferences(T0);
      // then
      expect((await repository.findUnreferencedSince(T0)).map(({ id }) => id)).toEqual([unused!.id]);
    });

    it("should keep when a file was first found unused, and forget it once a page links to it again", async () => {
      // given
      const media = TestFixture.media();
      await repository.create(media);

      // when
      await repository.markReferences(T0);
      await repository.markReferences(T1);
      // then
      expect(await repository.findUnreferencedSince(T0)).toHaveLength(1);

      // when
      const page = await context.pageRepository.create(TestFixture.page({ markdown: `![cat](${media.url})` }));
      await repository.markReferences(T1);
      // then
      expect(await repository.findUnreferencedSince(T2)).toEqual([]);

      // when
      await context.pageRepository.update(page.id, { markdown: "" });
      await repository.markReferences(T1);
      // then
      expect(await repository.findUnreferencedSince(T0)).toEqual([]);
      expect(await repository.findUnreferencedSince(T1)).toHaveLength(1);
    });

    it("should delete a single row", async () => {
      // given
      const media = TestFixture.media();
      await repository.create(media);

      // when
      await repository.delete(media.id);
      // then
      expect(await repository.find(media.id)).toBeUndefined();
    });
  });
});
