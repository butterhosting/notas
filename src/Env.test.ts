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
    expect(Object.keys(Env.onlyPublic(env)).sort()).toEqual([
      "INTERACTIVE_DEMO",
      "NOTAS_COMMIT",
      "NOTAS_STAGE",
      "NOTAS_TIMEZONE",
      "NOTAS_UPLOAD_LIMIT",
      "NOTAS_VERSION",
    ]);
  });

  it("should refuse an admin password that isn't a bcrypt hash, like one an env file mangled", () => {
    // given (what `bun --env-file` makes of an unescaped `$2b$10$…`)
    const mangled = "/0pDC93VzwHNeHLgKgPWEZI2IMwRBS6foXuqQNncqPQ.";
    // then
    expect(() => Env.initialize("UTC", { ...REQUIRED, NOTAS_ADMIN_PASSWORD: mangled })).toThrow("in an .env file, escape every $");
  });

  it("should require an admin password, also where an env file leaves it empty", () => {
    // then
    for (const NOTAS_ADMIN_PASSWORD of [undefined, ""]) {
      expect(() => Env.initialize("UTC", { ...REQUIRED, NOTAS_ADMIN_PASSWORD })).toThrow("NOTAS_ADMIN_PASSWORD");
    }
  });

  it("should run the demo without an admin, on a database in memory, and keep its uploads out of the data folder", () => {
    // when
    const env = Env.initialize("UTC", { ...REQUIRED, NOTAS_ADMIN_PASSWORD: "", INTERACTIVE_DEMO: "true" });
    // then
    expect(env.INTERACTIVE_DEMO).toBeTrue();
    expect(env.NOTAS_ADMIN_PASSWORD).toBeUndefined();
    expect(env.NOTAS_DATABASE).toEqual(":memory:");
    expect(env.NOTAS_MEDIA).toEqual("/opt/notas/demo/media");
    expect(Env.initialize("UTC", REQUIRED)).toEqual(expect.objectContaining({ INTERACTIVE_DEMO: false, NOTAS_MEDIA: "/opt/notas/data/media" }));
  });
});
