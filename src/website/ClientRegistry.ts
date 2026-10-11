import { Env } from "@/Env";
import { ProblemDetails } from "@/models/internal/ProblemDetails";
import { Class } from "@/types/Class";
import { createContext } from "react";
import { Yesttp } from "yesttp";
import { AuthClient } from "./clients/AuthClient";
import { DialogClient } from "./clients/DialogClient";
import { MediaClient } from "./clients/MediaClient";
import { PageClient } from "./clients/PageClient";
import { PageIndexClient } from "./clients/PageIndexClient";
import { RestrictedClient } from "./clients/RestrictedClient";
import { SocketClient } from "./clients/SocketClient";
import { ThemeClient } from "./clients/ThemeClient";
import { UserClient } from "./clients/UserClient";
import { WorkspaceClient } from "./clients/WorkspaceClient";
import { WorkspaceIndexClient } from "./clients/WorkspaceIndexClient";

export class ClientRegistry {
  // same origin as the api (Bun has no build step), so the env needs no configured url
  public static async bootstrap(): Promise<ClientRegistry> {
    const { json: env } = await new Yesttp({ baseUrl: "/api" }).get<Env.Public>("/env", { responseType: "json" });
    this.printEnv(env);
    return new ClientRegistry(env);
  }

  private static printEnv(env: Env.Public) {
    const envCopy: Env.Public = {
      NOTAS_STAGE: env.NOTAS_STAGE,
      NOTAS_VERSION: env.NOTAS_VERSION,
      NOTAS_COMMIT: env.NOTAS_COMMIT,
      NOTAS_TIMEZONE: env.NOTAS_TIMEZONE,
      NOTAS_UPLOAD_LIMIT: env.NOTAS_UPLOAD_LIMIT,
    };
    const longestKey = Object.keys(envCopy)
      .map((k) => k.length)
      .reduce((l1, l2) => Math.max(l1, l2), 0);
    let result = ``;
    Object.entries(envCopy).forEach(([key, value]) => {
      result += `${key.padEnd(longestKey + 1)}: ${value}\n`;
    });
    console.info("%cNotas\n\n%c%s", "font-size: 24px; font-weight: 800;", "font-size: 12px; font-weight: normal", result);
  }

  private readonly registry: Record<string, any> = {};

  public constructor(private readonly env: Env.Public) {
    const yesttp = (this.registry[Yesttp.name] = new Yesttp({
      baseUrl: "/api",
      responseErrorIntercepter: (_request, response): Promise<ProblemDetails> => {
        if (response.status === 401) {
          window.dispatchEvent(new Event(ClientRegistry.UNAUTHORIZED));
        }
        return Promise.reject(response.json);
      },
    }));
    const socketClient = (this.registry[SocketClient.name] = new SocketClient());
    this.registry[DialogClient.name] = new DialogClient();
    this.registry[AuthClient.name] = new AuthClient(yesttp);
    this.registry[UserClient.name] = new UserClient(yesttp);
    const workspaceClient = (this.registry[WorkspaceClient.name] = new WorkspaceClient(yesttp));
    const workspaceIndexClient = (this.registry[WorkspaceIndexClient.name] = new WorkspaceIndexClient(workspaceClient, socketClient));
    const pageClient = (this.registry[PageClient.name] = new PageClient(yesttp));
    this.registry[PageIndexClient.name] = new PageIndexClient(pageClient, socketClient, workspaceIndexClient);
    this.registry[MediaClient.name] = new MediaClient(env);
    this.registry[RestrictedClient.name] = new RestrictedClient(yesttp);
    this.registry[ThemeClient.name] = new ThemeClient();
  }

  public getEnv() {
    return this.env;
  }

  public get<T>(klass: Class<T>): T {
    const result = this.registry[klass.name] as T;
    if (!result) {
      throw new Error(`No registration for ${klass.name}`);
    }
    return result;
  }
}

export namespace ClientRegistry {
  export const UNAUTHORIZED = "notas:unauthorized";

  export const Context = createContext({} as ClientRegistry);
}
