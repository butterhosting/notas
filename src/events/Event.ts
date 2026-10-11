import { Page } from "@/models/Page";
import { Temporal } from "@js-temporal/polyfill";

export type Event =
  | Event.PageCreated
  | Event.PageUpdated
  | Event.PageTrashed
  | Event.PageRestored
  | Event.PageDeleted
  | Event.WorkspacesChanged
  | Event.SessionsRevoked;

export namespace Event {
  export enum Type {
    page_created = "page_created",
    page_updated = "page_updated",
    page_trashed = "page_trashed",
    page_restored = "page_restored",
    page_deleted = "page_deleted",
    workspaces_changed = "workspaces_changed",
    sessions_revoked = "sessions_revoked",
  }

  type Instance<T extends Event.Type, D> = {
    id: string;
    object: "event";
    published: Temporal.Instant;
    type: T;
    data: D;
  };

  export type PageCreated = Instance<Event.Type.page_created, { page: Page }>;
  export type PageUpdated = Instance<Event.Type.page_updated, { page: Page }>;
  /** `ids` include its descendants. */
  export type PageTrashed = Instance<Event.Type.page_trashed, { page: Page; ids: string[] }>;
  /** `pages`: the restored page and its descendants. */
  export type PageRestored = Instance<Event.Type.page_restored, { page: Page; pages: Page.Summary[] }>;
  /** `ids` include its descendants. */
  export type PageDeleted = Instance<Event.Type.page_deleted, { page: Page; ids: string[] }>;

  /** For the users whose list of workspaces changed. */
  export type WorkspacesChanged = Instance<Event.Type.workspaces_changed, { users: string[] }>;

  /** The user's sessions ended (a new password, a deleted account): what they authenticated must end too. */
  export type SessionsRevoked = Instance<Event.Type.sessions_revoked, { user: string }>;
}
