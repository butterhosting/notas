import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { beforeEach, describe, expect, it } from "bun:test";
import { Embed } from "./Embed";

describe("Embed", () => {
  beforeEach(async () => {
    await TestEnvironment.initialize();
  });

  it("should translate the video hosts it knows", () => {
    // then
    const youtube = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(Embed.url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")).toEqual(youtube);
    expect(Embed.url("https://youtu.be/dQw4w9WgXcQ")).toEqual(youtube);
    expect(Embed.url("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toEqual(youtube);
    expect(Embed.url("https://vimeo.com/76979871")).toEqual("https://player.vimeo.com/video/76979871");
    expect(Embed.url("https://www.loom.com/share/abc123")).toEqual("https://www.loom.com/embed/abc123");
  });

  it("should leave anything else alone", () => {
    // then
    expect(Embed.url("https://example.com/widget")).toEqual("https://example.com/widget");
    expect(Embed.videoUrl("https://example.com/clip.mp4")).toBeUndefined();
    expect(Embed.videoUrl("https://vimeo.com/channels/staffpicks")).toBeUndefined();
    expect(Embed.videoUrl("not a url")).toBeUndefined();
  });
});
