import { Temporal } from "@js-temporal/polyfill";
import { isAbsolute, join } from "path";
import { z } from "zod/v4";
import packageJson from "../package.json";
import { TimeZone } from "./helpers/TimeZone";
import { ZodParser } from "./helpers/ZodParser";
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
    NOTAS_ADMIN_PASSWORD: z
      .string()
      .optional()
      .refine((hash) => !hash || /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash), {
        error: "not a bcrypt hash; in an .env file, escape every $ as \\$",
      }),
    INTERACTIVE_DEMO: ZodParser.boolean(),
  });

  type Defaultable = ExtractBetter<keyof z.input<typeof Schema>, "NOTAS_TIMEZONE" | "NOTAS_LOGGING" | "NOTAS_UPLOAD_LIMIT" | "INTERACTIVE_DEMO">;
  const Defaults: Record<Defaultable, string> = {
    NOTAS_TIMEZONE: "UTC",
    NOTAS_LOGGING: "info",
    NOTAS_UPLOAD_LIMIT: "1024",
    INTERACTIVE_DEMO: "false",
  };

  export function initialize(timezone = Temporal.Now.timeZoneId() as "UTC", environment: Record<string, string | undefined> = Bun.env) {
    if (timezone !== "UTC") {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
    const { provided, merged } = withDefaults(environment);
    return Schema.refine(({ NOTAS_ADMIN_PASSWORD, INTERACTIVE_DEMO }) => NOTAS_ADMIN_PASSWORD || INTERACTIVE_DEMO, {
      path: ["NOTAS_ADMIN_PASSWORD"],
      error: "required, as a bcrypt hash of the admin's password",
    })
      .transform(({ NOTAS_ROOT, NOTAS_ADMIN_PASSWORD, ...env }) => ({
        ...env,
        NOTAS_ROOT: isAbsolute(NOTAS_ROOT) ? NOTAS_ROOT : join(process.cwd(), NOTAS_ROOT),
        // empty, as `.env.prod` leaves it, is unset; the demo goes without an admin
        NOTAS_ADMIN_PASSWORD: NOTAS_ADMIN_PASSWORD || undefined,
      }))
      .transform((env) => ({
        ...env,
        NOTAS_COMMIT: packageJson.commit.slice(0, 7),
        NOTAS_VERSION: packageJson.version,
        // the demo keeps nothing, and keeps its uploads away from a data folder that might be mounted
        NOTAS_DATABASE: env.INTERACTIVE_DEMO ? ":memory:" : join(env.NOTAS_ROOT, "data", "db.sqlite"),
        NOTAS_MEDIA: env.INTERACTIVE_DEMO ? join(env.NOTAS_ROOT, "demo", "media") : join(env.NOTAS_ROOT, "data", "media"),
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
  export type Public = Readonly<
    Pick<Private, "NOTAS_STAGE" | "NOTAS_TIMEZONE" | "NOTAS_COMMIT" | "NOTAS_VERSION" | "NOTAS_UPLOAD_LIMIT" | "INTERACTIVE_DEMO">
  >;
  export function onlyPublic(env: Private): Public {
    return {
      NOTAS_STAGE: env.NOTAS_STAGE,
      NOTAS_TIMEZONE: env.NOTAS_TIMEZONE,
      NOTAS_COMMIT: env.NOTAS_COMMIT,
      NOTAS_VERSION: env.NOTAS_VERSION,
      NOTAS_UPLOAD_LIMIT: env.NOTAS_UPLOAD_LIMIT,
      INTERACTIVE_DEMO: env.INTERACTIVE_DEMO,
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
