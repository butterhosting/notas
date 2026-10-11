import { useSyncExternalStore } from "react";
import { WorkspaceIndexClient } from "../clients/WorkspaceIndexClient";
import { useRegistry } from "./useRegistry";

export function useWorkspaces(): WorkspaceIndexClient.State {
  const workspaceIndexClient = useRegistry(WorkspaceIndexClient);
  return useSyncExternalStore(workspaceIndexClient.subscribe, workspaceIndexClient.snapshot);
}
