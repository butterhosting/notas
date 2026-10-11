import { Yexception } from "yexception";

export class ServerError {
  public static readonly NAME = "ServerError";

  public static readonly unknown = Yexception.field();
  public static readonly socket_upgrade_failed = Yexception.field();
  public static readonly route_not_found = Yexception.field();
  public static readonly missing_query_parameter = Yexception.field();
  public static readonly invalid_request_body = Yexception.field();
  public static readonly unauthorized = Yexception.field();
  public static readonly forbidden = Yexception.field();

  static {
    Yexception.initialize(this);
  }
}
