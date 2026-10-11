import { ServerError } from "@/errors/ServerError";
import { Me } from "@/models/Me";
import { Yesttp } from "yesttp";

export class AuthClient {
  private _current?: Me;

  public constructor(private readonly yesttp: Yesttp) {}

  public get current(): Me | undefined {
    return this._current;
  }

  public async me(): Promise<Me | undefined> {
    try {
      const { json } = await this.yesttp.get<unknown>("/session");
      return (this._current = Me.parse(json));
    } catch (e) {
      if (ServerError.unauthorized.matches(e)) {
        return undefined;
      }
      throw e;
    }
  }

  public async login(username: string, password: string): Promise<Me> {
    const { json } = await this.yesttp.post<unknown>("/session", { body: { username, password } });
    return (this._current = Me.parse(json));
  }

  public async logout(): Promise<void> {
    await this.yesttp.delete("/session");
  }
}
