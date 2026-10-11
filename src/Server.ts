import { Env } from "@/Env";
import { AuthError } from "@/errors/AuthError";
import { ServerError } from "@/errors/ServerError";
import { Initialize } from "@/Initialize";
import index from "@/website/index.html";
import { Temporal } from "@js-temporal/polyfill";
import { ErrorLike } from "bun";
import { randomUUID } from "crypto";
import path from "path";
import { Yexception } from "yexception";
import { Logger } from "./Logger";
import { Middleware } from "./middleware/Middleware";
import { Demo } from "./models/copy/Demo";
import { Me } from "./models/Me";
import { Media } from "./models/Media";
import { Member } from "./models/Member";
import { Page } from "./models/Page";
import { SearchResult } from "./models/SearchResult";
import { User } from "./models/User";
import { Workspace } from "./models/Workspace";
import { AuthService } from "./services/AuthService";
import { MediaService } from "./services/MediaService";
import { PageService } from "./services/PageService";
import { RestrictedService } from "./services/RestrictedService";
import { UserService } from "./services/UserService";
import { WorkspaceService } from "./services/WorkspaceService";
import { Socket } from "./socket/Socket";
import { SocketService } from "./socket/SocketService";

export class Server {
  private readonly log = new Logger(__filename);
  private server?: Bun.Server<Socket.Context>;

  public constructor(
    private readonly env: Env.Private,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly workspaceService: WorkspaceService,
    private readonly pageService: PageService,
    private readonly mediaService: MediaService,
    private readonly restrictedService: RestrictedService,
    private readonly socketService: SocketService,
    private readonly middleware: Middleware,
  ) {}

