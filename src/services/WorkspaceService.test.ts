import { Event } from "@/events/Event";
import { User } from "@/models/User";
import { PersistenceError } from "@/repositories/error/PersistenceError";
import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { TestFixture } from "@/testing/TestFixture.test";
import { beforeEach, describe, expect, it } from "bun:test";
import { WorkspaceService } from "./WorkspaceService";

describe(WorkspaceService.name, () => {
  let context: TestEnvironment.Context;
  let service: WorkspaceService;
  let events: Event[];
  let owner: User;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    service = new WorkspaceService(context.workspaceRepositoryMock.cast(), context.userRepositoryMock.cast(), context.mediaRepositoryMock.cast(), context.eventBus);
    events = [];
    context.eventBus.subscribe("*", (event) => events.push(event));
    owner = TestFixture.user({ username: "kim" });
  });

  describe("require", () => {
    it("should hide what the user has no access to, and forbid what their role doesn't allow", async () => {
      // given
      context.workspaceRepositoryMock.findFor.mockResolvedValueOnce(undefined);
      context.workspaceRepositoryMock.findFor.mockResolvedValue(TestFixture.workspace({ role: "read" }));

      // then
      await expect(service.require(owner, "w1", "read")).rejects.toEqual(expect.objectContaining({ problem: "WorkspaceError::not_found" }));
      expect(await service.require(owner, "w1", "read")).toEqual(expect.objectContaining({ role: "read" }));
      await expect(service.require(owner, "w1", "write")).rejects.toEqual(expect.objectContaining({ problem: "ServerError::forbidden" }));

      // when
      context.workspaceRepositoryMock.findFor.mockResolvedValue(TestFixture.workspace({ role: "write" }));
      // then
      expect(await service.require(owner, "w1", "write")).toBeDefined();
      await expect(service.require(owner, "w1", "owner")).rejects.toEqual(expect.objectContaining({ problem: "ServerError::forbidden" }));
    });
  });

  describe("create", () => {
    it("should map a name the owner already uses onto a domain error", async () => {
      // given
      context.workspaceRepositoryMock.create.mockRejectedValue(new PersistenceError("unique_violation"));

      // then
      await expect(service.create(owner, { name: "  Notes " })).rejects.toEqual(
        expect.objectContaining({ problem: "WorkspaceError::name_taken", details: { name: "Notes" } }),
      );
    });
  });

  describe("delete", () => {
    it("should take the files along, and tell everyone who had access", async () => {
      // given
      context.workspaceRepositoryMock.findFor.mockResolvedValue(TestFixture.workspace());
      context.workspaceRepositoryMock.audience.mockResolvedValue([owner.id, "lee"]);

      // when
      await service.delete(owner, "w1");
      // then
      expect(context.workspaceRepositoryMock.delete).toHaveBeenCalledWith("w1");
      expect(context.mediaRepositoryMock.deleteWorkspaceFiles).toHaveBeenCalledWith("w1");
      expect(events).toEqual([expect.objectContaining({ type: Event.Type.workspaces_changed, data: { users: [owner.id, "lee"] } })]);
    });
  });

  describe("share", () => {
    it("should add a user by name, with a role", async () => {
      // given
      const lee = TestFixture.user({ username: "lee" });
      context.workspaceRepositoryMock.findFor.mockResolvedValue(TestFixture.workspace({ owner: { id: owner.id, username: "kim" } }));
      context.userRepositoryMock.findByUsername.mockResolvedValue(lee);
      context.workspaceRepositoryMock.members.mockResolvedValue([TestFixture.member({ user: { id: lee.id, username: "lee" }, role: "read" })]);

      // when
      const member = await service.share(owner, "w1", { username: " LEE ", role: "read" });
      // then
      expect(member.user.username).toEqual("lee");
      expect(context.userRepositoryMock.findByUsername).toHaveBeenCalledWith("lee");
      expect(context.workspaceRepositoryMock.setMember).toHaveBeenCalledWith(expect.objectContaining({ workspace: "w1", user: lee.id, role: "read" }));
      expect(events).toEqual([expect.objectContaining({ type: Event.Type.workspaces_changed, data: { users: [lee.id] } })]);
    });

    it("should refuse an unknown user, and the owner themselves", async () => {
      // given
      context.workspaceRepositoryMock.findFor.mockResolvedValue(TestFixture.workspace({ owner: { id: owner.id, username: "kim" } }));
      context.userRepositoryMock.findByUsername.mockResolvedValueOnce(undefined);
      context.userRepositoryMock.findByUsername.mockResolvedValueOnce(owner);

      // then
      await expect(service.share(owner, "w1", { username: "nobody", role: "read" })).rejects.toEqual(
        expect.objectContaining({ problem: "WorkspaceError::user_not_found" }),
      );
      await expect(service.share(owner, "w1", { username: "kim", role: "write" })).rejects.toEqual(
        expect.objectContaining({ problem: "WorkspaceError::owner_cannot_be_member" }),
      );
      expect(context.workspaceRepositoryMock.setMember).not.toHaveBeenCalled();
    });

    it("should only let the owner share", async () => {
      // given
      context.workspaceRepositoryMock.findFor.mockResolvedValue(TestFixture.workspace({ role: "write" }));

      // then
      await expect(service.share(owner, "w1", { username: "lee", role: "read" })).rejects.toEqual(expect.objectContaining({ problem: "ServerError::forbidden" }));
    });
  });

  describe("unshare", () => {
    it("should let the owner remove anyone, and a member only themselves", async () => {
      // given
      const lee = TestFixture.user({ username: "lee" });
      context.workspaceRepositoryMock.findFor.mockResolvedValue(TestFixture.workspace({ role: "write" }));
      context.workspaceRepositoryMock.removeMember.mockResolvedValue(true);

      // then
      await service.unshare(lee, "w1", lee.id);
      // then
      await expect(service.unshare(lee, "w1", "max")).rejects.toEqual(expect.objectContaining({ problem: "ServerError::forbidden" }));
      expect(context.workspaceRepositoryMock.removeMember.mock.calls).toEqual([["w1", lee.id]]);
    });
  });
});
