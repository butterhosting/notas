import { Temporal } from "@js-temporal/polyfill";
import { basename } from "path";
import { Env } from "./Env";
import { LogLevel } from "./models/internal/LogLevel";

export class Logger {
  private static timeZone: string;
  private static globalLogLevel: LogLevel;
  private static readonly emojis: Record<LogLevel, string> = {
    [LogLevel.debug]: "🐞",
    [LogLevel.info]: "ℹ️",
    [LogLevel.warn]: "⚠️",
    [LogLevel.error]: "❌",
  };

  public static initialize(env: Pick<Env.Private, "NOTAS_TIMEZONE" | "NOTAS_LOGGING">) {
    this.timeZone = env.NOTAS_TIMEZONE;
    this.globalLogLevel = env.NOTAS_LOGGING;
  }

  private readonly filename: string;
  private readonly initTiming: Logger.InitTiming;

  public constructor(file: string, initTiming: Logger.InitTiming = "eager") {
    this.initTiming = initTiming;
    if (initTiming === "eager") {
      this.requireInitialization();
    }
    this.filename = basename(file);
  }

  public debug = (...args: unknown[]) => {
    this.log(LogLevel.debug, ...args);
  };

  public info = (...args: unknown[]) => {
    this.log(LogLevel.info, ...args);
  };

  public warn = (...args: unknown[]) => {
    this.log(LogLevel.warn, ...args);
  };

  public error = (...args: unknown[]) => {
    this.log(LogLevel.error, ...args);
  };

  private log = (level: LogLevel, ...args: unknown[]) => {
    if (this.initTiming === "lazy") {
      this.requireInitialization();
    }
    if (this.shouldLog(level)) {
      const timestamp = Temporal.Now.plainDateTimeISO(Logger.timeZone).toString({ smallestUnit: "second" }).replace("T", " ");
      const prefix = `${timestamp} [${level.toUpperCase()}] ${Logger.emojis[level]} ${this.filename} |`;
      console[level].call(console, prefix, ...this.resolve(args));
    }
  };

  private resolve = (args: unknown[]): unknown[] => {
    if (args.length !== 1 || typeof args[0] !== "function") {
      return args;
    }
    const produced = (args[0] as Logger.Lazy)();
    return Array.isArray(produced) ? produced : [produced];
  };

  private requireInitialization = () => {
    if (!Logger.globalLogLevel) {
      throw new Error("Logger must be initialized first");
    }
  };

  private shouldLog = (level: LogLevel): boolean => {
    switch (Logger.globalLogLevel) {
      case LogLevel.debug:
        return true;
      case LogLevel.info:
        return [LogLevel.info, LogLevel.warn, LogLevel.error].includes(level);
      case LogLevel.warn:
        return [LogLevel.warn, LogLevel.error].includes(level);
      case LogLevel.error:
        return [LogLevel.error].includes(level);
    }
  };
}

export namespace Logger {
  /** `eager` checks for {@link Logger.initialize} at construction; `lazy` at the first log, for module-scope loggers. */
  export type InitTiming = "eager" | "lazy";

  /** Defers building a message, e.g. `log.debug(() => ["parsed", summary(batch)])`; an array is spread as arguments. */
  export type Lazy = () => unknown;
}
