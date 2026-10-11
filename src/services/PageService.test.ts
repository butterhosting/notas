import { ServerError } from "@/errors/ServerError";
import { WorkspaceError } from "@/errors/WorkspaceError";
import { Event } from "@/events/Event";
import { Page } from "@/models/Page";
import { User } from "@/models/User";
import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { TestFixture } from "@/testing/TestFixture.test";
import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it } from "bun:test";
import { PageService } from "./PageService";

describe(PageService.name, () => {
  let context: TestEnvironment.Context;
  let service: PageService;
  let events: Event[];
  let user: User;
  const WORKSPACE = TestFixture.WORKSPACE;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    service = new PageService(context.pageRepositoryMock.cast(), context.workspaceServiceMock.cast(), context.eventBus);
    events = [];
    context.eventBus.subscribe("*", (event) => events.push(event));
    user = TestFixture.user();
    context.workspaceServiceMock.require.mockResolvedValue(TestFixture.workspace());
  });

  describe("access", () => {
    it("should ask for read access to read, write access to write, and ownership to delete for good", async () => {
      // given
      const page = TestFixture.page({ deleted: Temporal.Now.instant() });
      context.pageRepositoryMock.find.mockResolvedValue(page);
      context.pageRepositoryMock.list.mockResolvedValue([page]);
      context.pageRepositoryMock.update.mockImplementation(async (_id, patch) => ({ ...page, ...patch }) as Page);
      context.pageRepositoryMock.delete.mockResolvedValue(page);

      // when
      await service.find(user, page.id);
      await service.restore(user, page.id);
      await service.delete(user, page.id);
      // then
      expect(context.workspaceServiceMock.require.mock.calls.map(([, workspace, need]) => [workspace, need])).toEqual([
        [WORKSPACE, "read"],
        [WORKSPACE, "write"],
        [WORKSPACE, "owner"],
      ]);
    });

    it("should not even admit a page exists to someone without access to its workspace", async () => {
      // given
      context.pageRepositoryMock.find.mockResolvedValue(TestFixture.page({ id: "abc123" }));
      context.workspaceServiceMock.require.mockRejectedValue(WorkspaceError.not_found({ id: WORKSPACE }));

      // then
      await expect(service.find(user, "abc123")).rejects.toEqual(expect.objectContaining({ problem: "PageError::not_found", details: { id: "abc123" } }));
    });

    it("should refuse a reader who tries to write", async () => {
      // given
      context.pageRepositoryMock.find.mockResolvedValue(TestFixture.page());
      context.workspaceServiceMock.require.mockImplementation(async (_user, _workspace, need) => {
        if (need !== "read") throw ServerError.forbidden();
        return TestFixture.workspace({ role: "read" });
      });

      // then
      await expect(service.update(user, "abc123", { title: "Nope" })).rejects.toEqual(expect.objectContaining({ problem: "ServerError::forbidden" }));
      expect(context.pageRepositoryMock.update).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("should put a new page after its last sibling, and publish an event", async () => {
      // given
      const parent = TestFixture.page();
      context.pageRepositoryMock.list.mockResolvedValue([
        parent,
        TestFixture.page({ parent: parent.id, position: 3 }),
        TestFixture.page({ parent: parent.id, position: 7.5 }),
        TestFixture.page({ position: 100 }), // not a sibling
      ]);
      context.pageRepositoryMock.create.mockImplementation(async (page: Page) => page);

      // when
      const page = await service.create(user, WORKSPACE, { parent: parent.id, title: "Child" });
      // then
      expect(page).toEqual(
        expect.objectContaining({ object: "page", workspace: WORKSPACE, parent: parent.id, position: 8.5, title: "Child", markdown: "", revision: 1 }),
      );
      expect(events).toEqual([expect.objectContaining({ type: Event.Type.page_created, data: { page } })]);
    });

    it("should refuse a parent that isn't a page in the same workspace", async () => {
      // given
      const parent = Bun.randomUUIDv7();
      context.pageRepositoryMock.list.mockResolvedValue([]);

      // when
      const action = () => service.create(user, WORKSPACE, { parent });
      // then
      await expect(action()).rejects.toEqual(expect.objectContaining({ problem: "PageError::parent_not_found", details: { parent } }));
      expect(context.pageRepositoryMock.create).not.toHaveBeenCalled();
    });

    it("should reject an invalid request body", async () => {
      // when
      const action = () => service.create(user, WORKSPACE, { icon: "", cover: { src: "preset:sunset", y: 101 } });
      // then
      await expect(action()).rejects.toEqual(
        expect.objectContaining({
          problem: "ServerError::invalid_request_body",
          details: {
            issues: [
              { field: "icon", description: "too_small" },
              { field: "cover.y", description: "too_big" },
            ],
          },
        }),
      );
      expect(context.pageRepositoryMock.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("should require the revision a new body is based on", async () => {
      // when
      const action = () => service.update(user, "abc123", { markdown: "# Hi" });
      // then
      await expect(action()).rejects.toEqual(
        expect.objectContaining({
          problem: "ServerError::invalid_request_body",
          details: { issues: [{ field: "revision", description: "custom" }] },
        }),
      );
      expect(context.pageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it("should pass the revision on, and report a conflict with the current one", async () => {
      // given
      const existing = TestFixture.page({ revision: 9 });
      context.pageRepositoryMock.update.mockResolvedValue(undefined);
      context.pageRepositoryMock.find.mockResolvedValue(existing);

      // when
      const action = () => service.update(user, existing.id, { markdown: "# Hi", revision: 8 });
      // then
      await expect(action()).rejects.toEqual(expect.objectContaining({ problem: "PageError::revision_conflict", details: { id: existing.id, revision: 9 } }));
      const [, , revision] = context.pageRepositoryMock.update.mock.calls[0]!;
      expect(revision).toEqual(8);
      expect(events).toEqual([]);
    });

    it("should throw when the page doesn't exist", async () => {
      // given
      context.pageRepositoryMock.find.mockResolvedValue(undefined);

      // when
      const action = () => service.update(user, "abc123", { title: "Nope" });
      // then
      await expect(action()).rejects.toEqual(expect.objectContaining({ problem: "PageError::not_found", details: { id: "abc123" } }));
    });

    it("should refuse to move a page under itself or its descendants", async () => {
      // given
      const page = TestFixture.page();
      const child = TestFixture.page({ parent: page.id });
      const grandchild = TestFixture.page({ parent: child.id });
      context.pageRepositoryMock.find.mockResolvedValue(page);
      context.pageRepositoryMock.list.mockResolvedValue([page, child, grandchild]);

      // then
      for (const parent of [page.id, grandchild.id]) {
        await expect(service.update(user, page.id, { parent })).rejects.toEqual(
          expect.objectContaining({ problem: "PageError::parent_is_descendant", details: { id: page.id, parent } }),
        );
      }
      expect(context.pageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it("should move a page after its new siblings, and clear what is null", async () => {
      // given
      const page = TestFixture.page({ parent: Bun.randomUUIDv7() });
      const sibling = TestFixture.page({ position: 4 });
      context.pageRepositoryMock.find.mockResolvedValue(page);
      context.pageRepositoryMock.list.mockResolvedValue([page, sibling]);
      context.pageRepositoryMock.update.mockImplementation(async (_id, patch) => ({ ...page, ...patch }) as Page);

      // when
      await service.update(user, page.id, { parent: null, icon: null });
      // then
      const [, patch, revision] = context.pageRepositoryMock.update.mock.calls[0]!;
      expect(patch).toEqual(expect.objectContaining({ parent: null, position: 5, icon: null }));
      expect(revision).toBeUndefined();
      expect(events).toEqual([expect.objectContaining({ type: Event.Type.page_updated })]);
    });

    it("should move a page to the trash, or back, with `deleted`, which goes alone", async () => {
      // given
      const page = TestFixture.page();
      context.pageRepositoryMock.find.mockResolvedValue(page);
      context.pageRepositoryMock.list.mockResolvedValue([page]);
      context.pageRepositoryMock.update.mockImplementation(async (_id, patch) => ({ ...page, ...patch }) as Page);

      // when
      await service.update(user, page.id, { deleted: true });
      // then
      expect(events).toEqual([expect.objectContaining({ type: Event.Type.page_trashed })]);
      await expect(service.update(user, page.id, { deleted: false, title: "Both" })).rejects.toEqual(
        expect.objectContaining({ problem: "ServerError::invalid_request_body", details: { issues: [{ field: "deleted", description: "custom" }] } }),
      );
    });

    it("should refuse to edit a page in the trash", async () => {
      // given
      context.pageRepositoryMock.find.mockResolvedValue(TestFixture.page({ deleted: Temporal.Now.instant() }));

      // when
      const action = () => service.update(user, "abc123", { title: "Nope" });
      // then
      await expect(action()).rejects.toEqual(expect.objectContaining({ problem: "PageError::in_trash" }));
      expect(context.pageRepositoryMock.update).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("should leave out the trash, and everything under it", async () => {
      // given
      const trashed = TestFixture.page({ title: "Trashed", deleted: Temporal.Now.instant() });
      const under = TestFixture.page({ title: "Under", parent: trashed.id });
      context.pageRepositoryMock.list.mockResolvedValue([TestFixture.page({ title: "Kept" }), trashed, under]);

      // then
      expect((await service.list(user, WORKSPACE)).map(({ title }) => title)).toEqual(["Kept"]);
      expect((await service.listTrash(user, WORKSPACE)).map(({ title }) => title)).toEqual(["Trashed"]);
      expect(context.pageRepositoryMock.list.mock.calls.every(([workspace]) => workspace === WORKSPACE)).toBeTrue();
    });
  });

  describe("trash", () => {
    it("should mark the page, and report every descendant that went with it", async () => {
      // given
      const page = TestFixture.page();
      const child = TestFixture.page({ parent: page.id });
      context.pageRepositoryMock.find.mockResolvedValue(page);
      context.pageRepositoryMock.list.mockResolvedValue([page, child, TestFixture.page()]);
      context.pageRepositoryMock.update.mockImplementation(async (_id, patch) => ({ ...page, ...patch }) as Page);

      // when
      const trashed = await service.trash(user, page.id);
      // then
      expect(trashed.deleted).toBeDefined();
      expect(events).toEqual([expect.objectContaining({ type: Event.Type.page_trashed, data: { page: trashed, ids: [page.id, child.id] } })]);
    });

    it("should refuse what's already in the trash, or under it", async () => {
      // given
      const page = TestFixture.page({ deleted: Temporal.Now.instant() });
      const child = TestFixture.page({ parent: page.id });
      context.pageRepositoryMock.list.mockResolvedValue([page, child]);

      // then
      for (const existing of [page, child]) {
        context.pageRepositoryMock.find.mockResolvedValue(existing);
        await expect(service.trash(user, existing.id)).rejects.toEqual(expect.objectContaining({ problem: "PageError::in_trash", details: { id: existing.id } }));
      }
    });
  });

  describe("restore", () => {
    it("should bring a page back where it was, with what's under it", async () => {
      // given
      const parent = TestFixture.page();
      const page = TestFixture.page({ parent: parent.id, deleted: Temporal.Now.instant() });
      const child = TestFixture.page({ parent: page.id });
      context.pageRepositoryMock.find.mockResolvedValue(page);
      context.pageRepositoryMock.list.mockResolvedValueOnce([parent, page, child]);
      context.pageRepositoryMock.list.mockResolvedValue([parent, { ...page, deleted: undefined }, child]);
      context.pageRepositoryMock.update.mockImplementation(async (_id, patch) => ({ ...page, ...patch, deleted: undefined }) as Page);

      // when
      await service.restore(user, page.id);
      // then
      const [, patch] = context.pageRepositoryMock.update.mock.calls[0]!;
      expect(patch).toEqual({ deleted: null });
      expect(events).toEqual([
        expect.objectContaining({
          type: Event.Type.page_restored,
          data: expect.objectContaining({ pages: [expect.objectContaining({ id: page.id }), expect.objectContaining({ id: child.id })] }),
        }),
      ]);
    });

    it("should bring a page back at the top level when its parent is in the trash too", async () => {
      // given
      const parent = TestFixture.page({ deleted: Temporal.Now.instant() });
      const page = TestFixture.page({ parent: parent.id, deleted: Temporal.Now.instant() });
      context.pageRepositoryMock.find.mockResolvedValue(page);
      context.pageRepositoryMock.list.mockResolvedValue([parent, page, TestFixture.page({ position: 3 })]);
      context.pageRepositoryMock.update.mockImplementation(async (_id, patch) => ({ ...page, ...patch }) as Page);

      // when
      await service.restore(user, page.id);
      // then
      const [, patch] = context.pageRepositoryMock.update.mock.calls[0]!;
      expect(patch).toEqual({ deleted: null, parent: null, position: 4 });
    });

    it("should refuse a page that isn't in the trash", async () => {
      // given
      context.pageRepositoryMock.find.mockResolvedValue(TestFixture.page());

      // then
      await expect(service.restore(user, "abc123")).rejects.toEqual(expect.objectContaining({ problem: "PageError::not_in_trash" }));
    });
  });

  describe("delete", () => {
    it("should only delete what's in the trash, and report every descendant the delete cascaded to", async () => {
      // given
      const page = TestFixture.page({ deleted: Temporal.Now.instant() });
      const child = TestFixture.page({ parent: page.id });
      const kept = TestFixture.page();
      context.pageRepositoryMock.list.mockResolvedValue([page, child, kept]);
      context.pageRepositoryMock.delete.mockResolvedValue(page);

      // when
      context.pageRepositoryMock.find.mockResolvedValue(kept);
      // then
      await expect(service.delete(user, kept.id)).rejects.toEqual(expect.objectContaining({ problem: "PageError::not_in_trash" }));

      // when
      context.pageRepositoryMock.find.mockResolvedValue(page);
      await service.delete(user, page.id);
      // then
      expect(events).toEqual([expect.objectContaining({ type: Event.Type.page_deleted, data: { page, ids: [page.id, child.id] } })]);
    });
  });

  describe("search", () => {
    it("should search the workspace for every word as a prefix, outside the trash", async () => {
      // given
      const page = TestFixture.page({ title: "Lisbon" });
      const trashed = TestFixture.page({ deleted: Temporal.Now.instant() });
      context.pageRepositoryMock.list.mockResolvedValue([page, trashed]);
      context.pageRepositoryMock.search.mockResolvedValue([
        { id: trashed.id, snippet: "nope" },
        { id: page.id, snippet: "Remember the **\u0002tram\u0003**!" },
      ]);

      // when
      const results = await service.search(user, WORKSPACE, '  Tram, "Pastéis"!  ');
      // then
      const [workspace, terms] = context.pageRepositoryMock.search.mock.calls[0]!;
      expect([workspace, terms]).toEqual([WORKSPACE, ["tram", "pastéis"]]);
      expect(results).toEqual([{ object: "search_result", page, snippet: "Remember the \u0002tram\u0003!" }]);
    });
  });

  describe("plainSnippet", () => {
    it("should leave the text, without the markdown around it", () => {
      // then
      expect(PageService.plainSnippet('- [ ] **milk**\n## Shops\n:::callout{icon="💡"}\nAt `the` [corner](https://x.y)')).toEqual("milk Shops At the corner");
      expect(PageService.plainSnippet('::::toggle[Open *me*]{level="2"}\nInside')).toEqual("Open *me* Inside");
      // markers inside a directive's name; inline code that looks like markdown
      expect(PageService.plainSnippet("others.\n\n---\n\n## Toggles\n\n:::\u0002toggle\u0003[Click]\nHidden")).toEqual("others. Toggles Click Hidden");
      expect(PageService.plainSnippet("are directives, `::video`, `::audio` and `**bold**`.")).toEqual("are directives, ::video, ::audio and **bold**.");
      expect(PageService.plainSnippet("Nesting\n\n::::toggle[A \u0002toggle\u0003…")).toEqual("Nesting A \u0002toggle\u0003…");
    });
  });

  describe("export", () => {
    it("should put the metadata in the frontmatter", async () => {
      // given
      context.pageRepositoryMock.find.mockResolvedValue(
        TestFixture.page({ title: 'Say "hi"', icon: "👋", cover: { src: "/media/x/a.png", y: 20 }, markdown: "Hello" }),
      );

      // when
      const { filename, markdown } = await service.export(user, "abc123");
      // then
      expect(filename).toEqual("Say hi.md");
      expect(markdown).toEqual(["---", 'title: "Say \\"hi\\""', 'icon: "👋"', 'cover: { src: "/media/x/a.png", y: 20 }', "---", "", "Hello"].join("\n"));
    });
  });
});
