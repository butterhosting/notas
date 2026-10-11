import { Yexception } from "yexception";

export class MediaError {
  public static readonly NAME = "MediaError";

  public static readonly not_found = Yexception.field<{ id: string }>();
  public static readonly missing_body = Yexception.field();

  static {
    Yexception.initialize(this);
  }
}
