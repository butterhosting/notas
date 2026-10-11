import { WorkspaceError } from "@/errors/WorkspaceError";
import { Workspace } from "@/models/Workspace";
import { useState } from "react";
import { WorkspaceClient } from "../clients/WorkspaceClient";
import { useRegistry } from "../hooks/useRegistry";
import { Button } from "./Button";
import { Modal } from "./Modal";

type Props = {
  existing?: Workspace;
  close: () => void;
  done: (workspace: Workspace) => void;
};

export function WorkspaceModal({ existing, close, done }: Props) {
  const workspaceClient = useRegistry(WorkspaceClient);
  const [name, setName] = useState(existing?.name ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(undefined);
      setBusy(true);
      done(existing ? await workspaceClient.rename(existing.id, name) : await workspaceClient.create(name));
    } catch (e) {
      setError(WorkspaceError.name_taken.matches(e) ? "You already have a workspace with that name." : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen issueCloseRequestWhenClickingBackdrop issueCloseRequestWhenPressingEscape onCloseRequest={() => !busy && close()} className="max-w-md p-6">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">{existing ? "Rename workspace" : "New workspace"}</h2>
        <input
          autoFocus
          aria-label="workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="E.g. Team notes"
          className="rounded-md border border-c-border bg-c-bg px-3 py-2 text-sm outline-none focus:border-c-accent"
        />
        {error && <p className="text-sm text-c-error">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" theme="neutral" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            {existing ? "Rename" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
