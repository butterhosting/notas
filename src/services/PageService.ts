import { PageError } from "@/errors/PageError";
import { ServerError } from "@/errors/ServerError";
import { WorkspaceError } from "@/errors/WorkspaceError";
import { Event } from "@/events/Event";
import { EventBus } from "@/events/EventBus";
import { ZodProblem } from "@/helpers/ZodIssues";
import { Page } from "@/models/Page";
import { SearchResult } from "@/models/SearchResult";
import { User } from "@/models/User";
import { PageRepository } from "@/repositories/PageRepository";
import { Temporal } from "@js-temporal/polyfill";
import { Yexception } from "yexception";
import z from "zod/v4";
import { WorkspaceService } from "./WorkspaceService";

export class PageService {
  public constructor(
    private readonly pageRepository: PageRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly eventBus: EventBus,
  ) {}

  public async list(user: User, workspace: string): Promise<Page.Summary[]> {
    await this.workspaceService.require(user, workspace, "read");
    return await this.visible(workspace);
  }

  /** Only pages trashed themselves; their descendants are hidden along with them. */
  public async listTrash(user: User, workspace: string): Promise<Page.Summary[]> {
    await this.workspaceService.require(user, workspace, "read");
    const pages = await this.pageRepository.list(workspace);
    return pages.filter(({ deleted }) => deleted).toSorted((a, b) => Temporal.Instant.compare(b.deleted!, a.deleted!));
  }

  /** Every query word must prefix-match a word in the title or body. */
  public async search(user: User, workspace: string, query: string): Promise<SearchResult[]> {
    await this.workspaceService.require(user, workspace, "read");
    const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const pages = await this.pageRepository.list(workspace);
    const trashed = Page.trashed(pages);
    // room to spare: the trash is filtered out afterwards
    const matches = await this.pageRepository.search(workspace, terms.slice(0, 8), 50);
    return matches
      .filter(({ id }) => !trashed.has(id))
      .slice(0, 20)
      .map(({ id, snippet }) => ({ object: "search_result", page: pages.find((page) => page.id === id)!, snippet: PageService.plainSnippet(snippet) }));
  }

  public async find(user: User, id: string): Promise<Page> {
    return await this.withAccess(user, id, "read");
  }

  public async create(user: User, workspace: string, unknown: z.input<typeof PageService.Create>): Promise<Page> {
    const { parent, title, icon, cover, markdown } = PageService.Create.parse(unknown);
    await this.workspaceService.require(user, workspace, "write");
    if (parent && !(await this.visible(workspace)).some(({ id }) => id === parent)) {
      throw PageError.parent_not_found({ parent });
    }
    const page = await this.pageRepository.create({
      id: Bun.randomUUIDv7(),
      object: "page",
      workspace,
      parent,
      position: await this.nextPosition(workspace, parent),
      title,
      icon,
      cover,
      markdown,
      revision: 1,
      created: Temporal.Now.instant(),
    });
    this.eventBus.publish(Event.Type.page_created, { page });
    return page;
  }

  /** A body change needs the revision it's based on; the rest is last-write-wins. `deleted` trashes or restores, alone. */
  public async update(user: User, id: string, unknown: z.input<typeof PageService.Update>): Promise<Page> {
    const { revision, deleted, ...patch } = PageService.Update.parse(unknown);
    if (deleted !== undefined) {
      return deleted ? await this.trash(user, id) : await this.restore(user, id);
    }
    const existing = await this.withAccess(user, id, "write");
    if (existing.deleted) {
      throw PageError.in_trash({ id });
    }
    if (patch.parent) {
      const pages = await this.visible(existing.workspace);
      if (!pages.some((page) => page.id === patch.parent)) {
        throw PageError.parent_not_found({ parent: patch.parent });
      }
      if (patch.parent === id || Page.descendants(pages, id).includes(patch.parent)) {
        throw PageError.parent_is_descendant({ id, parent: patch.parent });
      }
    }
    if (patch.parent !== undefined && patch.position === undefined) {
      patch.position = await this.nextPosition(existing.workspace, patch.parent ?? undefined);
    }
    const page = await this.pageRepository.update(id, { ...patch, updated: Temporal.Now.instant() }, revision);
    if (!page) {
      const current = await this.pageRepository.find(id);
      if (!current) {
        throw PageError.not_found({ id });
      }
      throw PageError.revision_conflict({ id, revision: current.revision });
    }
    this.eventBus.publish(Event.Type.page_updated, { page });
    return page;
  }

  public async trash(user: User, id: string): Promise<Page> {
    const existing = await this.withAccess(user, id, "write");
    const pages = await this.pageRepository.list(existing.workspace);
    const trashed = Page.trashed(pages);
    if (trashed.has(id)) {
      throw PageError.in_trash({ id });
    }
    const page = (await this.pageRepository.update(id, { deleted: Temporal.Now.instant() }))!;
    this.eventBus.publish(Event.Type.page_trashed, { page, ids: [id, ...Page.descendants(pages, id).filter((d) => !trashed.has(d))] });
    return page;
  }

