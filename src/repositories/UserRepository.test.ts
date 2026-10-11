import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { TestFixture } from "@/testing/TestFixture.test";
import { beforeEach, describe, expect, it } from "bun:test";
import { PersistenceError } from "./error/PersistenceError";
import { UserRepository } from "./UserRepository";

describe(UserRepository.name, () => {
  let context: TestEnvironment.Context;
  let repository: UserRepository;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    repository = context.userRepository;
  });

  it("should do simple crud, and keep the hash to itself", async () => {
    // given
    const kim = TestFixture.user({ username: "kim" });

    // when
    await repository.create(kim, "hash-of-kim");
    // then
    expect(await repository.list()).toEqual([expect.objectContaining({ username: "kim" })]);
    expect(await repository.find(kim.id)).not.toHaveProperty("passwordHash");
    expect(await repository.findByUsername("kim")).toEqual(expect.objectContaining({ id: kim.id }));
    expect(await repository.findWithPasswordHash("kim")).toEqual({ user: expect.objectContaining({ id: kim.id }), passwordHash: "hash-of-kim" });
    expect(await repository.findWithPasswordHash("nobody")).toBeUndefined();

    // when
    await repository.update(kim.id, { username: "kimberly" }, "new-hash");
    // then
    expect(await repository.findWithPasswordHash("kimberly")).toEqual(expect.objectContaining({ passwordHash: "new-hash" }));

    // when
    await repository.update(kim.id, { username: "kimmy" });
    // then
    expect(await repository.findWithPasswordHash("kimmy")).toEqual(expect.objectContaining({ passwordHash: "new-hash" }));
  });

  it("should refuse a username that's taken", async () => {
    // given
    await repository.create(TestFixture.user({ username: "kim" }), "hash");

    // when
    const action = () => repository.create(TestFixture.user({ username: "kim" }), "hash");
    // then
    await expect(action()).rejects.toEqual(new PersistenceError("unique_violation"));
  });

  it("should take everything a user owns along when they're deleted", async () => {
    // given
    const { user, workspace } = await context.persistWorkspace();
    await context.pageRepository.create(TestFixture.page({ workspace }));
    await context.sessionRepository.create({ id: "session", user: user.id, expires: user.created, created: user.created });

    // when
    await repository.delete(user.id);
    // then
    expect(await context.workspaceRepository.findFor(workspace, user.id)).toBeUndefined();
    expect(await context.pageRepository.list(workspace)).toEqual([]);
    expect(await context.sessionRepository.find("session")).toBeUndefined();
  });
});
