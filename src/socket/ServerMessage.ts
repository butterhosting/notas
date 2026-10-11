import { ZodParser } from "@/helpers/ZodParser";
import { Page } from "@/models/Page";
import z from "zod/v4";

export type ServerMessage = ServerMessage.Heartbeat | ServerMessage.PageChanged | ServerMessage.PagesRemoved | ServerMessage.WorkspacesChanged;

export namespace ServerMessage {
  export enum Type {
    heartbeat = "heartbeat",
    page_changed = "page_changed",
    pages_removed = "pages_removed",
    workspaces_changed = "workspaces_changed",
  }

  export type Heartbeat = {
    type: Type.heartbeat;
    timestamp: string;
  };

  /** Summaries only: a client with the page open compares the revision, and refetches the body if behind. */
  export type PageChanged = {
    type: Type.page_changed;
    page: Page.Summary;
  };

  /** Trashed, or deleted for good. */
  export type PagesRemoved = {
    type: Type.pages_removed;
    ids: string[];
  };

  export type WorkspacesChanged = {
    type: Type.workspaces_changed;
  };

  export const parse = ZodParser.forType<ServerMessage>()
    .ensureSchemaMatchesType(() => {
      return z.union([
        z.object({
          type: z.literal(Type.heartbeat),
          timestamp: z.string(),
        }),
        z.object({
          type: z.literal(Type.page_changed),
          page: Page.parseSummary.SCHEMA,
        }),
        z.object({
          type: z.literal(Type.pages_removed),
          ids: z.array(z.string()),
        }),
        z.object({
          type: z.literal(Type.workspaces_changed),
        }),
      ]);
    })
    .ensureTypeMatchesSchema();
}
