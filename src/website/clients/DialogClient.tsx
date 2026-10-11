import { Page } from "@/models/Page";
import { User } from "@/models/User";
import { Workspace } from "@/models/Workspace";
import { ReactNode } from "react";
import { ConfirmModal } from "../comps/ConfirmModal";
import { DialogManager } from "../comps/DialogManager";
import { SearchModal } from "../comps/SearchModal";
import { UserModal } from "../comps/UserModal";
import { WorkspaceModal } from "../comps/WorkspaceModal";
import { WorkspaceSettingsModal } from "../comps/WorkspaceSettingsModal";

export class DialogClient {
  private _manager: DialogManager.Api | null = null;

  private get manager() {
    if (!this._manager) throw new Error(`Must initialize the ${DialogClient.name} before use`);
    return this._manager;
  }

  public initialize(manager: DialogManager.Api | null) {
    this._manager = manager;
  }

  // `action` runs, and can fail, inside the dialog
  public confirm(options: Omit<ConfirmModal.Props, "close" | "done">): Promise<"cancel" | "done"> {
    return this.open<"done">((resolve) => <ConfirmModal {...options} close={() => resolve("cancel")} done={() => resolve("done")} />);
  }

  public search(): Promise<"cancel" | Page.Summary> {
    return this.open<Page.Summary>((resolve) => <SearchModal close={() => resolve("cancel")} done={resolve} />);
  }

  public user(existing?: User): Promise<"cancel" | User> {
    return this.open<User>((resolve) => <UserModal existing={existing} close={() => resolve("cancel")} done={resolve} />);
  }

  public workspace(existing?: Workspace): Promise<"cancel" | Workspace> {
    return this.open<Workspace>((resolve) => <WorkspaceModal existing={existing} close={() => resolve("cancel")} done={resolve} />);
  }

  public workspaceSettings(workspace: Workspace): Promise<"cancel" | "deleted" | "left"> {
    return this.open<"deleted" | "left">((resolve) => <WorkspaceSettingsModal workspace={workspace} close={() => resolve("cancel")} done={resolve} />);
  }

  private open<T>(render: (resolve: (result: "cancel" | T) => void) => ReactNode): Promise<"cancel" | T> {
    const { promise, resolve: internalResolve } = Promise.withResolvers<"cancel" | T>();
    const resolve = (result: "cancel" | T) => {
      internalResolve(result);
      this.manager.remove({ token });
    };
    const { token } = this.manager.insert(render(resolve));
    return promise;
  }
}
