// pasted page urls, translated to the embed urls an iframe needs
export namespace Embed {
  export function url(src: string): string {
    return videoUrl(src) ?? src;
  }

  export function videoUrl(src: string): string | undefined {
    let url: URL;
    try {
      url = new URL(src);
    } catch {
      return;
    }
    const host = url.hostname.replace(/^(www|m)\./, "");
    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const id = url.pathname === "/watch" ? url.searchParams.get("v") : first === "shorts" || first === "embed" ? second : undefined;
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined;
    }
    if (host === "youtu.be" && first) {
      return `https://www.youtube-nocookie.com/embed/${first}`;
    }
    if (host === "vimeo.com" && first && /^\d+$/.test(first)) {
      return `https://player.vimeo.com/video/${first}`;
    }
    if (host === "loom.com" && first === "share" && second) {
      return `https://www.loom.com/embed/${second}`;
    }
  }
}
