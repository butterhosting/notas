import { AuthError } from "@/errors/AuthError";
import { Me } from "@/models/Me";
import { ProblemDetails } from "@/models/internal/ProblemDetails";
import { useState } from "react";
import { AuthClient } from "../clients/AuthClient";
import { Button } from "../comps/Button";
import { Lockup } from "../comps/Lockup";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useRegistry } from "../hooks/useRegistry";

export function loginPage({ onLogin }: { onLogin: (me: Me) => void }) {
  useDocumentTitle("Log in | Notas");
  const authClient = useRegistry(AuthClient);
  const { NOTAS_STAGE } = useRegistry("env");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      setError(undefined);
      onLogin(await authClient.login(username, password));
    } catch (e) {
      setError(problemMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-c-sidebar px-4 py-12">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-c-surface p-8 shadow-popover">
        <h1 className="mb-2 text-center text-xl font-semibold">Log in to Notas</h1>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-c-dark-half">Username</span>
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-md border border-c-border bg-c-bg px-3 py-2 outline-none focus:border-c-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-c-dark-half">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-c-border bg-c-bg px-3 py-2 outline-none focus:border-c-accent"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-c-error">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} disabled={!username || !password}>
          Log in
        </Button>
        {NOTAS_STAGE === "dev" && (
          <p className="text-center text-xs text-c-dark-half">
            Seeded: <code>kim</code> / <code>possible</code>, <code>ron</code> / <code>stoppable</code>; the admin is <code>admin</code> /{" "}
            <code>admin</code>
          </p>
        )}
      </form>
      <Lockup.Large />
    </main>
  );
}

function problemMessage(e: unknown): string {
  if (AuthError.invalid_credentials.matches(e)) {
    return "That username and password don't match.";
  }
  // `matches` narrows nothing; reading the details still takes the guard
  if (ProblemDetails.isInstance(e) && AuthError.too_many_attempts.matches(e)) {
    const seconds: number = e.details?.retryAfter ?? 1;
    return `Too many attempts. Try again in ${seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`}.`;
  }
  return "Something went wrong.";
}
