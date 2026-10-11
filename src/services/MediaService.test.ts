import { ServerError } from "@/errors/ServerError";
import { WorkspaceError } from "@/errors/WorkspaceError";
import { Media } from "@/models/Media";
import { User } from "@/models/User";
import { TestFixture } from "@/testing/TestFixture.test";
import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it } from "bun:test";
import { MediaService } from "./MediaService";

describe(MediaService.name, () => {
  let context: TestEnvironment.Context;
  let service: MediaService;
  let user: User;
  const WORKSPACE = TestFixture.WORKSPACE;

  beforeEach(async () => {
    context = await TestEnvironment.initialize();
    service = new MediaService(context.mediaRepositoryMock.cast(), context.workspaceServiceMock.cast());
    user = TestFixture.user();
    context.workspaceServiceMock.require.mockResolvedValue(TestFixture.workspace());
  });

  describe("upload", () => {
    it("should store the file, and fall back on the extension for an unknown type", async () => {
      // given
      context.mediaRepositoryMock.writeFile.mockResolvedValue({ size: 42 });
      context.mediaRepositoryMock.create.mockImplementation(async (media: Media) => media);

      // when
      const media = await service.upload(user, WORKSPACE, { filename: "clip.mp4", mime: "" }, new Response("x").body);
      // then
      expect(media).toEqual(
        expect.objectContaining({
          object: "media",
          workspace: WORKSPACE,
          filename: "clip.mp4",
          mime: "video/mp4",
          size: 42,
          url: `/media/${media.id}/clip.mp4`,
        }),
      );
    });

    it("should leave nothing behind when the upload fails or is empty", async () => {
      // given
      context.mediaRepositoryMock.writeFile.mockResolvedValueOnce({ size: 0 });
      context.mediaRepositoryMock.writeFile.mockRejectedValueOnce(new Error("connection reset"));

      // then
      await expect(service.upload(user, WORKSPACE, { filename: "a.png" }, new Response("").body)).rejects.toEqual(
        expect.objectContaining({ problem: "MediaError::missing_body" }),
      );
      await expect(service.upload(user, WORKSPACE, { filename: "a.png" }, new Response("x").body)).rejects.toThrow("connection reset");
      expect(context.mediaRepositoryMock.deleteFile).toHaveBeenCalledTimes(2);
      expect(context.mediaRepositoryMock.create).not.toHaveBeenCalled();
    });

    it("should reject a filename that is empty once sanitized", async () => {
      // when
      const action = () => service.upload(user, WORKSPACE, { filename: " .. " }, new Response("x").body);
      // then
      await expect(action()).rejects.toEqual(expect.objectContaining({ problem: "ServerError::invalid_request_body" }));
      expect(context.mediaRepositoryMock.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("access", () => {
    it("should take write access to upload, before reading any of the body", async () => {
      // given
      context.workspaceServiceMock.require.mockRejectedValue(ServerError.forbidden());

      // when
      const action = () => service.upload(user, WORKSPACE, { filename: "a.png" }, new Response("x").body);
      // then
      await expect(action()).rejects.toEqual(expect.objectContaining({ problem: "ServerError::forbidden" }));
      expect(context.workspaceServiceMock.require.mock.calls[0]![2]).toEqual("write");
      expect(context.mediaRepositoryMock.writeFile).not.toHaveBeenCalled();
    });

    it("should not even admit a file exists to someone without access to its workspace", async () => {
      // given
      context.mediaRepositoryMock.find.mockResolvedValue(TestFixture.media({ id: "abc123" }));
      context.workspaceServiceMock.require.mockRejectedValue(WorkspaceError.not_found({ id: WORKSPACE }));

      // then
      await expect(service.open(user, "abc123")).rejects.toEqual(expect.objectContaining({ problem: "MediaError::not_found", details: { id: "abc123" } }));
      expect(context.mediaRepositoryMock.file).not.toHaveBeenCalled();
    });
  });

  describe("sanitizeFilename", () => {
    it("should keep a filename from navigating the filesystem", () => {
      // then
      expect(MediaService.sanitizeFilename("../../etc/passwd")).toEqual("_.._etc_passwd");
      expect(MediaService.sanitizeFilename("..\\boot.ini")).toEqual("_boot.ini");
      expect(MediaService.sanitizeFilename(".env")).toEqual("env");
      expect(MediaService.sanitizeFilename("  My Vacation (1).jpg ")).toEqual("My Vacation (1).jpg");
    });
  });

  describe("sweep", () => {
    it("should delete, row and file, what no page has linked to for a day", async () => {
      // given
      const now = Temporal.Instant.from("2026-10-11T10:00:00Z");
      const unused = TestFixture.media();
      context.mediaRepositoryMock.findUnreferencedSince.mockResolvedValue([unused]);

      // when
      const deleted = await service.sweep(now);
      // then
      expect(deleted).toEqual([unused]);
      // as strings: `toEqual` finds any two instants equal
      expect(String(context.mediaRepositoryMock.markReferences.mock.calls[0]![0])).toEqual("2026-10-11T10:00:00Z");
      expect(String(context.mediaRepositoryMock.findUnreferencedSince.mock.calls[0]![0])).toEqual("2026-10-10T10:00:00Z");
      expect(context.mediaRepositoryMock.delete).toHaveBeenCalledWith(unused.id);
      expect(context.mediaRepositoryMock.deleteFile).toHaveBeenCalledWith(unused);
    });
  });
});
