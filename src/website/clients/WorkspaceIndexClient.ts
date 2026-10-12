import { Workspace } from "@/models/Workspace";
import { ServerMessage } from "@/socket/ServerMessage";
import { SocketClient } from "./SocketClient";
import { WorkspaceClient } from "./WorkspaceClient";

export class WorkspaceIndexClient {
  private state: WorkspaceIndexClient.State = { workspaces: [] };
  private readonly listeners = new Set<() => void>();

  public constructor(
    private readonly workspaceClient: WorkspaceClient,
    private readonly socketClient: SocketClient,
  ) {}

  public async connect() {
    this.socketClient.subscribe({ type: ServerMessage.Type.workspaces_changed, callback: () => this.load() });
    await this.load();
  }

  public snapshot = (): WorkspaceIndexClient.State => {
    return this.state;
  };

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public async load() {
    const workspaces = await this.workspaceClient.list();
    const keep = [this.state.current?.id, localStorage.getItem(WorkspaceIndexClient.LAST_OPENED)];
    // with nothing to keep, the oldest: the one every account starts with, not whichever sorts first
    const current = keep.map((id) => workspaces.find((workspace) => workspace.id === id)).find(Boolean) ?? workspaces[0];
    this.set({ workspaces, current });
  }

  public select(id: string) {
    const current = this.state.workspaces.find((workspace) => workspace.id === id);
    if (current && current.id !== this.state.current?.id) {
      localStorage.setItem(WorkspaceIndexClient.LAST_OPENED, current.id);
      this.set({ ...this.state, current });
    }
  }

  public upsert(workspace: Workspace) {
    const workspaces = [...this.state.workspaces.filter(({ id }) => id !== workspace.id), workspace];
    this.set({ workspaces, current: this.state.current?.id === workspace.id ? workspace : this.state.current });
  }

  private set(state: WorkspaceIndexClient.State) {
    this.state = { ...state, workspaces: state.workspaces.toSorted(WorkspaceIndexClient.byName) };
    this.listeners.forEach((listener) => listener());
  }
}

export namespace WorkspaceIndexClient {
  export type State = { workspaces: Workspace[]; current?: Workspace };

  export const LAST_OPENED = "notas.workspace";

  export function byName(a: Workspace, b: Workspace): number {
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  }
}
