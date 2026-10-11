import { Temporal } from "@js-temporal/polyfill";
import { isAbsolute, join } from "path";
import { z } from "zod/v4";
import packageJson from "../package.json";
import { TimeZone } from "./helpers/TimeZone";
import { LogLevel } from "./models/internal/LogLevel";
import { ExtractBetter } from "./types/ExtractBetter";

export namespace Env {
  const Schema = z.object({
    NOTAS_STAGE: z.enum(["dev", "e2e", "prod"]),
    NOTAS_TIMEZONE: z.string().refine((tz) => TimeZone.check(tz), {
      error: "invalid_timezone",
    }),

    NOTAS_ROOT: z.string(),
    NOTAS_LOGGING: z.enum(LogLevel),
    // MB; Bun refuses a larger body before any handler sees it
    NOTAS_UPLOAD_LIMIT: z.coerce.number().int().positive(),
    // a bcrypt hash; in an .env file, escape every `$` as `\$` (`bun --env-file` expands it even in quotes)
    NOTAS_ADMIN_PASSWORD: z.string().regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, {
      error: "not a bcrypt hash; in an .env file, escape every $ as \\$",
    }),
  });

  type Defaultable = ExtractBetter<keyof z.input<typeof Schema>, "NOTAS_TIMEZONE" | "NOTAS_LOGGING" | "NOTAS_UPLOAD_LIMIT">;
  const Defaults: Record<Defaultable, string> = {
    NOTAS_TIMEZONE: "UTC",
    NOTAS_LOGGING: "info",
    NOTAS_UPLOAD_LIMIT: "1024",
  };

  export function initialize(timezone = Temporal.Now.timeZoneId() as "UTC", environment: Record<string, string | undefined> = Bun.env) {
    if (timezone !== "UTC") {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
    const { provided, merged } = withDefaults(environment);
    return Schema.transform(({ NOTAS_ROOT, ...env }) => ({
      ...env,
      NOTAS_ROOT: isAbsolute(NOTAS_ROOT) ? NOTAS_ROOT : join(process.cwd(), NOTAS_ROOT),
    }))
      .transform((env) => ({
        ...env,
        NOTAS_COMMIT: packageJson.commit.slice(0, 7),
        NOTAS_VERSION: packageJson.version,
        NOTAS_DATABASE: join(env.NOTAS_ROOT, "data", "db.sqlite"),
        NOTAS_MEDIA: join(env.NOTAS_ROOT, "data", "media"),
        NOTAS_PROVIDED: provided,
      }))
      .parse(merged);
  }
  initialize.partiallyForLogger = (environment: Record<string, string | undefined> = Bun.env) => {
    const { merged } = withDefaults(environment);
    return Schema.partial()
      .required({
        NOTAS_TIMEZONE: true,
        NOTAS_LOGGING: true,
      })
      .parse(merged);
  };

  export type Private = ReturnType<typeof initialize>;
  export type Public = Readonly<Pick<Private, "NOTAS_STAGE" | "NOTAS_TIMEZONE" | "NOTAS_COMMIT" | "NOTAS_VERSION" | "NOTAS_UPLOAD_LIMIT">>;
  export function onlyPublic(env: Private): Public {
    return {
      NOTAS_STAGE: env.NOTAS_STAGE,
      NOTAS_TIMEZONE: env.NOTAS_TIMEZONE,
      NOTAS_COMMIT: env.NOTAS_COMMIT,
      NOTAS_VERSION: env.NOTAS_VERSION,
      NOTAS_UPLOAD_LIMIT: env.NOTAS_UPLOAD_LIMIT,
    };
  }

  // an env file expands an unset variable to nothing, so empty counts as unset
  function withDefaults(environment: Record<string, string | undefined>) {
    const provided: Partial<Record<Defaultable, string>> = {};
    const merged = { ...environment };
    for (const key of Object.keys(Defaults) as Defaultable[]) {
      const value = environment[key];
      if (value) {
        provided[key] = value;
      } else {
        merged[key] = Defaults[key];
      }
    }
    return { provided, merged };
  }
}
