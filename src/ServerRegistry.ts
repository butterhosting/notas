import { Class } from "@/types/Class";
import { Sqlite } from "./drizzle/sqlite";
import { Env } from "./Env";
import { EventBus } from "./events/EventBus";
import { Initialize } from "./Initialize";
import { LoggingMiddleware } from "./middleware/logging/LoggingMiddleware";
import { Middleware } from "./middleware/Middleware";
import { MediaRepository } from "./repositories/MediaRepository";
import { PageRepository } from "./repositories/PageRepository";
import { SessionRepository } from "./repositories/SessionRepository";
import { UserRepository } from "./repositories/UserRepository";
import { WorkspaceRepository } from "./repositories/WorkspaceRepository";
import { Server } from "./Server";
import { AuthService } from "./services/AuthService";
import { MediaService } from "./services/MediaService";
import { PageService } from "./services/PageService";
import { RestrictedService } from "./services/RestrictedService";
import { UserService } from "./services/UserService";
import { WorkspaceService } from "./services/WorkspaceService";
import { SocketService } from "./socket/SocketService";

export class ServerRegistry {
  public static async bootstrap(env: Env.Private, sqlite: Sqlite): Promise<ServerRegistry> {
    return await new ServerRegistry(env, sqlite).initializeAll();
  }

  private readonly registry: Record<string, any> = {};

  private constructor(
    private readonly env: Env.Private,
    private readonly sqlite: Sqlite,
  ) {
    const { userRepository } = this.register({ UserRepository }, [sqlite]);
    const { sessionRepository } = this.register({ SessionRepository }, [sqlite]);
    const { workspaceRepository } = this.register({ WorkspaceRepository }, [sqlite]);
    const { pageRepository } = this.register({ PageRepository }, [sqlite]);
    const { mediaRepository } = this.register({ MediaRepository }, [sqlite, env]);

    const { eventBus } = this.register({ EventBus }, []);

    const { authService } = this.register({ AuthService }, [env, sessionRepository, userRepository]);
    const { userService } = this.register({ UserService }, [userRepository, workspaceRepository, sessionRepository, mediaRepository, eventBus]);
    const { workspaceService } = this.register({ WorkspaceService }, [workspaceRepository, userRepository, mediaRepository, eventBus]);
    const { pageService } = this.register({ PageService }, [pageRepository, workspaceService, eventBus]);
    const { mediaService } = this.register({ MediaService }, [mediaRepository, workspaceService]);
    const { socketService } = this.register({ SocketService }, [eventBus, workspaceService]);
    const { restrictedService } = this.register({ RestrictedService }, [userService, workspaceService, pageService, mediaService, sessionRepository]);

    const { loggingMiddleware } = this.register({ LoggingMiddleware }, []);
    const { middleware } = this.register({ Middleware }, [loggingMiddleware]);

    this.register({ Server }, [env, authService, userService, workspaceService, pageService, mediaService, restrictedService, socketService, middleware]);
  }

  private async initializeAll(): Promise<ServerRegistry> {
    for (const instance of Object.values(this.registry)) {
      await Initialize.runAll(instance);
    }
    return this;
  }

  public get(sqlite: "sqlite"): Sqlite;
  public get(env: "env"): Env.Private;
  public get<T>(klass: Class<T>): T;
  public get<T>(klass: "sqlite" | "env" | Class<T>): Sqlite | Env.Private | T {
    if (klass === "sqlite") {
      return this.sqlite;
    }
    if (klass === "env") {
      return this.env;
    }
    const result = this.registry[klass.name] as T;
    if (!result) {
      throw new Error(`No registration for ${klass.name}`);
    }
    return result;
  }

  private register<N extends string, C extends Class>(
    classRecord: Record<N, C>,
    parameters: ConstructorParameters<C>,
  ): Record<Uncapitalize<N>, InstanceType<C>> {
    const entry = Object.entries(classRecord).at(0)!;
    const name = entry[0] as N;
    const Klass = entry[1] as C;
    const instance: InstanceType<C> = new Klass(...parameters);
    this.registry[Klass.name] = instance;
    return {
      [`${name[0].toLowerCase()}${name.slice(1)}`]: instance,
    } as Record<Uncapitalize<N>, InstanceType<C>>;
  }
}
