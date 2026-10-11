import { Yexception } from "yexception";

export class AuthError {
  public static readonly NAME = "AuthError";

  public static readonly invalid_credentials = Yexception.field();
  public static readonly too_many_attempts = Yexception.field<{ retryAfter: number }>();

  static {
    Yexception.initialize(this);
  }
}
