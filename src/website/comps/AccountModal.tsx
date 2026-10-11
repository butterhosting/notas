import { User } from "@/models/User";
import { ProblemDetails } from "@/models/internal/ProblemDetails";
import { useState } from "react";
import { AuthClient } from "../clients/AuthClient";
import { UserClient } from "../clients/UserClient";
import { useRegistry } from "../hooks/useRegistry";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { UserModal } from "./UserModal";

type Props = {
  user: User;
  close: () => void;
  done: (result: "updated" | "deleted") => void;
};

export function AccountModal({ user, close, done }: Props) {
  const authClient = useRegistry(AuthClient);
  const userClient = useRegistry(UserClient);
  const [deleting, setDeleting] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const renamed = username.trim().toLowerCase() !== user.username;

  async function run(action: () => Promise<void>) {
    try {
      setError(undefined);
      setBusy(true);
      await action();
    } catch (e) {
      setError(AccountModal.describe(e));
      setBusy(false);
    }
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const updated = await userClient.updateAccount({ currentPassword, ...(renamed ? { username } : {}), ...(password ? { password } : {}) });
      // a new password ends every session, this one too
      if (password) await authClient.login(updated.username, password);
      done("updated");
    });
  };

  const remove = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await userClient.deleteAccount(currentPassword);
      done("deleted");
    });
  };

  return (
    <Modal isOpen issueCloseRequestWhenClickingBackdrop issueCloseRequestWhenPressingEscape onCloseRequest={() => !busy && close()} className="max-w-md p-6">
      {deleting ? (
        <form onSubmit={remove} className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">Delete account</h2>
          <p className="text-sm">
            This deletes your account with everything you own: your workspaces, every page in them and every file uploaded to them, also for whoever
            those were shared with. This can't be undone.
          </p>
          <PasswordField label="Password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" autoFocus />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-c-dark-half">
              Type <span className="font-semibold text-c-dark-full">{user.username}</span> to confirm
            </span>
            <input aria-label="confirmation" value={typed} onChange={(e) => setTyped(e.target.value)} className={INPUT} />
          </label>
          {error && <p className="text-sm text-c-error">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" theme="neutral" onClick={() => setDeleting(false)} disabled={busy}>
              Back
            </Button>
            <Button type="submit" theme="error" loading={busy} disabled={!currentPassword || typed !== user.username}>
              Delete account
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">My account</h2>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-c-dark-half">Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className={INPUT} />
          </label>
          <PasswordField label="Password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordField label="New password" value={password} onChange={setPassword} placeholder="Leave empty to keep it" />
          {error && <p className="text-sm text-c-error">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" theme="error" onClick={() => (setError(undefined), setDeleting(true))} disabled={busy}>
              Delete account…
            </Button>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" theme="neutral" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!currentPassword || !username.trim() || (!renamed && !password)}>
                Save
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

const INPUT = "rounded-md border border-c-border bg-c-bg px-3 py-2 outline-none placeholder:text-c-placeholder focus:border-c-accent";

function PasswordField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-c-dark-half">{props.label}</span>
      <input
        type="password"
        autoFocus={props.autoFocus}
        autoComplete={props.autoComplete ?? "new-password"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={INPUT}
      />
    </label>
  );
}

export namespace AccountModal {
  export function describe(e: unknown): string {
    if (ProblemDetails.isInstance(e) && e.problem === "UserError::wrong_password") return "That's not your current password.";
    return UserModal.describe(e);
  }
}
