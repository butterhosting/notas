import { Yesttp } from "yesttp";

export class RestrictedClient {
  public constructor(private readonly yesttp: Yesttp) {}

  public async purge(): Promise<void> {
    await this.yesttp.post("/restricted/purge");
  }

  public async seed(): Promise<void> {
    await this.yesttp.post("/restricted/seed");
  }
}
