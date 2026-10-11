import { Event } from "@/events/Event";
import { User } from "@/models/User";
import { PersistenceError } from "@/repositories/error/PersistenceError";
import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { TestFixture } from "@/testing/TestFixture.test";
import { beforeEach, describe, expect, it } from "bun:test";
import { UserService } from "./UserService";

describe(UserService.name, () => {
  let context: TestEnvironment.Context;
  let service: UserService;
  let events: Event[];

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    service = new UserService(
      context.userRepositoryMock.cast(),
      context.workspaceRepositoryMock.cast(),
      context.sessionRepositoryMock.cast(),
      context.mediaRepositoryMock.cast(),
      context.eventBus,
    );
    events = [];
    context.eventBus.subscribe("*", (event) => events.push(event));
    context.userRepositoryMock.create.mockImplementation(async (user: User) => user);
  });

  describe("create", () => {
    it("should hash the password, and start the user off with a workspace of their own", async () => {
      // when
      const user = await service.create({ username: "  Kim ", password: "correct horse" });
      // then
      expect(user.username).toEqual("kim");
      const [, hash] = context.userRepositoryMock.create.mock.calls[0]!;
      expect(await Bun.password.verify("correct horse", hash)).toBeTrue();
      expect(hash).toStartWith("$2b$");
      expect(context.workspaceRepositoryMock.create).toHaveBeenCalledWith(expect.objectContaining({ owner: user.id, name: "Personal Workspace" }));
    });

    it("should refuse the admin's name, odd usernames and short passwords", async () => {
      // then
      for (const [username, password, field] of [
        ["ADMIN", "long enough", "username"],
        ["no spaces", "long enough", "username"],
        ["-dash", "long enough", "username"],
        ["kim", "short", "password"],
      ]) {
        await expect(service.create({ username: username!, password: password! })).rejects.toEqual(
          expect.objectContaining({ problem: "ServerError::invalid_request_body", details: { issues: [expect.objectContaining({ field })] } }),
        );
      }
      expect(context.userRepositoryMock.create).not.toHaveBeenCalled();
    });

    it("should map a taken username onto a domain error", async () => {
      // given
      context.userRepositoryMock.create.mockRejectedValue(new PersistenceError("unique_violation"));

      // then
      await expect(service.create({ username: "kim", password: "long enough" })).rejects.toEqual(
        expect.objectContaining({ problem: "UserError::username_taken", details: { username: "kim" } }),
      );
    });
  });

  describe("update", () => {
    it("should log the user out everywhere when their password changes", async () => {
      // given
      const user = TestFixture.user();
      context.userRepositoryMock.update.mockResolvedValue(user);

      // when
      await service.update(user.id, { username: "renamed" });
      // then
      expect(context.sessionRepositoryMock.deleteForUser).not.toHaveBeenCalled();
      expect(context.userRepositoryMock.update.mock.calls[0]![2]).toBeUndefined();

      // when
      await service.update(user.id, { password: "a new password" });
      // then
      expect(context.sessionRepositoryMock.deleteForUser).toHaveBeenCalledWith(user.id);
      expect(await Bun.password.verify("a new password", context.userRepositoryMock.update.mock.calls[1]![2]!)).toBeTrue();
    });

    it("should throw when the user doesn't exist", async () => {
      // given
      context.userRepositoryMock.update.mockResolvedValue(undefined);

      // then
      await expect(service.update("abc123", { username: "kim" })).rejects.toEqual(expect.objectContaining({ problem: "UserError::not_found" }));
    });
  });

  describe("delete", () => {
    it("should remove the files of their workspaces, and tell whoever those were shared with", async () => {
      // given
      const user = TestFixture.user();
      context.workspaceRepositoryMock.idsOwnedBy.mockResolvedValue(["w1", "w2"]);
      context.workspaceRepositoryMock.audience.mockImplementation(async (id) => (id === "w1" ? [user.id, "lee"] : [user.id, "lee", "max"]));
      context.userRepositoryMock.delete.mockResolvedValue(user);

      // when
      await service.delete(user.id);
      // then
      expect(context.mediaRepositoryMock.deleteWorkspaceFiles.mock.calls.map(([id]) => id)).toEqual(["w1", "w2"]);
      expect(events).toEqual([expect.objectContaining({ type: Event.Type.workspaces_changed, data: { users: ["lee", "max"] } })]);
    });
  });

  describe("own account", () => {
    let user: User;

    beforeEach(async () => {
      user = TestFixture.user({ username: "kim" });
      const passwordHash = await Bun.password.hash("current password", { algorithm: "bcrypt", cost: 4 });
      context.userRepositoryMock.findWithPasswordHash.mockResolvedValue({ user, passwordHash });
      context.userRepositoryMock.update.mockResolvedValue(user);
      context.userRepositoryMock.delete.mockResolvedValue(user);
      context.workspaceRepositoryMock.idsOwnedBy.mockResolvedValue([]);
    });

    it("should take the current password to rename, or to change the password", async () => {
      // then
      await expect(service.updateAccount(user, { currentPassword: "wrong", username: "kimberly" })).rejects.toEqual(
        expect.objectContaining({ problem: "UserError::wrong_password" }),
      );
      expect(context.userRepositoryMock.update).not.toHaveBeenCalled();

      // when
      await service.updateAccount(user, { currentPassword: "current password", username: "kimberly", password: "a new password" });
      // then
      const [id, patch, hash] = context.userRepositoryMock.update.mock.calls[0]!;
      expect(id).toEqual(user.id);
      expect(patch.username).toEqual("kimberly");
      expect(await Bun.password.verify("a new password", hash!)).toBeTrue();
      expect(context.sessionRepositoryMock.deleteForUser).toHaveBeenCalledWith(user.id);
    });

    it("should hold a new password to the same policy", async () => {
      // then
      await expect(service.updateAccount(user, { currentPassword: "current password", password: "short" })).rejects.toEqual(
        expect.objectContaining({ problem: "ServerError::invalid_request_body" }),
      );
    });

    it("should take the password to delete the account", async () => {
      // then
      await expect(service.deleteAccount(user, { password: "wrong" })).rejects.toEqual(expect.objectContaining({ problem: "UserError::wrong_password" }));
      expect(context.userRepositoryMock.delete).not.toHaveBeenCalled();

      // when
      await service.deleteAccount(user, { password: "current password" });
      // then
      expect(context.userRepositoryMock.delete).toHaveBeenCalledWith(user.id);
    });
  });
});
