import { SessionRepository } from "@/repositories/SessionRepository";
import { join } from "path";
import { MediaService } from "./MediaService";
import { PageService } from "./PageService";
import { UserService } from "./UserService";
import { WorkspaceService } from "./WorkspaceService";

export class RestrictedService {
  public constructor(
    private readonly userService: UserService,
    private readonly workspaceService: WorkspaceService,
    private readonly pageService: PageService,
    private readonly mediaService: MediaService,
    private readonly sessionRepository: SessionRepository,
  ) {}

  /** Deleting the users deletes everything they own. */
  public async purge(): Promise<void> {
    for (const { id } of await this.userService.list()) {
      await this.userService.delete(id);
    }
    await this.sessionRepository.deleteAll();
    await this.mediaService.purge();
  }

  public async seed(): Promise<void> {
    await this.purge();
    const kim = await this.userService.create(RestrictedService.KIM);
    const [personal] = await this.workspaceService.list(kim);
    const welcome = await this.pageService.create(kim, personal!.id, {
      title: "Welcome to Notas",
      icon: "👋",
      cover: { src: "preset:sunset", y: 50 },
      markdown: await RestrictedService.seedMarkdown("welcome"),
    });
    await this.pageService.create(kim, personal!.id, {
      parent: welcome.id,
      title: "Markdown underneath",
      icon: "🧩",
      markdown: await RestrictedService.seedMarkdown("markdown"),
    });
    await this.pageService.create(kim, personal!.id, {
      title: "Reading list",
      icon: "📚",
      cover: { src: "preset:ocean", y: 50 },
      markdown: await RestrictedService.seedMarkdown("reading"),
    });

    const ron = await this.userService.create(RestrictedService.RON);
    const recipes = await this.workspaceService.create(ron, { name: "Recipes" });
    await this.pageService.create(ron, recipes.id, {
      title: "Pastéis de nata",
      icon: "🥧",
      markdown: "A recipe `ron` shares with `kim`, who can read it but not change it.",
    });
    await this.workspaceService.share(ron, recipes.id, { username: RestrictedService.KIM.username, role: "read" });
  }
}

export namespace RestrictedService {
  export const KIM = { username: "kim", password: "possible" };
  export const RON = { username: "ron", password: "stoppable" };
  export const SEEDS = ["welcome", "markdown", "reading"] as const;

  export async function seedMarkdown(name: (typeof SEEDS)[number]): Promise<string> {
    return await Bun.file(join(import.meta.dir, "seed", `${name}.md`)).text();
  }
}
