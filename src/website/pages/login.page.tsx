import { AuthError } from "@/errors/AuthError";
import { Me } from "@/models/Me";
import { ProblemDetails } from "@/models/internal/ProblemDetails";
import { useEffect, useState } from "react";
import { AuthClient } from "../clients/AuthClient";
import { Button } from "../comps/Button";
import { Lockup } from "../comps/Lockup";
import { RestrictedControls } from "../comps/RestrictedControls";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useRegistry } from "../hooks/useRegistry";

export function loginPage({ onLogin }: { onLogin: (me: Me) => void }) {
  useDocumentTitle("Log in | Notas");
  const authClient = useRegistry(AuthClient);
  const { NOTAS_STAGE, INTERACTIVE_DEMO } = useRegistry("env");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // the demo lands straight in the first seeded user's workspace
  useEffect(() => {
    if (INTERACTIVE_DEMO) {
      const [demoUsername, demoPassword] = SEEDED[0]!;
      authClient.login(demoUsername, demoPassword).then(onLogin);
    }
  }, []);

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

  if (INTERACTIVE_DEMO) {
    return null;
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
          <div className="flex flex-col gap-2 border-t border-c-border pt-4 text-xs text-c-dark-half">
            <RestrictedControls />
            <ul className="flex flex-col items-center gap-0.5">
              {SEEDED.map(([username, password]) => (
                <li key={username}>
                  <code>{username}</code> / <code>{password}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
      <Lockup.Large />
    </main>
  );
}

// from `RestrictedService` and `.env.dev`, which the frontend can't import
const SEEDED = [
  ["kim", "possible"],
  ["ron", "stoppable"],
  ["admin", "admin"],
];

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
