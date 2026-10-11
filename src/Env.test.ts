import { LogLevel } from "@/models/internal/LogLevel";
import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { beforeEach, describe, expect, it } from "bun:test";
import { Env } from "./Env";

describe("Env", () => {
  const REQUIRED = {
    NOTAS_STAGE: "dev",
    NOTAS_ROOT: "/opt/notas",
    NOTAS_ADMIN_PASSWORD: TestEnvironment.ADMIN_PASSWORD_HASH,
  };

  beforeEach(async () => {
    await TestEnvironment.initialize();
  });

  it("should fall back to a default for what is unset or empty, and remember what was provided", () => {
    // given
    const env = Env.initialize("UTC", { ...REQUIRED, NOTAS_LOGGING: "debug", NOTAS_TIMEZONE: "" });
    // then
    expect(env.NOTAS_LOGGING).toEqual(LogLevel.debug);
    expect(env.NOTAS_TIMEZONE).toEqual("UTC");
    expect(env.NOTAS_PROVIDED).toEqual({ NOTAS_LOGGING: "debug" });
  });

  it("should expose only the public keys", () => {
    // given
    const env = Env.initialize("UTC", REQUIRED);
    // then
    expect(Object.keys(Env.onlyPublic(env)).sort()).toEqual(["NOTAS_COMMIT", "NOTAS_STAGE", "NOTAS_TIMEZONE", "NOTAS_UPLOAD_LIMIT", "NOTAS_VERSION"]);
  });

  it("should refuse an admin password that isn't a bcrypt hash, like one an env file mangled", () => {
    // given (what `bun --env-file` makes of an unescaped `$2b$10$…`)
    const mangled = "/0pDC93VzwHNeHLgKgPWEZI2IMwRBS6foXuqQNncqPQ.";
    // then
    expect(() => Env.initialize("UTC", { ...REQUIRED, NOTAS_ADMIN_PASSWORD: mangled })).toThrow("in an .env file, escape every $");
  });
});
