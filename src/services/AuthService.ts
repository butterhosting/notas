import { Env } from "@/Env";
import { AuthError } from "@/errors/AuthError";
import { ServerError } from "@/errors/ServerError";
import { ZodProblem } from "@/helpers/ZodIssues";
import { Initialize } from "@/Initialize";
import { Logger } from "@/Logger";
import { Me } from "@/models/Me";
import { User } from "@/models/User";
import { SessionRepository } from "@/repositories/SessionRepository";
import { UserRepository } from "@/repositories/UserRepository";
import { Temporal } from "@js-temporal/polyfill";
import z from "zod/v4";

export class AuthService {
  private readonly log = new Logger(__filename);
  private dummyHash?: Promise<string>;
  private readonly verifiedHeaders = new VerifiedHeaders();
  private readonly throttle = new LoginThrottle();

  public constructor(
    private readonly env: Env.Private,
    private readonly sessionRepository: SessionRepository,
    private readonly userRepository: UserRepository,
  ) {}

  /** The admin's password comes from the environment, so it can only have changed across a restart. */
  @Initialize
  public async forgetAdminSessions(): Promise<void> {
    await this.sessionRepository.deleteAdmin();
  }

  public async login(unknown: z.input<typeof AuthService.Login>, client?: string): Promise<{ token: string; me: Me }> {
    const { username, password } = AuthService.Login.parse(unknown);
    const verified = await this.verify(username, password, client);
    if (!verified) {
      throw AuthError.invalid_credentials();
    }
    const now = Temporal.Now.instant();
    await this.sessionRepository.deleteExpired(now);
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    await this.sessionRepository.create({
      id: AuthService.hash(token),
      user: verified.me.kind === "user" ? verified.me.user.id : undefined,
      expires: now.add({ hours: AuthService.SESSION_HOURS }),
      created: now,
    });
    return { token, me: verified.me };
  }

  public async authenticate(credentials: AuthService.Credentials): Promise<Me | undefined> {
    return (await this.fromSession(credentials.token)) ?? (await this.fromBasic(credentials.authorization, credentials.client));
  }

  public async logout(token: string | null | undefined): Promise<void> {
    if (token) {
      await this.sessionRepository.delete(AuthService.hash(token));
    }
  }

  public async requireUser(credentials: AuthService.Credentials): Promise<User> {
    const me = await this.authenticate(credentials);
    if (me?.kind !== "user") {
      throw ServerError.unauthorized();
    }
    return me.user;
  }

  public async requireAdmin(credentials: AuthService.Credentials): Promise<void> {
    if ((await this.authenticate(credentials))?.kind !== "admin") {
      throw ServerError.unauthorized();
    }
  }

  /** Sliding expiry, extended at most once a day rather than on every request. */
  private async fromSession(token: string | null | undefined): Promise<Me | undefined> {
    if (!token) {
      return;
    }
    const session = await this.sessionRepository.find(AuthService.hash(token));
    const now = Temporal.Now.instant();
    if (!session || Temporal.Instant.compare(session.expires, now) <= 0) {
      return;
    }
    if (session.expires.since(now).total("hours") < AuthService.SESSION_HOURS - 24) {
      await this.sessionRepository.extend(session.id, now.add({ hours: AuthService.SESSION_HOURS }));
    }
    if (!session.user) {
      return { object: "me", kind: "admin" };
    }
    const user = await this.userRepository.find(session.user);
    return user ? { object: "me", kind: "user", user } : undefined;
  }

  /**
   * Bcrypt costs ~58 ms, too much for a header an SSO proxy sends with every request. A verified header skips it for a
   * while, for as long as the user's stored hash is still the one its password was checked against.
   */
  private async fromBasic(authorization: string | null | undefined, client: string | undefined): Promise<Me | undefined> {
    const credentials = AuthService.parseBasic(authorization);
    if (!authorization || !credentials) {
      return;
    }

    const remembered = this.verifiedHeaders.find(authorization);
    if (remembered) {
      const current = await this.passwordHashOf(remembered.username);
      if (current && current.passwordHash === remembered.passwordHash) {
        return current.me;
      }
      this.verifiedHeaders.forget(authorization);
    }

    const verified = await this.verify(credentials.username, credentials.password, client);
    if (verified) {
      this.verifiedHeaders.remember(authorization, { username: credentials.username, passwordHash: verified.passwordHash });
    }
    return verified?.me;
  }

  /** Unknown users cost a bcrypt verify too, so the timing doesn't reveal which usernames exist. */
  private async verify(username: string, password: string, client: string | undefined): Promise<{ me: Me; passwordHash: string } | undefined> {
    this.throttle.attempt(username);
    const found = await this.passwordHashOf(username);
    const valid = await Bun.password.verify(password, found?.passwordHash ?? (await this.dummy()));
    if (found && valid) {
      this.throttle.forget(username);
      return found;
    }
    // quoted: the username is the caller's, and must not be able to forge a line of its own
    this.log.warn(`Failed login for ${JSON.stringify(username)} from ${client ?? "an unknown address"}`);
  }

