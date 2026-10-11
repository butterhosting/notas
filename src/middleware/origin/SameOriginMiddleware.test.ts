import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { SameOriginMiddleware } from "./SameOriginMiddleware";

describe(SameOriginMiddleware.name, () => {
  let middleware: SameOriginMiddleware;
  const next = mock(async () => new Response("ok"));
  const request = (method: string, headers: Record<string, string>) => new Request("http://notas.example.com/api/users", { method, headers });
  const refused = expect.objectContaining({ problem: "ServerError::cross_origin_request" });

  beforeEach(async () => {
    await TestEnvironment.initialize();
    middleware = new SameOriginMiddleware();
  });

  it("should let the app's own writes through, and refuse those another site's page sends, a sibling subdomain's too", async () => {
    // then
    expect(await (await middleware.apply(request("POST", { "sec-fetch-site": "same-origin" }), next)).text()).toEqual("ok");
    await expect(middleware.apply(request("POST", { "sec-fetch-site": "cross-site" }), next)).rejects.toEqual(refused);
    await expect(middleware.apply(request("DELETE", { "sec-fetch-site": "same-site" }), next)).rejects.toEqual(refused);
  });

  it("should let any read through, but no websocket opened from another site", async () => {
    // then
    expect(await (await middleware.apply(request("GET", { "sec-fetch-site": "cross-site" }), next)).text()).toEqual("ok");
    await expect(middleware.apply(request("GET", { "sec-fetch-site": "cross-site", upgrade: "websocket" }), next)).rejects.toEqual(refused);
    await expect(middleware.apply(request("GET", { origin: "https://evil.example", upgrade: "websocket" }), next)).rejects.toEqual(refused);
  });

  it("should compare the origin with the host where a browser sends no sec-fetch-site, behind a proxy too", async () => {
    // then
    expect(await (await middleware.apply(request("POST", { origin: "http://notas.example.com" }), next)).text()).toEqual("ok");
    expect(await (await middleware.apply(request("POST", { origin: "https://notas.example.com:8443", "x-forwarded-host": "notas.example.com:8443" }), next)).text()).toEqual("ok");
    await expect(middleware.apply(request("POST", { origin: "https://evil.example" }), next)).rejects.toEqual(refused);
    await expect(middleware.apply(request("POST", { origin: "null" }), next)).rejects.toEqual(refused);
  });

  it("should let a client that is no browser through, since nobody can make it act for them", async () => {
    // then
    expect(await (await middleware.apply(request("POST", {}), next)).text()).toEqual("ok");
  });
});
