import { Yexception } from "yexception";

export class AuthError {
  public static readonly NAME = "AuthError";

  public static readonly invalid_credentials = Yexception.field();

  static {
    Yexception.initialize(this);
  }
}
