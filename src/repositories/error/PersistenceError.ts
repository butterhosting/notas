import { SQLiteError } from "bun:sqlite";

type Reason = "primary_key_violation" | "unique_violation" | "foreign_key_violation";

export class PersistenceError extends Error {
  public static tryCast(error: unknown) {
    if (error instanceof SQLiteError) {
      switch (error.code) {
        case "SQLITE_CONSTRAINT_PRIMARYKEY":
          return new PersistenceError("primary_key_violation");
        case "SQLITE_CONSTRAINT_UNIQUE":
          return new PersistenceError("unique_violation");
        case "SQLITE_CONSTRAINT_FOREIGNKEY":
          return new PersistenceError("foreign_key_violation");
      }
    }
    return error;
  }

  public static isPrimaryKeyViolation(error: unknown) {
    return this.is(error, "primary_key_violation");
  }

  public static isUniqueViolation(error: unknown) {
    return this.is(error, "unique_violation");
  }

  public static isForeignKeyViolation(error: unknown) {
    return this.is(error, "foreign_key_violation");
  }

  private static is(error: unknown, reason: Reason): error is PersistenceError {
    return error instanceof PersistenceError && error.reason === reason;
  }

  public constructor(public readonly reason: Reason) {
    super(reason);
  }
}
