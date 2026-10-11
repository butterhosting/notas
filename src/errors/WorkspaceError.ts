import { Yexception } from "yexception";

export class WorkspaceError {
  public static readonly NAME = "WorkspaceError";

  /** Also what someone without access gets. */
  public static readonly not_found = Yexception.field<{ id: string }>();
  public static readonly name_taken = Yexception.field<{ name: string }>();
  public static readonly user_not_found = Yexception.field<{ username: string }>();
  public static readonly owner_cannot_be_member = Yexception.field<{ username: string }>();
  public static readonly member_not_found = Yexception.field<{ id: string; user: string }>();

  static {
    Yexception.initialize(this);
  }
}
