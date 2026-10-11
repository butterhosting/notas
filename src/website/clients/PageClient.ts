import { Page } from "@/models/Page";
import { SearchResult } from "@/models/SearchResult";
import { Yesttp } from "yesttp";

export class PageClient {
  public constructor(private readonly yesttp: Yesttp) {}

  public async list(workspace: string): Promise<Page.Summary[]> {
    const { json } = await this.yesttp.get<unknown[]>(`/workspaces/${workspace}/pages`);
    return json.map(Page.parseSummary);
  }

  public async listTrash(workspace: string): Promise<Page.Summary[]> {
    const { json } = await this.yesttp.get<unknown[]>(`/workspaces/${workspace}/pages`, { searchParams: { deleted: true } });
    return json.map(Page.parseSummary);
  }

  public async search(workspace: string, query: string): Promise<SearchResult[]> {
    const { json } = await this.yesttp.get<unknown[]>(`/workspaces/${workspace}/search`, { searchParams: { q: query } });
    return json.map(SearchResult.parse);
  }

  public async find(id: string): Promise<Page> {
    const { json } = await this.yesttp.get<unknown>(`/pages/${id}`);
    return Page.parse(json);
  }

  public async create(workspace: string, data: PageClient.Create): Promise<Page> {
    const { json } = await this.yesttp.post<unknown>(`/workspaces/${workspace}/pages`, { body: data });
    return Page.parse(json);
  }

  public async update(id: string, data: PageClient.Update): Promise<Page> {
    const { json } = await this.yesttp.patch<unknown>(`/pages/${id}`, { body: data });
    return Page.parse(json);
  }

  public async trash(id: string): Promise<Page> {
    const { json } = await this.yesttp.patch<unknown>(`/pages/${id}`, { body: { deleted: true } });
    return Page.parse(json);
  }

  public async restore(id: string): Promise<Page> {
    const { json } = await this.yesttp.patch<unknown>(`/pages/${id}`, { body: { deleted: false } });
    return Page.parse(json);
  }

  public async delete(id: string): Promise<Page> {
    const { json } = await this.yesttp.delete(`/pages/${id}`);
    return Page.parse(json);
  }

  public exportUrl(id: string): string {
    return `/api/pages/${id}/markdown`;
  }
}

export namespace PageClient {
  export type Create = Partial<Pick<Page, "parent" | "title" | "icon" | "cover" | "markdown">>;

  // `null` clears a field; a new `markdown` needs the `revision` it was based on
  export type Update = {
    parent?: string | null;
    position?: number;
    title?: string;
    icon?: string | null;
    cover?: Page.Cover | null;
    markdown?: string;
    revision?: number;
  };
}
