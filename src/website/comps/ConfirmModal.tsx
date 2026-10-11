import { ReactNode, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function ConfirmModal({ title, children, confirm, typeToConfirm, action, close, done }: ConfirmModal.Props) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run() {
    try {
      setError(undefined);
      setBusy(true);
      await action();
      done();
    } catch (e) {
      setError(JSON.stringify(e, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen issueCloseRequestWhenClickingBackdrop issueCloseRequestWhenPressingEscape onCloseRequest={() => !busy && close()} className="max-w-md p-6">
      <div className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-sm">{children}</div>
        {typeToConfirm && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-c-dark-half">
              Type <span className="font-semibold text-c-dark-full">{typeToConfirm}</span> to confirm
            </span>
            <input
              autoFocus
              aria-label="confirmation"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="rounded-md border border-c-border bg-c-bg px-3 py-2 outline-none focus:border-c-error"
            />
          </label>
        )}
        {error && <pre className="text-sm whitespace-pre-wrap text-c-error">{error}</pre>}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" theme="neutral" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button theme="error" onClick={run} loading={busy} disabled={typeToConfirm !== undefined && typed.trim() !== typeToConfirm}>
            {confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export namespace ConfirmModal {
  export type Props = {
    title: string;
    children: ReactNode;
    confirm: string;
    typeToConfirm?: string;
    action: () => Promise<unknown>;
    close: () => void;
    done: () => void;
  };
}
