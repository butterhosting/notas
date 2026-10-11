import { Initialize } from "@/Initialize";
import { Session } from "@/models/internal/Session";
import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { TestFixture } from "@/testing/TestFixture.test";
import { Temporal } from "@js-temporal/polyfill";
import { afterEach, beforeEach, describe, expect, it, jest, Mock, setSystemTime, spyOn } from "bun:test";
import { AuthService } from "./AuthService";

describe(AuthService.name, () => {
  let context: TestEnvironment.Context;
  let service: AuthService;
  let warn: Mock<typeof console.warn>;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    service = new AuthService(context.env, context.sessionRepositoryMock.cast(), context.userRepositoryMock.cast());
    context.sessionRepositoryMock.create.mockImplementation(async (session: Session) => session);
    warn = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    setSystemTime();
  });

  it("should forget the admin's sessions at startup, since only a restart can change their password", async () => {
    // when
    await Initialize.runAll(service);
    // then
    expect(context.sessionRepositoryMock.deleteAdmin).toHaveBeenCalledTimes(1);
  });

  describe("login", () => {
    it("should log the admin in with the password from the environment", async () => {
      // when
      const { token, me } = await service.login({ username: " Admin ", password: TestEnvironment.ADMIN_PASSWORD });
      // then
      expect(me).toEqual({ object: "me", kind: "admin" });
      const [session] = context.sessionRepositoryMock.create.mock.calls[0]!;
      expect(session).toEqual(expect.objectContaining({ id: AuthService.hash(token), user: undefined }));
      expect(session.id).not.toEqual(token);
    });

    it("should log a user in, with a session of 30 days", async () => {
      // given
      const user = TestFixture.user({ username: "kim" });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash: await Bun.password.hash("secret-kim", { algorithm: "bcrypt", cost: 4 }) });

      // when
      const { me } = await service.login({ username: "KIM", password: "secret-kim" });
      // then
      expect(me).toEqual({ object: "me", kind: "user", user });
      expect(context.userRepositoryMock.findWithPasswordHash).toHaveBeenCalledWith("kim");
      const [session] = context.sessionRepositoryMock.create.mock.calls[0]!;
      expect(Math.round(session.expires.since(session.created).total("days"))).toEqual(30);
      expect(context.sessionRepositoryMock.deleteExpired).toHaveBeenCalled();
    });

    it("should refuse a wrong password and an unknown user alike", async () => {
      // given
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValueOnce({
        user: TestFixture.user(),
        passwordHash: await Bun.password.hash("right", { algorithm: "bcrypt", cost: 4 }),
      });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValueOnce(undefined);

      // then
      for (const credentials of [{ username: "kim", password: "wrong" }, { username: "nobody", password: "whatever" }, { username: "admin", password: "wrong" }]) {
        await expect(service.login(credentials)).rejects.toEqual(expect.objectContaining({ problem: "AuthError::invalid_credentials" }));
      }
      expect(context.sessionRepositoryMock.create).not.toHaveBeenCalled();
    });

    it("should log a failed login with the username quoted, so it can't forge a line of its own", async () => {
      // when
      await service.login({ username: "kim\nforged", password: "wrong" }, "10.0.0.7").catch(() => {});
      // then
      expect(String(warn.mock.calls[0]!.at(-1))).toEqual('Failed login for "kim\\nforged" from 10.0.0.7');
    });
  });

  describe("throttle", () => {
    const tooMany = (retryAfter: number) => expect.objectContaining({ problem: "AuthError::too_many_attempts", details: { retryAfter } });

    it("should hold a username up after five failed attempts, twice as long each time, whoever the username is", async () => {
      // given
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue(undefined);
      setSystemTime(new Date("2026-10-11T10:00:00Z"));
      for (let i = 0; i < 5; i++) {
        await expect(service.login({ username: "nobody", password: `guess ${i}` })).rejects.toEqual(expect.objectContaining({ problem: "AuthError::invalid_credentials" }));
      }

      // then
      await expect(service.login({ username: "nobody", password: "guess 5" })).rejects.toEqual(tooMany(1));
      await expect(service.login({ username: "somebody", password: "guess" })).rejects.toEqual(expect.objectContaining({ problem: "AuthError::invalid_credentials" }));

      // when
      setSystemTime(new Date("2026-10-11T10:00:01Z"));
      await service.login({ username: "nobody", password: "guess 6" }).catch(() => {});
      // then
      await expect(service.login({ username: "nobody", password: "guess 7" })).rejects.toEqual(tooMany(2));
    });

    it("should count a burst of parallel guesses before any password is checked", async () => {
      // given
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user: TestFixture.user(), passwordHash: await Bun.password.hash("right", { algorithm: "bcrypt", cost: 4 }) });
      const verify = spyOn(Bun.password, "verify");

      // when
      const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => service.login({ username: "kim", password: `guess ${i}` })));
      // then
      expect(verify).toHaveBeenCalledTimes(5);
      expect(results.filter((result) => result.status === "rejected" && result.reason.problem === "AuthError::too_many_attempts")).toHaveLength(15);
    });

    it("should forget the failures once the right password comes in", async () => {
      // given
      const user = TestFixture.user({ username: "kim" });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash: await Bun.password.hash("right", { algorithm: "bcrypt", cost: 4 }) });
      for (let i = 0; i < 4; i++) {
        await service.login({ username: "kim", password: "wrong" }).catch(() => {});
      }

      // when
      await service.login({ username: "kim", password: "right" });
      // then
      for (let i = 0; i < 5; i++) {
        await expect(service.login({ username: "kim", password: "wrong" })).rejects.toEqual(expect.objectContaining({ problem: "AuthError::invalid_credentials" }));
      }
    });

    it("should wait 15 minutes at most, and forget a username left alone for an hour", async () => {
      // given
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue(undefined);
      let now = Temporal.Instant.from("2026-10-11T10:00:00Z");
      for (let i = 0; i < 20; i++) {
        setSystemTime(new Date(now.epochMilliseconds));
        await service.login({ username: "kim", password: "wrong" }).catch(() => {});
        now = now.add({ minutes: 15 });
      }

      // then
      setSystemTime(new Date(now.subtract({ seconds: 1 }).epochMilliseconds));
      await expect(service.login({ username: "kim", password: "wrong" })).rejects.toEqual(tooMany(1));

      // when
      setSystemTime(new Date(now.add({ minutes: 45 }).epochMilliseconds));
      // then
      await expect(service.login({ username: "kim", password: "wrong" })).rejects.toEqual(expect.objectContaining({ problem: "AuthError::invalid_credentials" }));
    });
  });

  describe("authenticate", () => {
    it("should tell who a token belongs to, until it expires", async () => {
      // given
      const user = TestFixture.user();
      const now = Temporal.Now.instant();
      context.userRepositoryMock.find.mockResolvedValue(user);
      context.sessionRepositoryMock.find.mockImplementation(async (id: string) =>
        ({
          [AuthService.hash("admin-token")]: { id, expires: now.add({ hours: 1 }), created: now },
          [AuthService.hash("user-token")]: { id, user: user.id, expires: now.add({ hours: 1 }), created: now },
          [AuthService.hash("old-token")]: { id, user: user.id, expires: now.subtract({ hours: 1 }), created: now },
        })[id],
      );

      // then
      expect(await service.authenticate({ token: "admin-token" })).toEqual({ object: "me", kind: "admin" });
      expect(await service.authenticate({ token: "user-token" })).toEqual({ object: "me", kind: "user", user });
      expect(await service.authenticate({ token: "old-token" })).toBeUndefined();
      expect(await service.authenticate({ token: "unknown" })).toBeUndefined();
      expect(await service.authenticate({})).toBeUndefined();
    });

    it("should extend a session in use, but not on every request", async () => {
      // given
      const now = Temporal.Now.instant();
      context.sessionRepositoryMock.find.mockResolvedValueOnce({ id: "fresh", expires: now.add({ hours: 30 * 24 - 1 }), created: now });
      context.sessionRepositoryMock.find.mockResolvedValueOnce({ id: "aging", expires: now.add({ hours: 24 }), created: now });

      // when
      await service.authenticate({ token: "fresh" });
      await service.authenticate({ token: "aging" });
      // then
      expect(context.sessionRepositoryMock.extend.mock.calls.map(([id]) => id)).toEqual(["aging"]);
    });

    it("should only let users through where users are asked for, and the admin where the admin is", async () => {
      // given
      const now = Temporal.Now.instant();
      context.sessionRepositoryMock.find.mockResolvedValue({ id: "admin", expires: now.add({ hours: 1 }), created: now });

      // then
      await expect(service.requireUser({ token: "token" })).rejects.toEqual(expect.objectContaining({ problem: "ServerError::unauthorized" }));
      expect(await service.requireAdmin({ token: "token" })).toBeUndefined();
      await expect(service.requireAdmin({})).rejects.toEqual(expect.objectContaining({ problem: "ServerError::unauthorized" }));
    });
  });

  describe("basic auth", () => {
    const basic = (username: string, password: string) => `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

    it("should let a basic auth header in, the admin's too, and remember it rather than check the password every time", async () => {
      // given
      const user = TestFixture.user({ username: "kim" });
      const passwordHash = await Bun.password.hash("secret: with colon", { algorithm: "bcrypt", cost: 4 });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash });
      const verify = jest.spyOn(Bun.password, "verify");

      // when
      const first = await service.authenticate({ authorization: basic("Kim", "secret: with colon") });
      const second = await service.authenticate({ authorization: basic("Kim", "secret: with colon") });
      // then
      expect(first).toEqual({ object: "me", kind: "user", user });
      expect(second).toEqual(first);
      expect(verify).toHaveBeenCalledTimes(1);
      expect(await service.authenticate({ authorization: basic("admin", TestEnvironment.ADMIN_PASSWORD) })).toEqual({ object: "me", kind: "admin" });
    });

    it("should notice a changed password straight away, and turn the old one away", async () => {
      // given
      const user = TestFixture.user({ username: "kim" });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash: await Bun.password.hash("old", { algorithm: "bcrypt", cost: 4 }) });
      await service.authenticate({ authorization: basic("kim", "old") });

      // when
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash: await Bun.password.hash("new", { algorithm: "bcrypt", cost: 4 }) });
      // then
      expect(await service.authenticate({ authorization: basic("kim", "old") })).toBeUndefined();
      expect(await service.authenticate({ authorization: basic("kim", "new") })).toEqual(expect.objectContaining({ kind: "user" }));
    });

    it("should turn a remembered header away once its user is deleted", async () => {
      // given
      const user = TestFixture.user({ username: "kim" });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash: await Bun.password.hash("secret", { algorithm: "bcrypt", cost: 4 }) });
      await service.authenticate({ authorization: basic("kim", "secret") });

      // when
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue(undefined);
      // then
      expect(await service.authenticate({ authorization: basic("kim", "secret") })).toBeUndefined();
    });

    it("should check the password again once 10 minutes have passed", async () => {
      // given
      const user = TestFixture.user({ username: "kim" });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash: await Bun.password.hash("secret", { algorithm: "bcrypt", cost: 4 }) });
      const verify = jest.spyOn(Bun.password, "verify");
      setSystemTime(new Date("2026-10-11T10:00:00Z"));
      await service.authenticate({ authorization: basic("kim", "secret") });

      // when
      setSystemTime(new Date("2026-10-11T10:09:59Z"));
      await service.authenticate({ authorization: basic("kim", "secret") });
      // then
      expect(verify).toHaveBeenCalledTimes(1);

      // when
      setSystemTime(new Date("2026-10-11T10:10:01Z"));
      await service.authenticate({ authorization: basic("kim", "secret") });
      // then
      expect(verify).toHaveBeenCalledTimes(2);
    });

    it("should be held up after failed attempts like a login, except for a header already remembered", async () => {
      // given
      const user = TestFixture.user({ username: "kim" });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash: await Bun.password.hash("right", { algorithm: "bcrypt", cost: 4 }) });
      await service.authenticate({ authorization: basic("kim", "right") });

      // when
      for (let i = 0; i < 5; i++) {
        expect(await service.authenticate({ authorization: basic("kim", `guess ${i}`) })).toBeUndefined();
      }
      // then
      await expect(service.authenticate({ authorization: basic("kim", "guess 5") })).rejects.toEqual(expect.objectContaining({ problem: "AuthError::too_many_attempts" }));
      expect(await service.authenticate({ authorization: basic("kim", "right") })).toEqual(expect.objectContaining({ kind: "user" }));
    });

    it("should prefer a valid session, and ignore a header that isn't basic auth", async () => {
      // given
      const now = Temporal.Now.instant();
      context.sessionRepositoryMock.find.mockResolvedValue({ id: "admin", expires: now.add({ hours: 1 }), created: now });

      // then
      expect(await service.authenticate({ token: "token", authorization: basic("kim", "whatever") })).toEqual({ object: "me", kind: "admin" });
      expect(context.userRepositoryMock.findWithPasswordHash).not.toHaveBeenCalled();
      expect(await service.authenticate({ authorization: "Bearer abc" })).toBeUndefined();
      expect(await service.authenticate({ authorization: "Basic !!!" })).toBeUndefined();
    });
  });
});
