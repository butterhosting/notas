import { Temporal } from "@js-temporal/polyfill";
import { Page } from "@/models/Page";
import { ServerMessage } from "@/socket/ServerMessage";
import { PageClient } from "./PageClient";
import { SocketClient } from "./SocketClient";
import { WorkspaceIndexClient } from "./WorkspaceIndexClient";

export class PageIndexClient {
  private pages: Page.Summary[] | undefined;
  private workspace: string | undefined;
  private readonly listeners = new Set<() => void>();

  public constructor(
    private readonly pageClient: PageClient,
    private readonly socketClient: SocketClient,
    private readonly workspaceIndexClient: WorkspaceIndexClient,
  ) {}

  public async connect() {
    this.socketClient.subscribe({
      type: ServerMessage.Type.page_changed,
      callback: ({ page }) => this.upsert(page),
    });
    this.socketClient.subscribe({
      type: ServerMessage.Type.pages_removed,
      callback: ({ ids }) => this.remove(ids),
    });
    this.workspaceIndexClient.subscribe(() => this.follow());
    await this.follow();
  }

  private async follow() {
    const workspace = this.workspaceIndexClient.snapshot().current?.id;
    if (workspace === this.workspace) {
      return;
    }
    this.workspace = workspace;
    this.pages = undefined;
    this.listeners.forEach((listener) => listener());
    const pages = workspace ? await this.pageClient.list(workspace) : [];
    // another workspace may have been opened while this one loaded
    if (workspace === this.workspace) {
      this.set(pages);
    }
  }

  public snapshot = (): Page.Summary[] | undefined => {
    return this.pages;
  };

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // the socket echoes our own changes back: an older copy must never win
  public upsert(page: Page.Summary) {
    if (page.workspace !== this.workspace) {
      return;
    }
    const existing = this.pages?.find(({ id }) => id === page.id);
    if (existing && PageIndexClient.isOlder(page, existing)) {
      return;
    }
    this.set([...(this.pages ?? []).filter(({ id }) => id !== page.id), page]);
  }

  public remove(ids: string[]) {
    this.set((this.pages ?? []).filter(({ id }) => !ids.includes(id)));
  }

  private set(pages: Page.Summary[]) {
    this.pages = pages.toSorted((a, b) => a.position - b.position || Temporal.Instant.compare(a.created, b.created));
    this.listeners.forEach((listener) => listener());
  }
}

export namespace PageIndexClient {
  export function isOlder(page: Page.Summary, than: Page.Summary): boolean {
    const updated = (summary: Page.Summary) => (summary.updated ?? summary.created).epochMilliseconds;
    return page.revision < than.revision || updated(page) < updated(than);
  }

  export function children(pages: Page.Summary[], parent: string | undefined): Page.Summary[] {
    return pages.filter((page) => page.parent === parent);
  }

  export function ancestors(pages: Page.Summary[], id: string): Page.Summary[] {
    const page = pages.find((p) => p.id === id);
    return page?.parent ? [...ancestors(pages, page.parent), pages.find((p) => p.id === page.parent)!].filter(Boolean) : [];
  }
}
