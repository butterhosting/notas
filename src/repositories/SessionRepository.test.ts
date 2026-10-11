import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it } from "bun:test";
import { SessionRepository } from "./SessionRepository";

describe(SessionRepository.name, () => {
  let context: TestEnvironment.Context;
  let repository: SessionRepository;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    repository = context.sessionRepository;
  });

  it("should keep, extend and forget sessions", async () => {
    // given
    const { user } = await context.persistWorkspace();
    const now = Temporal.Now.instant();
    await repository.create({ id: "admin", expires: now.add({ hours: 1 }), created: now });
    await repository.create({ id: "user", user: user.id, expires: now.add({ hours: 1 }), created: now });
    await repository.create({ id: "expired", user: user.id, expires: now.subtract({ hours: 1 }), created: now });

    // then
    expect(await repository.find("admin")).toEqual(expect.objectContaining({ user: undefined }));
    expect(await repository.find("user")).toEqual(expect.objectContaining({ user: user.id }));

    // when
    await repository.extend("user", now.add({ hours: 5 }));
    await repository.deleteExpired(now);
    // then
    expect((await repository.find("user"))?.expires.toString()).toEqual(now.add({ hours: 5 }).toString());
    expect(await repository.find("expired")).toBeUndefined();

    // when
    await repository.deleteForUser(user.id);
    // then
    expect(await repository.find("user")).toBeUndefined();
    expect(await repository.find("admin")).toBeDefined();
  });
});
