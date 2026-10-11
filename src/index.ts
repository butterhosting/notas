import { mkdir } from "fs/promises";
import { dirname } from "path";
import { Sqlite } from "./drizzle/sqlite";
import { Env } from "./Env";
import { Logger } from "./Logger";
import { Server } from "./Server";
import { ServerRegistry } from "./ServerRegistry";

Logger.initialize(Env.initialize.partiallyForLogger());

const env = Env.initialize();

await mkdir(dirname(env.NOTAS_DATABASE), { recursive: true });
await mkdir(env.NOTAS_MEDIA, { recursive: true });

const sqlite = await Sqlite.initialize(env);

const registry = await ServerRegistry.bootstrap(env, sqlite);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    await registry.get(Server).stop();
    sqlite.close();
    process.exit(0);
  });
}
