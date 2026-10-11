import { Temporal } from "@js-temporal/polyfill";

/** `id` is the sha-256 of the cookie's token; no `user` means the admin. */
export type Session = {
  id: string;
  user?: string;
  expires: Temporal.Instant;
  created: Temporal.Instant;
};
