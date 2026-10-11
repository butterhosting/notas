import { Yexception } from "yexception";

export class UserError {
  public static readonly NAME = "UserError";

  public static readonly not_found = Yexception.field<{ id: string }>();
  public static readonly username_taken = Yexception.field<{ username: string }>();
  public static readonly wrong_password = Yexception.field();

  static {
    Yexception.initialize(this);
  }
}
