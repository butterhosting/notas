import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { TestFixture } from "@/testing/TestFixture.test";
import { beforeEach, describe, expect, it } from "bun:test";
import { PersistenceError } from "./error/PersistenceError";
import { PageRepository } from "./PageRepository";

describe(PageRepository.name, () => {
  let context: TestEnvironment.Context;
  let repository: PageRepository;

  const WORKSPACE = TestFixture.WORKSPACE;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    repository = context.pageRepository;
    await context.persistWorkspace();
  });

  it("should do simple crud", async () => {
    // given
    const groceries = TestFixture.page({ title: "Groceries", position: 2 });
    const journal = TestFixture.page({ title: "Journal", position: 1, icon: "📓", cover: { src: "preset:sunset", y: 30 } });

    // when
    await repository.create(groceries);
    await repository.create(journal);
    // then
    const list = await repository.list(WORKSPACE);
    expect(list.map(({ title }) => title)).toEqual(["Journal", "Groceries"]);
    expect(list[0]).not.toHaveProperty("markdown");
    expect(list[0]).toEqual(expect.objectContaining({ icon: "📓", cover: { src: "preset:sunset", y: 30 } }));
    expect(await repository.find(groceries.id)).toEqual(expect.objectContaining({ markdown: "- [ ] milk", revision: 1 }));
    expect(await repository.find("does-not-exist")).toBeUndefined();

    // when
    const updated = await repository.update(journal.id, { title: "Diary", icon: null, cover: null });
    // then
    expect(updated).toEqual(expect.objectContaining({ title: "Diary", icon: undefined, cover: undefined, revision: 1 }));
    expect(await repository.update("does-not-exist", { title: "Nope" })).toBeUndefined();

    // when
    const deleted = await repository.delete(groceries.id);
    // then
    expect(deleted?.id).toEqual(groceries.id);
    expect(await repository.list(WORKSPACE)).toEqual([expect.objectContaining({ title: "Diary" })]);
    expect(await repository.delete(groceries.id)).toBeUndefined();
  });

  it("should only update the body at the expected revision", async () => {
    // given
    const page = TestFixture.page({ revision: 4 });
    await repository.create(page);

    // when
    const stale = await repository.update(page.id, { markdown: "stale" }, 3);
    // then
    expect(stale).toBeUndefined();
    expect((await repository.find(page.id))?.markdown).toEqual("- [ ] milk");

    // when
    const fresh = await repository.update(page.id, { markdown: "fresh" }, 4);
    // then
    expect(fresh).toEqual(expect.objectContaining({ markdown: "fresh", revision: 5 }));
  });

  it("should cascade a delete to every descendant", async () => {
    // given
    const root = TestFixture.page({ title: "Root" });
    const child = TestFixture.page({ title: "Child", parent: root.id });
    const grandchild = TestFixture.page({ title: "Grandchild", parent: child.id });
    const unrelated = TestFixture.page({ title: "Unrelated" });
    for (const page of [root, child, grandchild, unrelated]) {
      await repository.create(page);
    }

    // when
    await repository.delete(root.id);
    // then
    expect((await repository.list(WORKSPACE)).map(({ title }) => title)).toEqual(["Unrelated"]);
  });

  it("should keep workspaces apart, and go when their workspace goes", async () => {
    // given
    const other = (await context.persistWorkspace(Bun.randomUUIDv7())).workspace;
    await repository.create(TestFixture.page({ title: "Mine", markdown: "shared word" }));
    await repository.create(TestFixture.page({ workspace: other, title: "Theirs", markdown: "shared word" }));

    // then
    expect((await repository.list(WORKSPACE)).map(({ title }) => title)).toEqual(["Mine"]);
    expect((await repository.search(other, ["shared"], 10)).length).toEqual(1);

    // when
    await context.workspaceRepository.delete(other);
    // then
    expect(await repository.list(other)).toEqual([]);
    expect(await repository.search(other, ["shared"], 10)).toEqual([]);
  });

  it("should refuse a page in a workspace that doesn't exist", async () => {
    // when
    const action = () => repository.create(TestFixture.page({ workspace: Bun.randomUUIDv7() }));
    // then
    await expect(action()).rejects.toEqual(new PersistenceError("foreign_key_violation"));
  });

  it("should refuse a parent that doesn't exist", async () => {
    // when
    const action = () => repository.create(TestFixture.page({ parent: Bun.randomUUIDv7() }));
    // then
    await expect(action()).rejects.toEqual(new PersistenceError("foreign_key_violation"));
  });

  it("should keep the search index in step with the pages", async () => {
    // given
    const lisbon = TestFixture.page({ title: "Trip to Lisbon", markdown: "Remember the **tram**! Pastéis de nata." });
    const porto = TestFixture.page({ title: "Porto", markdown: "A tram to the beach, near Lisbon." });
    await repository.create(lisbon);
    await repository.create(porto);

    // then
    expect((await repository.search(WORKSPACE, ["lisbon"], 10)).map(({ id }) => id)).toEqual([lisbon.id, porto.id]);
    expect(await repository.search(WORKSPACE, ["paste"], 10)).toEqual([{ id: lisbon.id, snippet: "Remember the **tram**! \u0002Pastéis\u0003 de nata." }]);
    expect(await repository.search(WORKSPACE, ["tram", "beach"], 10)).toEqual([expect.objectContaining({ id: porto.id })]);
    expect(await repository.search(WORKSPACE, ['"; drop table page; --'], 10)).toEqual([]);

    // when
    await repository.update(lisbon.id, { title: "Trip to Madrid", markdown: "Churros." });
    await repository.delete(porto.id);
    // then
    expect(await repository.search(WORKSPACE, ["lisbon"], 10)).toEqual([]);
    expect(await repository.search(WORKSPACE, ["churros"], 10)).toEqual([expect.objectContaining({ id: lisbon.id })]);
  });
});
