import { Media } from "@/models/Media";
import { Member } from "@/models/Member";
import { Page } from "@/models/Page";
import { User } from "@/models/User";
import { Workspace } from "@/models/Workspace";
import { Temporal } from "@js-temporal/polyfill";

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export namespace TestFixture {
  export const WORKSPACE = Bun.randomUUIDv7();

  export function user(overrides: DeepPartial<User> = {}): User {
    const defaults: User = {
      id: Bun.randomUUIDv7(),
      object: "user",
      username: `user-${Math.random().toString(36).slice(2, 8)}`,
      created: Temporal.Now.instant(),
    };
    return deepMerge(defaults, overrides);
  }

  export function workspace(overrides: DeepPartial<Workspace> = {}): Workspace {
    const defaults: Workspace = {
      id: WORKSPACE,
      object: "workspace",
      name: Workspace.PERSONAL,
      owner: { id: Bun.randomUUIDv7(), username: "owner" },
      role: "owner",
      created: Temporal.Now.instant(),
    };
    return deepMerge(defaults, overrides);
  }

  export function member(overrides: DeepPartial<Member> = {}): Member {
    const defaults: Member = {
      object: "member",
      workspace: WORKSPACE,
      user: { id: Bun.randomUUIDv7(), username: "member" },
      role: "write",
      created: Temporal.Now.instant(),
    };
    return deepMerge(defaults, overrides);
  }

  export function page(overrides: DeepPartial<Page> = {}): Page {
    const defaults: Page = {
      id: Bun.randomUUIDv7(),
      object: "page",
      workspace: WORKSPACE,
      position: 1,
      title: "Groceries",
      markdown: "- [ ] milk",
      revision: 1,
      created: Temporal.Now.instant(),
    };
    return deepMerge(defaults, overrides);
  }

  export function media(overrides: DeepPartial<Media> = {}): Media {
    const id = overrides.id ?? Bun.randomUUIDv7();
    const filename = overrides.filename ?? "cat.png";
    const defaults: Media = {
      id,
      object: "media",
      workspace: WORKSPACE,
      filename,
      mime: "image/png",
      size: 3,
      url: Media.url(id, filename),
      created: Temporal.Now.instant(),
    };
    return deepMerge(defaults, overrides);
  }

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  }

  function deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
    const result = { ...target } as Record<string, unknown>;
    for (const key in source) {
      const sourceVal = (source as Record<string, unknown>)[key];
      const targetVal = result[key];
      if (sourceVal !== undefined) {
        if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
          result[key] = deepMerge(targetVal, sourceVal);
        } else {
          result[key] = sourceVal;
        }
      }
    }
    return result as T;
  }
}
