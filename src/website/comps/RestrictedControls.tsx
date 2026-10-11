import { useState } from "react";
import { RestrictedClient } from "../clients/RestrictedClient";
import { useRegistry } from "../hooks/useRegistry";
import { Route } from "../Route";
import { Spinner } from "./Spinner";

export function RestrictedControls() {
  const restrictedClient = useRegistry(RestrictedClient);
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    action().then(() => location.assign(Route.home()));
  };
  return (
    <div className="flex h-6 items-center justify-center gap-1">
      {busy ? (
        <Spinner className="size-3.5" />
      ) : (
        <>
          <button type="button" onClick={() => run(() => restrictedClient.seed())} className="h-full flex-1 rounded hover:bg-c-hover">
            Seed
          </button>
          <button type="button" onClick={() => run(() => restrictedClient.purge())} className="h-full flex-1 rounded hover:bg-c-hover">
            Purge
          </button>
        </>
      )}
    </div>
  );
}