  @Initialize
  public listen() {
    const server: Bun.Server<Socket.Context> = Bun.serve({
      development: this.env.NOTAS_STAGE === "dev",
      maxRequestBodySize: this.env.NOTAS_UPLOAD_LIMIT * 1024 * 1024,
      fetch: this.handleFetch(async (request, server) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/socket") {
          const me = await this.authService.authenticate(this.credentials(request));
          if (me?.kind !== "user") {
            return Response.json(ServerError.unauthorized().problemDetails(), { status: 401 });
          }
          const context: Socket.Context = {
            clientId: `${randomUUID()}`,
            user: me.user.id,
          };
          if (server.upgrade(request, { data: context })) {
            return new Response(null, { status: 200 });
          }
          return Response.json(ServerError.socket_upgrade_failed().problemDetails());
        }
        return Response.json(ServerError.route_not_found().problemDetails());
      }),
      websocket: {
        message: () => {
        },
        open: (socket) => {
          this.socketService.registerSocket(socket);
        },
        close: (socket) => {
          this.socketService.unregisterSocket(socket);
        },
      },
      routes: {
        "/*": index,
        "/favicon.svg": Bun.file(path.join(import.meta.dir, "website/images/favicon.svg")),
        "/emojibase/en/data.json": Bun.file(Bun.resolveSync("emojibase-data/en/data.json", import.meta.dir)),
        "/emojibase/en/messages.json": Bun.file(Bun.resolveSync("emojibase-data/en/messages.json", import.meta.dir)),
        "/api/*": this.handleRoute(() => {
          return Response.json(ServerError.route_not_found().problemDetails(), { status: 404 });
        }),

        // public, for the container healthcheck
        "/health": {
          GET: this.handleRoute(() => {
            return Response.json({ status: "ok" });
          }),
        },

        "/api/env": {
          GET: this.handleRoute(() => {
            return Response.json(Env.onlyPublic(this.env));
          }),
        },

        "/api/session": {
          POST: this.handleRoute(async (request) => {
            const { token, me } = await this.authService.login(await Server.json(request, Server.LOGIN_LIMIT), this.client(request));
            request.cookies.set(AuthService.COOKIE, token, {
              httpOnly: true,
              sameSite: "lax",
              path: "/",
              maxAge: AuthService.SESSION_HOURS * 3600,
              secure: Server.isHttps(request),
            });
            return Response.json(me);
          }),
          GET: this.handleRoute(async (request) => {
            const me: Me | undefined = await this.authService.authenticate(this.credentials(request));
            if (!me) {
              throw ServerError.unauthorized();
            }
            return Response.json(me);
          }),
          DELETE: this.handleRoute(async (request) => {
            await this.authService.logout(request.cookies.get(AuthService.COOKIE));
            request.cookies.delete({ name: AuthService.COOKIE, path: "/" });
            return new Response();
          }),
        },

        "/api/users": {
          GET: this.withAdmin(async () => {
            const users: User[] = await this.userService.list();
            return Response.json(users);
          }),
          POST: this.withAdmin(async (request) => {
            const user: User = await this.userService.create(await Server.json(request));
            return Response.json(user);
          }),
        },
        "/api/users/:id": {
          PATCH: this.withAdmin(async (request) => {
            const user: User = await this.userService.update(request.params.id, await Server.json(request));
            return Response.json(user);
          }),
          DELETE: this.withAdmin(async ({ params }) => {
            const user: User = await this.userService.delete(params.id);
            return Response.json(user);
          }),
        },

        // the logged-in user's own account; changes take their current password
        "/api/account": {
          PATCH: this.withUser(async (request, user) => {
            const updated: User = await this.userService.updateAccount(user, await Server.json(request));
            return Response.json(updated);
          }),
          DELETE: this.withUser(async (request, user) => {
            const deleted: User = await this.userService.deleteAccount(user, await Server.json(request));
            return Response.json(deleted);
          }),
        },

        "/api/workspaces": {
          GET: this.withUser(async (_request, user) => {
            const workspaces: Workspace[] = await this.workspaceService.list(user);
            return Response.json(workspaces);
          }),
          POST: this.withUser(async (request, user) => {
            const workspace: Workspace = await this.workspaceService.create(user, await Server.json(request));
            return Response.json(workspace);
          }),
        },
        "/api/workspaces/:id": {
          GET: this.withUser(async ({ params }, user) => {
            const workspace: Workspace = await this.workspaceService.require(user, params.id, "read");
            return Response.json(workspace);
          }),
          PATCH: this.withUser(async (request, user) => {
            const workspace: Workspace = await this.workspaceService.rename(user, request.params.id, await Server.json(request));
            return Response.json(workspace);
          }),
          DELETE: this.withUser(async ({ params }, user) => {
            const workspace: Workspace = await this.workspaceService.delete(user, params.id);
            return Response.json(workspace);
          }),
        },
        "/api/workspaces/:id/members": {
          GET: this.withUser(async ({ params }, user) => {
            const members: Member[] = await this.workspaceService.members(user, params.id);
            return Response.json(members);
          }),
          POST: this.withUser(async (request, user) => {
            const member: Member = await this.workspaceService.share(user, request.params.id, await Server.json(request));
            return Response.json(member);
          }),
        },
        "/api/workspaces/:id/members/:user": {
          PATCH: this.withUser(async (request, user) => {
            const member: Member = await this.workspaceService.changeRole(user, request.params.id, request.params.user, await Server.json(request));
            return Response.json(member);
          }),
          DELETE: this.withUser(async ({ params }, user) => {
            await this.workspaceService.unshare(user, params.id, params.user);
            return new Response();
          }),
        },

        "/api/workspaces/:id/pages": {
          GET: this.withUser(async (request, user) => {
            const trash = new URL(request.url).searchParams.get("deleted") === "true";
            const pages: Page.Summary[] = trash
              ? await this.pageService.listTrash(user, request.params.id)
              : await this.pageService.list(user, request.params.id);
            return Response.json(pages);
          }),
          POST: this.withUser(async (request, user) => {
            const page: Page = await this.pageService.create(user, request.params.id, await Server.json(request));
            return Response.json(page);
          }),
        },
        "/api/workspaces/:id/search": {
          GET: this.withUser(async (request, user) => {
            const query = new URL(request.url).searchParams.get("q") ?? "";
            const results: SearchResult[] = await this.pageService.search(user, request.params.id, query);
            return Response.json(results);
          }),
        },
        // the body is the raw file, not multipart
        "/api/workspaces/:id/media": {
          POST: this.withUser(async (request, user) => {
            const filename = new URL(request.url).searchParams.get("filename") ?? "";
            const mime = request.headers.get("content-type") ?? undefined;
            const media: Media = await this.mediaService.upload(user, request.params.id, { filename, mime }, request.body);
            return Response.json(media);
          }),
        },
        // `deleted: true|false` trashes or restores; DELETE is for good
        "/api/pages/:id": {
          GET: this.withUser(async ({ params }, user) => {
            const page: Page = await this.pageService.find(user, params.id);
            return Response.json(page);
          }),
          PATCH: this.withUser(async (request, user) => {
            const page: Page = await this.pageService.update(user, request.params.id, await Server.json(request));
            return Response.json(page);
          }),
          DELETE: this.withUser(async ({ params }, user) => {
            const page: Page = await this.pageService.delete(user, params.id);
            return Response.json(page);
          }),
        },
        "/api/pages/:id/markdown": {
          GET: this.withUser(async ({ params }, user) => {
            const { filename, markdown } = await this.pageService.export(user, params.id);
            return new Response(markdown, {
              headers: {
                "content-type": "text/markdown; charset=utf-8",
                "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
              },
            });
          }),
        },

        "/media/:id/:filename": {
          GET: this.withUser(async ({ params }, user) => {
            const { file } = await this.mediaService.open(user, params.id);
            // a Bun.file body answers range requests, so videos can seek
            return new Response(file, {
              headers: {
                "cache-control": "private, max-age=31536000, immutable",
                "x-content-type-options": "nosniff",
                // an uploaded svg or html must not run scripts on this origin
                "content-security-policy": "sandbox",
              },
            });
          }),
        },

        ...this.restrictedRoutes(),
      },

      error: (e) => this.handleError(e),
    });

    this.socketService.startHeartbeat();

    this.mediaService.startSweeping();

    this.server = server;

    // console, not the logger: printed at any log level
    console.log(
      [
        "",
        `  🚀 \x1b[1mNotas started on ${Temporal.Now.plainDateTimeISO(this.env.NOTAS_TIMEZONE)
          .toString({ smallestUnit: "second" })
          .replace("T", " ")} (${this.env.NOTAS_TIMEZONE})\x1b[0m`,
        "",
        `  \x1b[1mServer\x1b[0m    ${server.url}`,
        "",
        `  \x1b[1mStage\x1b[0m     ${this.env.NOTAS_STAGE}`,
        `  \x1b[1mCommit\x1b[0m    ${this.env.NOTAS_COMMIT}`,
        `  \x1b[1mVersion\x1b[0m   ${this.env.NOTAS_VERSION}`,
        "",
        `  \x1b[1mLogging\x1b[0m   ${this.env.NOTAS_LOGGING}`,
        `  \x1b[1mTimezone\x1b[0m  ${this.env.NOTAS_TIMEZONE}`,
        "",
        ...(this.env.INTERACTIVE_DEMO ? [`  \x1b[1m${Demo.description}\x1b[0m`, ""] : []),
      ].join("\n"),
    );
  }

  public async stop() {
    await this.server?.stop(true);
    console.log(`\n  👋 \x1b[1mNotas stopped\x1b[0m\n`);
  }

  // never routed in production; the e2e suite seeds through these. Typed `{}`: Bun's route types needn't know of them.
  private restrictedRoutes(): {} {
    if (this.env.NOTAS_STAGE === "prod") {
      return {};
    }
    return {
      "/api/restricted/purge": {
        POST: this.handleRoute(async () => {
          await this.restrictedService.purge();
          return new Response();
        }),
      },
      "/api/restricted/seed": {
        POST: this.handleRoute(async () => {
          await this.restrictedService.seed();
          return new Response();
        }),
      },
    };
  }

  private handleFetch<C>(
    fn: (request: Request, server: Bun.Server<C>) => Response | Promise<Response>,
  ): (request: Request, server: Bun.Server<C>) => Promise<Response> {
    return (request, server) =>
      this.middleware.handle(request, async () => {
        return await fn(request, server);
      });
  }

  private handleRoute<T extends string>(
    fn: (req: Bun.BunRequest<T>) => Response | Promise<Response>,
  ): (req: Bun.BunRequest<T>) => Promise<Response> {
    return (request) =>
      this.middleware.handle(request, async () => {
        return await fn(request);
      });
  }

  private withUser<T extends string>(fn: (req: Bun.BunRequest<T>, user: User) => Response | Promise<Response>) {
    return this.handleRoute<T>(async (request) => fn(request, await this.authService.requireUser(this.credentials(request))));
  }

  private withAdmin<T extends string>(fn: (req: Bun.BunRequest<T>) => Response | Promise<Response>) {
    return this.handleRoute<T>(async (request) => {
      await this.authService.requireAdmin(this.credentials(request));
      return await fn(request);
    });
  }

  private credentials(request: Request): AuthService.Credentials {
    return {
      token: new Bun.CookieMap(request.headers.get("cookie") ?? "").get(AuthService.COOKIE),
      authorization: request.headers.get("authorization"),
      client: this.client(request),
    };
  }

  // behind a proxy, the peer is the proxy; what it forwards is only as trustworthy as whatever else can reach the port
  private client(request: Request): string {
    const peer = this.server?.requestIP(request)?.address ?? "an unknown address";
    const forwarded = request.headers.get("x-forwarded-for");
    return forwarded ? `${peer}, forwarded for ${JSON.stringify(forwarded)}` : peer;
  }

  private async handleError(e: ErrorLike): Promise<Response> {
    if (Yexception.isInstance(e)) {
      if (AuthError.too_many_attempts.matches(e)) {
        return Response.json(e.problemDetails(), { status: 429, headers: { "retry-after": String(e.details.retryAfter) } });
      }
      if (ServerError.request_body_too_large.matches(e)) {
        return Response.json(e.problemDetails(), { status: 413 });
      }
      if (ServerError.unauthorized.matches(e)) {
        return Response.json(e.problemDetails(), { status: 401 });
      }
      if (ServerError.forbidden.matches(e) || ServerError.cross_origin_request.matches(e)) {
        return Response.json(e.problemDetails(), { status: 403 });
      }
      return Response.json(e.problemDetails(), { status: 400 });
    }
    if (e.message?.includes("invalid input syntax for type")) {
      return Response.json(ServerError.invalid_request_body().problemDetails(), { status: 400 });
    }
    this.log.error("An unknown error occurred", e);
    return Response.json(ServerError.unknown().problemDetails(), { status: 500 });
  }
}

export namespace Server {
  // a username and a password
  export const LOGIN_LIMIT = 4 * 1024;
  // far beyond any page body; Bun's own limit is the upload limit, which only the media route needs
  export const JSON_LIMIT = 16 * 1024 * 1024;

  /** Unlike `request.json()`, stops reading past the limit: one 700 MB login body grew the process by 1.2 GB. */
  export async function json(request: Request, limit = JSON_LIMIT): Promise<any> {
    if (Number(request.headers.get("content-length")) > limit) {
      throw ServerError.request_body_too_large({ limit });
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (request.body) {
      for await (const chunk of request.body) {
        size += chunk.byteLength;
        if (size > limit) {
          throw ServerError.request_body_too_large({ limit });
        }
        chunks.push(chunk);
      }
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw ServerError.invalid_request_body();
    }
  }

  // behind a TLS-terminating proxy, only the forwarded protocol tells
  export function isHttps(request: Request): boolean {
    return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  }
}
