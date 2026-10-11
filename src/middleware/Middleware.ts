import { LoggingMiddleware } from "./logging/LoggingMiddleware";
import { MiddlewareHandler } from "./MiddlewareHandler";
import { SameOriginMiddleware } from "./origin/SameOriginMiddleware";

export class Middleware {
  private readonly middlewares: MiddlewareHandler[];

  public constructor(loggingMiddleware: LoggingMiddleware, sameOriginMiddleware: SameOriginMiddleware) {
    this.middlewares = [loggingMiddleware, sameOriginMiddleware];
  }

  public handle<R extends Request>(request: R, handler: () => Promise<Response>): Promise<Response> {
    const chain = this.middlewares.reduceRight<() => Promise<Response>>(
      (next, middleware) => () => middleware.apply(request, next),
      () => handler(),
    );
    return chain();
  }
}
