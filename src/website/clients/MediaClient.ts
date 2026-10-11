import { Env } from "@/Env";
import { Media } from "@/models/Media";
import { ProblemDetails } from "@/models/internal/ProblemDetails";

// not Yesttp: it only sends JSON, and only XMLHttpRequest reports upload progress
export class MediaClient {
  public constructor(private readonly env: Env.Public) {}

  public upload(workspace: string, file: File, onProgress?: (fraction: number) => void): Promise<Media> {
    const { promise, resolve, reject } = Promise.withResolvers<Media>();
    if (file.size > this.env.NOTAS_UPLOAD_LIMIT * 1024 * 1024) {
      reject({ problem: "MediaError::too_large", details: { limit: `${this.env.NOTAS_UPLOAD_LIMIT} MB` } } satisfies ProblemDetails);
      return promise;
    }
    const request = new XMLHttpRequest();
    request.open("POST", `/api/workspaces/${workspace}/media?filename=${encodeURIComponent(file.name)}`);
    request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.upload.addEventListener("progress", (e) => e.lengthComputable && onProgress?.(e.loaded / e.total));
    request.addEventListener("load", () => {
      try {
        const json = JSON.parse(request.responseText);
        request.status === 200 ? resolve(Media.parse(json)) : reject(json);
      } catch {
        reject({ problem: "MediaError::upload_failed", details: { status: request.status } } satisfies ProblemDetails);
      }
    });
    request.addEventListener("error", () => reject({ problem: "MediaError::upload_failed" } satisfies ProblemDetails));
    request.send(file);
    return promise;
  }
}