  private async passwordHashOf(username: string): Promise<{ me: Me; passwordHash: string } | undefined> {
    if (username === User.ADMIN) {
      return { me: { object: "me", kind: "admin" }, passwordHash: this.env.NOTAS_ADMIN_PASSWORD };
    }
    const found = await this.userRepository.findWithPasswordHash(username);
    return found && { me: { object: "me", kind: "user", user: found.user }, passwordHash: found.passwordHash };
  }

  private dummy(): Promise<string> {
    return (this.dummyHash ??= Bun.password.hash(crypto.randomUUID(), { algorithm: "bcrypt", cost: 10 }));
  }
}

export namespace AuthService {
  export type Credentials = {
    token?: string | null;
    authorization?: string | null;
    // for the log only
    client?: string;
  };

  export const COOKIE = "notas_session";
  export const SESSION_HOURS = 30 * 24;

  export function hash(token: string): string {
    return new Bun.CryptoHasher("sha256").update(token).digest("hex");
  }

  export function parseBasic(header: string | null | undefined): { username: string; password: string } | undefined {
    const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
    const decoded = match ? Buffer.from(match[1]!, "base64").toString("utf8") : "";
    const colon = decoded.indexOf(":");
    return colon > 0 ? { username: decoded.slice(0, colon).trim().toLowerCase(), password: decoded.slice(colon + 1) } : undefined;
  }

  export const Login = z
    .object({
      username: z.string().transform((s) => s.trim().toLowerCase()),
      password: z.string(),
    })
    .catch((e) => {
      throw ServerError.invalid_request_body(ZodProblem.issuesSummary(e));
    });
}

/** Keyed by the header's sha-256, so no password outlives its request in memory. */
class VerifiedHeaders {
  private readonly entries = new Map<string, VerifiedHeaders.Entry & { until: Temporal.Instant }>();

  public find(header: string): VerifiedHeaders.Entry | undefined {
    const key = AuthService.hash(header);
    const entry = this.entries.get(key);
    if (entry && Temporal.Instant.compare(entry.until, Temporal.Now.instant()) <= 0) {
      this.entries.delete(key);
      return;
    }
    return entry;
  }

  public remember(header: string, entry: VerifiedHeaders.Entry): void {
    if (this.entries.size >= VerifiedHeaders.MAX) {
      this.entries.delete(this.entries.keys().next().value!);
    }
    this.entries.set(AuthService.hash(header), { ...entry, until: Temporal.Now.instant().add(VerifiedHeaders.TTL) });
  }

  public forget(header: string): void {
    this.entries.delete(AuthService.hash(header));
  }
}

namespace VerifiedHeaders {
  export type Entry = { username: string; passwordHash: string };
  export const TTL = Temporal.Duration.from({ minutes: 10 });
  export const MAX = 1000;
}

/**
 * Per username, so changing addresses gains an attacker nothing; the price is that they can hold up one user's logins.
 * An attempt counts before its bcrypt runs, or a burst of parallel guesses would all get past an unblocked username.
 * Only a bcrypt verify adds an entry, ~139/s on 10 cores, so an hour's retention bounds the map near 500k entries: 26 MB
 * of numbers, where instants would have taken ~280 MB.
 */
class LoginThrottle {
  // ordered by last attempt, so pruning stops at the first recent one
  private readonly entries = new Map<string, LoginThrottle.Entry>();

  public attempt(username: string): void {
    const now = Date.now();
    this.prune(now);
    const entry = this.entries.get(username);
    if (entry && entry.blockedUntil > now) {
      throw AuthError.too_many_attempts({ retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) });
    }
    const attempts = (entry?.attempts ?? 0) + 1;
    this.entries.delete(username);
    this.entries.set(username, { attempts, last: now, blockedUntil: now + LoginThrottle.delay(attempts) });
  }

  public forget(username: string): void {
    this.entries.delete(username);
  }

  private prune(now: number): void {
    for (const [username, { last }] of this.entries) {
      if (now - last < LoginThrottle.RETAIN_MS) {
        return;
      }
      this.entries.delete(username);
    }
  }
}

namespace LoginThrottle {
  export type Entry = { attempts: number; last: number; blockedUntil: number };
  export const FREE = 5;
  export const MAX_DELAY_MS = 15 * 60 * 1000;
  export const RETAIN_MS = 60 * 60 * 1000;

  // what the next attempt waits: nothing for the first few, then 1 s, doubling up to 15 minutes
  export function delay(attempts: number): number {
    return attempts < FREE ? 0 : Math.min(1000 * 2 ** (attempts - FREE), MAX_DELAY_MS);
  }
}
