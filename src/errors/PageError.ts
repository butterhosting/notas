import { Yexception } from "yexception";

export class PageError {
  public static readonly NAME = "PageError";

  public static readonly not_found = Yexception.field<{ id: string }>();
  public static readonly parent_not_found = Yexception.field<{ parent: string }>();
  public static readonly parent_is_descendant = Yexception.field<{ id: string; parent: string }>();
  public static readonly revision_conflict = Yexception.field<{ id: string; revision: number }>();
  public static readonly in_trash = Yexception.field<{ id: string }>();
  public static readonly not_in_trash = Yexception.field<{ id: string }>();

  static {
    Yexception.initialize(this);
  }
}
