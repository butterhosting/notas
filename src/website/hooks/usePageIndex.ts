import { Page } from "@/models/Page";
import { useSyncExternalStore } from "react";
import { PageIndexClient } from "../clients/PageIndexClient";
import { useRegistry } from "./useRegistry";

export function usePageIndex(): Page.Summary[] | undefined {
  const pageIndexClient = useRegistry(PageIndexClient);
  return useSyncExternalStore(pageIndexClient.subscribe, pageIndexClient.snapshot);
}