  /** Comes back at the top level if its parent is gone or still in the trash. */
  public async restore(user: User, id: string): Promise<Page> {
    const existing = await this.withAccess(user, id, "write");
    if (!existing.deleted) {
      throw PageError.not_in_trash({ id });
    }
    const pages = await this.pageRepository.list(existing.workspace);
    const orphaned = existing.parent !== undefined && Page.trashed(pages.filter((page) => page.id !== id)).has(existing.parent);
    const page = (await this.pageRepository.update(id, {
      deleted: null,
      ...(orphaned ? { parent: null, position: await this.nextPosition(existing.workspace, undefined) } : {}),
    }))!;
    const restored = await this.visible(existing.workspace);
    const ids = new Set([id, ...Page.descendants(restored, id)]);
    this.eventBus.publish(Event.Type.page_restored, { page, pages: restored.filter((summary) => ids.has(summary.id)) });
    return page;
  }

  /** For good, descendants included. */
  public async delete(user: User, id: string): Promise<Page> {
    const existing = await this.withAccess(user, id, "owner");
    if (!existing.deleted) {
      throw PageError.not_in_trash({ id });
    }
    const pages = await this.pageRepository.list(existing.workspace);
    const page = (await this.pageRepository.delete(id))!;
    this.eventBus.publish(Event.Type.page_deleted, { page, ids: [id, ...Page.descendants(pages, id)] });
    return page;
  }

  public async export(user: User, id: string): Promise<{ filename: string; markdown: string }> {
    const { title, icon, cover, markdown } = await this.find(user, id);
    // a JSON string is a valid YAML scalar: no escaping of our own
    const frontmatter = [
      `title: ${JSON.stringify(title)}`,
      ...(icon ? [`icon: ${JSON.stringify(icon)}`] : []),
      ...(cover ? [`cover: { src: ${JSON.stringify(cover.src)}, y: ${cover.y} }`] : []),
    ];
    return {
      filename: `${title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Untitled"}.md`,
      markdown: `---\n${frontmatter.join("\n")}\n---\n\n${markdown}`,
    };
  }

  /** Without access, a page doesn't exist. */
  private async withAccess(user: User, id: string, need: "read" | "write" | "owner"): Promise<Page> {
    const page = await this.pageRepository.find(id);
    if (!page) {
      throw PageError.not_found({ id });
    }
    await this.workspaceService.require(user, page.workspace, need).catch((err) => {
      throw Yexception.isInstance(err) && WorkspaceError.not_found.matches(err) ? PageError.not_found({ id }) : err;
    });
    return page;
  }

  private async visible(workspace: string): Promise<Page.Summary[]> {
    const pages = await this.pageRepository.list(workspace);
    const trashed = Page.trashed(pages);
    return pages.filter(({ id }) => !trashed.has(id));
  }

  private async nextPosition(workspace: string, parent: string | undefined): Promise<number> {
    const siblings = (await this.visible(workspace)).filter((page) => page.parent === parent);
    return Math.max(0, ...siblings.map(({ position }) => position)) + 1;
  }
}

export namespace PageService {
  /**
   * The excerpt as plain text, without markdown or directive syntax. Inline code stays as text; the match markers may
   * sit anywhere, even inside a directive's name.
   */
  export function plainSnippet(snippet: string): string {
    const mark = `[${SearchResult.MARK_START}${SearchResult.MARK_END}]*`;
    // the label may be cut off by the excerpt's end
    const directive = new RegExp(`:{2,}${mark}[\\w-]+${mark}(?:\\[([^\\]\\n]*)\\]?)?(\\{[^}\\n]*\\})?`, "g");
    return snippet
      .split(/(`+[^`]*`+)/)
      .map((part) =>
        part.startsWith("`")
          ? part.replace(/`/g, "")
          : part
              .replace(directive, (_, label: string | undefined) => label ?? "")
              .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
              .replace(/(\*\*|__|~~|\+\+|`+)/g, "")
              .replace(/(^|\n)\s*([-*_]\s*){3,}(?=\n|$)/g, "$1")
              .replace(/(^|\n)\s*(#{1,6}|>|[-*+]( \[[ x]\])?|\d+\.)\s+/g, "$1"),
      )
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  const icon = z.string().trim().min(1).max(16);
  const cover = z.object({
    src: z.string().trim().min(1),
    y: z.number().min(0).max(100),
  });

  export const Create = z
    .object({
      parent: z.uuid().optional(),
      title: z.string().default(""),
      icon: icon.optional(),
      cover: cover.optional(),
      markdown: z.string().default(""),
    })
    .catch((e) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });

  export const Update = z
    .object({
      parent: z.uuid().nullable().optional(),
      position: z.number().optional(),
      title: z.string().optional(),
      icon: icon.nullable().optional(),
      cover: cover.nullable().optional(),
      markdown: z.string().optional(),
      revision: z.number().int().optional(),
      deleted: z.boolean().optional(),
    })
    .refine(({ markdown, revision }) => markdown === undefined || revision !== undefined, {
      path: ["revision"],
    })
    .refine(({ deleted, ...rest }) => deleted === undefined || Object.values(rest).every((value) => value === undefined), {
      path: ["deleted"],
    })
    .catch((e) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });
}
