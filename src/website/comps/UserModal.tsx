import { User } from "@/models/User";
import { ProblemDetails } from "@/models/internal/ProblemDetails";
import { useState } from "react";
import { UserClient } from "../clients/UserClient";
import { useRegistry } from "../hooks/useRegistry";
import { Button } from "./Button";
import { Modal } from "./Modal";

type Props = {
  existing?: User;
  close: () => void;
  done: (user: User) => void;
};

// an empty password leaves it unchanged
export function UserModal({ existing, close, done }: Props) {
  const userClient = useRegistry(UserClient);
  const [username, setUsername] = useState(existing?.username ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(undefined);
      setBusy(true);
      done(
        existing
          ? await userClient.update(existing.id, { ...(username !== existing.username ? { username } : {}), ...(password ? { password } : {}) })
          : await userClient.create({ username, password }),
      );
    } catch (e) {
      setError(UserModal.describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen issueCloseRequestWhenClickingBackdrop issueCloseRequestWhenPressingEscape onCloseRequest={() => !busy && close()} className="max-w-md p-6">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">{existing ? `Edit ${existing.username}` : "New user"}</h2>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-c-dark-half">Username</span>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-md border border-c-border bg-c-bg px-3 py-2 outline-none placeholder:text-c-placeholder focus:border-c-accent"
          />
          <span className="text-xs text-c-dark-half">Lower case letters, digits, and . _ or - in between.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-c-dark-half">{existing ? "New password" : "Password"}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={existing ? "Leave empty to keep it" : ""}
            className="rounded-md border border-c-border bg-c-bg px-3 py-2 outline-none placeholder:text-c-placeholder focus:border-c-accent"
          />
          <span className="text-xs text-c-dark-half">At least 8 characters.{existing && " Changing it logs them out everywhere."}</span>
        </label>
        {error && <p className="text-sm text-c-error">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" theme="neutral" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!username.trim() || (!existing && !password)}>
            {existing ? "Save" : "Create user"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export namespace UserModal {
  export function describe(e: unknown): string {
    if (!ProblemDetails.isInstance(e)) return "Something went wrong.";
    if (e.problem === "UserError::username_taken") return "That username is taken.";
    if (e.problem === "ServerError::invalid_request_body") {
      const fields: string[] = e.details?.issues?.map((issue: { field: string }) => issue.field) ?? [];
      if (fields.includes("username")) return "That username isn't allowed (and admin is reserved).";
      if (fields.includes("password")) return "The password needs at least 8 characters.";
    }
    return e.problem;
  }
}
