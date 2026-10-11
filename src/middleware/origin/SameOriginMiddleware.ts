import { ServerError } from "@/errors/ServerError";
import { MiddlewareHandler } from "../MiddlewareHandler";

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

/**
 * Refuses what another site's page makes a browser send here, along with whatever credentials it holds for this host: a
 * Basic header, an SSO proxy's cookie, our own cookie from a sibling subdomain. Reads may pass, since the browser keeps
 * their answers from that page; a websocket may not, since it hands over everything it hears.
 */
export class SameOriginMiddleware implements MiddlewareHandler {
  public async apply(request: Request, next: () => Promise<Response>): Promise<Response> {
    if (needsCheck(request) && !isSameOrigin(request)) {
      throw ServerError.cross_origin_request();
    }
    return await next();
  }
}

function needsCheck(request: Request): boolean {
  return !SAFE_METHODS.includes(request.method) || request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

// browsers send `sec-fetch-site`, older ones at least `origin` on a cross-origin write; a client sending neither is no
// browser, and can't be made to act for anyone
function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) {
    return site === "same-origin" || site === "none";
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  // a proxy may rewrite the host; another site's page can't forge `x-forwarded-host`, a custom header needing a preflight
  // this server never grants
  const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
  return URL.parse(origin)?.host === host;
}
