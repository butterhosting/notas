import { Member } from "@/models/Member";
import { Workspace } from "@/models/Workspace";
import { Yesttp } from "yesttp";

export class WorkspaceClient {
  public constructor(private readonly yesttp: Yesttp) {}

  public async list(): Promise<Workspace[]> {
    const { json } = await this.yesttp.get<unknown[]>("/workspaces");
    return json.map(Workspace.parse);
  }

  public async create(name: string): Promise<Workspace> {
    const { json } = await this.yesttp.post<unknown>("/workspaces", { body: { name } });
    return Workspace.parse(json);
  }

  public async rename(id: string, name: string): Promise<Workspace> {
    const { json } = await this.yesttp.patch<unknown>(`/workspaces/${id}`, { body: { name } });
    return Workspace.parse(json);
  }

  public async delete(id: string): Promise<Workspace> {
    const { json } = await this.yesttp.delete(`/workspaces/${id}`);
    return Workspace.parse(json);
  }

  public async members(id: string): Promise<Member[]> {
    const { json } = await this.yesttp.get<unknown[]>(`/workspaces/${id}/members`);
    return json.map(Member.parse);
  }

  public async share(id: string, username: string, role: Member.Role): Promise<Member> {
    const { json } = await this.yesttp.post<unknown>(`/workspaces/${id}/members`, { body: { username, role } });
    return Member.parse(json);
  }

  public async changeRole(id: string, user: string, role: Member.Role): Promise<Member> {
    const { json } = await this.yesttp.patch<unknown>(`/workspaces/${id}/members/${user}`, { body: { role } });
    return Member.parse(json);
  }

  // with one's own id, leaves the workspace
  public async unshare(id: string, user: string): Promise<void> {
    await this.yesttp.delete(`/workspaces/${id}/members/${user}`);
  }
}
