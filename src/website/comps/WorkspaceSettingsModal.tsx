import { WorkspaceError } from "@/errors/WorkspaceError";
import { Member } from "@/models/Member";
import { Workspace } from "@/models/Workspace";
import clsx from "clsx";
import { useState } from "react";
import { useYesQuery } from "react-yesquery";
import { AuthClient } from "../clients/AuthClient";
import { DialogClient } from "../clients/DialogClient";
import { WorkspaceClient } from "../clients/WorkspaceClient";
import { WorkspaceIndexClient } from "../clients/WorkspaceIndexClient";
import { useRegistry } from "../hooks/useRegistry";
import { Button } from "./Button";
import { Modal } from "./Modal";

type Props = {
  workspace: Workspace;
  close: () => void;
  done: (result: "deleted" | "left") => void;
};

export function WorkspaceSettingsModal({ workspace, close, done }: Props) {
  const owner = workspace.role === "owner";
  return (
    <Modal isOpen issueCloseRequestWhenClickingBackdrop issueCloseRequestWhenPressingEscape onCloseRequest={close} className="max-w-lg p-6">
      <div className="flex flex-col gap-6 text-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{workspace.name}</h2>
            <p className="text-c-dark-half">
              {owner ? "Your workspace" : `Shared with you by ${workspace.owner.username}, to ${workspace.role === "write" ? "read and write" : "read"}`}
            </p>
          </div>
          <button aria-label="close" onClick={close} className="rounded px-2 py-1 text-c-dark-half hover:bg-c-hover">
            ✕
          </button>
        </div>
        {owner ? <OwnerSettings workspace={workspace} done={done} /> : <MemberSettings workspace={workspace} done={done} />}
      </div>
    </Modal>
  );
}

function OwnerSettings({ workspace, done }: { workspace: Workspace; done: Props["done"] }) {
  const workspaceClient = useRegistry(WorkspaceClient);
  const workspaceIndexClient = useRegistry(WorkspaceIndexClient);
  const dialogClient = useRegistry(DialogClient);
  const [name, setName] = useState(workspace.name);
  const { data: members, setData: setMembers } = useYesQuery({ queryFn: () => workspaceClient.members(workspace.id) }, [workspace.id]);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Member.Role>("write");
  const [error, setError] = useState<string>();

  async function rename() {
    try {
      setError(undefined);
      workspaceIndexClient.upsert(await workspaceClient.rename(workspace.id, name));
    } catch (e) {
      setError(WorkspaceError.name_taken.matches(e) ? "You already have a workspace with that name." : "Couldn't rename it.");
    }
  }

  async function share(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(undefined);
      const member = await workspaceClient.share(workspace.id, username, role);
      setMembers([...(members ?? []).filter(({ user }) => user.id !== member.user.id), member]);
      setUsername("");
    } catch (e) {
      setError(
        WorkspaceError.user_not_found.matches(e)
          ? `There's no user called ${username.trim()}.`
          : WorkspaceError.owner_cannot_be_member.matches(e)
            ? "That's you; you own this workspace."
            : "Couldn't share it.",
      );
    }
  }

  async function changeRole(member: Member, next: Member.Role) {
    const updated = await workspaceClient.changeRole(workspace.id, member.user.id, next);
    setMembers((members ?? []).map((m) => (m.user.id === updated.user.id ? updated : m)));
  }

  async function remove(member: Member) {
    await workspaceClient.unshare(workspace.id, member.user.id);
    setMembers((members ?? []).filter(({ user }) => user.id !== member.user.id));
  }

  async function deleteWorkspace() {
    const result = await dialogClient.confirm({
      title: "Delete workspace",
      children: (
        <>
          This deletes <span className="font-semibold">{workspace.name}</span>, every page in it and every file uploaded to it, for everyone it's shared with.
          This can't be undone.
        </>
      ),
      confirm: "Delete workspace",
      typeToConfirm: workspace.name,
      action: () => workspaceClient.delete(workspace.id),
    });
    if (result === "done") done("deleted");
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Name</h3>
        <div className="flex gap-2">
          <input
            aria-label="workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={clsx(Row.INPUT, "flex-1")}
          />
          <Button variant="ghost" theme="neutral" onClick={rename} disabled={!name.trim() || name === workspace.name} className={clsx(Row.ACTION, "border border-c-border")}>
            Rename
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Shared with</h3>
        {members?.map((member) => (
          <div key={member.user.id} data-testid="member" className="flex items-center gap-2">
            <span className="flex-1 truncate px-3">{member.user.username}</span>
            <select
              aria-label={`role of ${member.user.username}`}
              value={member.role}
              onChange={(e) => changeRole(member, e.target.value as Member.Role)}
              className={Row.SELECT}
            >
              <option value="write">Can edit</option>
              <option value="read">Can read</option>
            </select>
            <Button variant="ghost" theme="error" onClick={() => remove(member)} className={Row.ACTION}>
              Remove
            </Button>
          </div>
        ))}
        <form onSubmit={share} className="flex gap-2">
          <input
            aria-label="username to share with"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className={clsx(Row.INPUT, "flex-1")}
          />
          <select aria-label="role" value={role} onChange={(e) => setRole(e.target.value as Member.Role)} className={Row.SELECT}>
            <option value="write">Can edit</option>
            <option value="read">Can read</option>
          </select>
          <Button type="submit" disabled={!username.trim()} className={Row.ACTION}>
            Share
          </Button>
        </form>
      </section>
      {error && <p className="text-c-error">{error}</p>}
      <section className="flex items-center justify-between gap-4 border-t border-c-border pt-4">
        <span className="text-c-dark-half">Deletes the workspace with everything in it.</span>
        <Button theme="error" variant="ghost" onClick={deleteWorkspace}>
          Delete workspace
        </Button>
      </section>
    </>
  );
}

function MemberSettings({ workspace, done }: { workspace: Workspace; done: Props["done"] }) {
  const authClient = useRegistry(AuthClient);
  const workspaceClient = useRegistry(WorkspaceClient);
  const dialogClient = useRegistry(DialogClient);

  async function leave() {
    const me = await authClient.me();
    if (me?.kind !== "user") return;
    const result = await dialogClient.confirm({
      title: "Leave workspace",
      children: (
        <>
          You'll no longer see <span className="font-semibold">{workspace.name}</span>, until {workspace.owner.username} shares it with you again.
        </>
      ),
      confirm: "Leave",
      action: () => workspaceClient.unshare(workspace.id, me.user.id),
    });
    if (result === "done") done("left");
  }

  return (
    <section className="flex items-center justify-between gap-4 border-t border-c-border pt-4">
      <span className="text-c-dark-half">Only {workspace.owner.username} can rename, share or delete it.</span>
      <Button theme="error" variant="ghost" onClick={leave}>
        Leave workspace
      </Button>
    </section>
  );
}

namespace Row {
  export const INPUT = "h-9 min-w-0 rounded-lg border border-c-border bg-c-bg px-3 outline-none focus:border-c-accent";
  export const SELECT = "h-9 w-28 shrink-0 rounded-lg border border-c-border bg-c-bg px-2";
  export const ACTION = "h-9 w-24 shrink-0 px-0";
}
