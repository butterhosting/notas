import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { TestFixture } from "@/testing/TestFixture.test";
import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it } from "bun:test";
import { PersistenceError } from "./error/PersistenceError";
import { WorkspaceRepository } from "./WorkspaceRepository";

describe(WorkspaceRepository.name, () => {
  let context: TestEnvironment.Context;
  let repository: WorkspaceRepository;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    repository = context.workspaceRepository;
  });

  it("should show each user their own and shared workspaces, with their role in each", async () => {
    // given
    const { user: kim, workspace: kims } = await context.persistWorkspace();
    const { user: lee, workspace: lees } = await context.persistWorkspace(Bun.randomUUIDv7());
    const { user: max } = await context.persistWorkspace(Bun.randomUUIDv7());
    const now = Temporal.Now.instant();
    await repository.setMember({ workspace: kims, user: lee.id, role: "read", created: now });
    await repository.setMember({ workspace: kims, user: max.id, role: "read", created: now });
    // then
    await repository.setMember({ workspace: kims, user: max.id, role: "write", created: now });

    // then
    expect((await repository.listFor(kim.id)).map(({ id, role, owner }) => [id, role, owner.username])).toEqual([[kims, "owner", kim.username]]);
    expect((await repository.listFor(lee.id)).map(({ id, role }) => [id, role])).toEqual([
      [kims, "read"],
      [lees, "owner"],
    ]);
    expect((await repository.findFor(kims, max.id))?.role).toEqual("write");
    expect(await repository.findFor(lees, kim.id)).toBeUndefined();
    expect((await repository.members(kims)).map(({ user, role }) => [user.username, role]).toSorted()).toEqual(
      [
        [lee.username, "read"],
        [max.username, "write"],
      ].toSorted(),
    );
    expect((await repository.audience(kims)).toSorted()).toEqual([kim.id, lee.id, max.id].toSorted());

    // when
    await repository.removeMember(kims, lee.id);
    // then
    expect(await repository.findFor(kims, lee.id)).toBeUndefined();
  });

  it("should keep names unique per owner only", async () => {
    // given
    const { user: kim } = await context.persistWorkspace();
    const { user: lee } = await context.persistWorkspace(Bun.randomUUIDv7());
    const now = Temporal.Now.instant();
    await repository.create({ id: Bun.randomUUIDv7(), owner: kim.id, name: "Notes", created: now });

    // when
    await repository.create({ id: Bun.randomUUIDv7(), owner: lee.id, name: "Notes", created: now });
    const action = () => repository.create({ id: Bun.randomUUIDv7(), owner: kim.id, name: "Notes", created: now });
    // then
    await expect(action()).rejects.toEqual(new PersistenceError("unique_violation"));
  });

  it("should take pages and memberships along when a workspace is deleted", async () => {
    // given
    const { workspace } = await context.persistWorkspace();
    const { user: lee } = await context.persistWorkspace(Bun.randomUUIDv7());
    await repository.setMember({ workspace, user: lee.id, role: "read", created: Temporal.Now.instant() });
    await context.pageRepository.create(TestFixture.page({ workspace }));

    // when
    await repository.delete(workspace);
    // then
    expect(await repository.listFor(lee.id)).toHaveLength(1);
    expect(await context.pageRepository.list(workspace)).toEqual([]);
  });
});
