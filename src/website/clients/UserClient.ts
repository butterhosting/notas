import { User } from "@/models/User";
import { Yesttp } from "yesttp";

export class UserClient {
  public constructor(private readonly yesttp: Yesttp) {}

  public async list(): Promise<User[]> {
    const { json } = await this.yesttp.get<unknown[]>("/users");
    return json.map(User.parse);
  }

  public async create(data: { username: string; password: string }): Promise<User> {
    const { json } = await this.yesttp.post<unknown>("/users", { body: data });
    return User.parse(json);
  }

  public async update(id: string, data: { username?: string; password?: string }): Promise<User> {
    const { json } = await this.yesttp.patch<unknown>(`/users/${id}`, { body: data });
    return User.parse(json);
  }

  public async updateAccount(data: { currentPassword: string; username?: string; password?: string }): Promise<User> {
    const { json } = await this.yesttp.patch<unknown>("/account", { body: data });
    return User.parse(json);
  }

  public async deleteAccount(password: string): Promise<void> {
    await this.yesttp.delete("/account", { body: { password } });
  }

  public async delete(id: string): Promise<User> {
    const { json } = await this.yesttp.delete(`/users/${id}`);
    return User.parse(json);
  }
}
