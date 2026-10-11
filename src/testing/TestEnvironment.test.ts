import { Sqlite } from "@/drizzle/sqlite";
import { Env } from "@/Env";
import { EventBus } from "@/events/EventBus";
import { Logger } from "@/Logger";
import { LogLevel } from "@/models/internal/LogLevel";
import { MediaRepository } from "@/repositories/MediaRepository";
import { PageRepository } from "@/repositories/PageRepository";
import { SessionRepository } from "@/repositories/SessionRepository";
import { UserRepository } from "@/repositories/UserRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { WorkspaceService } from "@/services/WorkspaceService";
import { User } from "@/models/User";
import { TestFixture } from "./TestFixture.test";
import { OmitBetter } from "@/types/OmitBetter";
import { jest, mock, Mock } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { dirname, join } from "path";

export namespace TestEnvironment {
  export const ADMIN_PASSWORD = "admin";
  // bcrypt's lowest cost, to keep the tests fast
  export const ADMIN_PASSWORD_HASH = "$2b$04$B4N2vBJsz9wR1mBT0wyx0.X7/zilw.cL6S3oHMq80F.IHl7tpWoKW";

  type Mocked<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock<T[K]> : never;
  } & {
    cast: () => T;
  };

  export interface Context {
    env: Env.Private;
    sqlite: Sqlite;
    patchEnvironmentVariables(environment: Record<string, string>): void;
    eventBus: EventBus;
    pageRepository: PageRepository;
    pageRepositoryMock: Mocked<PageRepository>;
    mediaRepository: MediaRepository;
    mediaRepositoryMock: Mocked<MediaRepository>;
    userRepository: UserRepository;
    userRepositoryMock: Mocked<UserRepository>;
    sessionRepository: SessionRepository;
    sessionRepositoryMock: Mocked<SessionRepository>;
    workspaceRepository: WorkspaceRepository;
    workspaceRepositoryMock: Mocked<WorkspaceRepository>;
    workspaceServiceMock: Mocked<WorkspaceService>;
    // with a user who owns it
    persistWorkspace(id?: string): Promise<{ user: User; workspace: string }>;
  }

  const cleanupTasks: Array<() => unknown | Promise<unknown>> = [];
  const originalEnv = { ...Bun.env };

  export async function initialize(): Promise<Context> {
    mock.restore();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    Object.assign(Bun.env, originalEnv);
    while (cleanupTasks.length > 0) {
      const task = cleanupTasks.pop()!; // reverse order matters
      await task();
    }

    const cwd = await (async function ensureValidCwd(): Promise<string> {
      const cwd = process.cwd();
      const packageJsonPath = join(cwd, "package.json");
      const packageJsonFile = Bun.file(packageJsonPath);
      if (!(await packageJsonFile.exists())) {
        throw new Error(`Invalid working directory, package.json not found: ${packageJsonPath}`);
      }
      const { name } = await packageJsonFile.json();
      if (name !== "notas") {
        throw new Error(`Invalid working directory, invalid project name in package.json: ${name}`);
      }
      return cwd;
    })();

    // a fixed root: test files can't run in parallel
    const unitTestRoot = join(cwd, "opt", "unit-test");
    const env = Env.initialize("UTC", {
      NOTAS_STAGE: "dev",
      NOTAS_TIMEZONE: "UTC",
      NOTAS_ROOT: join(unitTestRoot, "notas"),
      NOTAS_LOGGING: LogLevel.warn,
      NOTAS_ADMIN_PASSWORD: ADMIN_PASSWORD_HASH,
    });
    const patchEnvironmentVariables = (environment: Record<string, string>) => {
      Object.assign(Bun.env, environment);
    };

    Logger.initialize(env);

    await mkdir(dirname(env.NOTAS_DATABASE), { recursive: true });
    await Promise.all(
      [`${env.NOTAS_DATABASE}`, `${env.NOTAS_DATABASE}-wal`, `${env.NOTAS_DATABASE}-shm`].map((file) => rm(file, { force: true })),
    );
    await rm(env.NOTAS_MEDIA, { recursive: true, force: true });

    const sqlite = await Sqlite.initialize(env);
    cleanupTasks.push(() => sqlite.close());

    function registerMockObject<T>(mockObject: OmitBetter<Mocked<T>, "cast">): Mocked<T> {
      const extra = { cast: () => mockObject as T } as Pick<Mocked<T>, "cast">;
      Object.assign(mockObject, extra);
      return mockObject as Mocked<T>;
    }

    const eventBus = new EventBus();
    const pageRepository = new PageRepository(sqlite);
    const pageRepositoryMock = registerMockObject<PageRepository>({
      list: mock(),
      find: mock(),
      create: mock(),
      update: mock(),
      search: mock(),
      delete: mock(),
    });
    const mediaRepository = new MediaRepository(sqlite, env);
    const mediaRepositoryMock = registerMockObject<MediaRepository>({
      writeFile: mock(),
      deleteFile: mock(),
      deleteWorkspaceFiles: mock(),
      file: mock(),
      create: mock(),
      find: mock(),
      markReferences: mock(),
      findUnreferencedSince: mock(),
      delete: mock(),
      deleteAll: mock(),
    });
    const userRepository = new UserRepository(sqlite);
    const userRepositoryMock = registerMockObject<UserRepository>({
      list: mock(),
      find: mock(),
      findByUsername: mock(),
      findWithPasswordHash: mock(),
      create: mock(),
      update: mock(),
      delete: mock(),
    });
    const sessionRepository = new SessionRepository(sqlite);
    const sessionRepositoryMock = registerMockObject<SessionRepository>({
      create: mock(),
      find: mock(),
      extend: mock(),
      delete: mock(),
      deleteForUser: mock(),
      deleteExpired: mock(),
      deleteAll: mock(),
    });
    const workspaceRepository = new WorkspaceRepository(sqlite);
    const workspaceRepositoryMock = registerMockObject<WorkspaceRepository>({
      listFor: mock(),
      findFor: mock(),
      idsOwnedBy: mock(),
      audience: mock(),
      create: mock(),
      update: mock(),
      delete: mock(),
      members: mock(),
      setMember: mock(),
      removeMember: mock(),
    });
    const workspaceServiceMock = registerMockObject<WorkspaceService>({
      list: mock(),
      require: mock(),
      create: mock(),
      rename: mock(),
      delete: mock(),
      members: mock(),
      share: mock(),
      changeRole: mock(),
      unshare: mock(),
      audience: mock(),
    });

    async function persistWorkspace(id = TestFixture.WORKSPACE) {
      const user = await userRepository.create(TestFixture.user(), ADMIN_PASSWORD_HASH);
      await workspaceRepository.create({ id, owner: user.id, name: `Workspace ${id}`, created: user.created });
      return { user, workspace: id };
    }

    return {
      persistWorkspace,
      env,
      sqlite,
      patchEnvironmentVariables,
      eventBus,
      pageRepository,
      pageRepositoryMock,
      mediaRepository,
      mediaRepositoryMock,
      userRepository,
      userRepositoryMock,
      sessionRepository,
      sessionRepositoryMock,
      workspaceRepository,
      workspaceRepositoryMock,
      workspaceServiceMock,
    };
  }
}
