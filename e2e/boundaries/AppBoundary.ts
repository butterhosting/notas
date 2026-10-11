import { Page } from "@playwright/test";

export namespace AppBoundary {
  // admin from .env.e2e, kim from `seed`
  export const ADMIN = { username: "admin", password: "admin" };
  export const KIM = { username: "kim", password: "possible" };

  export async function purge(page: Page) {
    await page.request.post("/api/restricted/purge", { failOnStatusCode: true });
  }

  export async function seed(page: Page) {
    await page.request.post("/api/restricted/seed", { failOnStatusCode: true });
  }

  // The browser's fetch, not `page.request`: under Bun, Playwright can't parse a `set-cookie` (it reads `response.url`,
  // which Bun fills with the bare path). The cookie still lands in the context `page.request` shares.
  export async function login(page: Page, credentials: { username: string; password: string }) {
    await session(page, "POST", credentials);
  }

  export async function logout(page: Page) {
    await session(page, "DELETE");
  }

  async function session(page: Page, method: "POST" | "DELETE", body?: unknown) {
    if (!page.url().startsWith("http")) {
      await page.goto("/health");
    }
    await page.evaluate(
      async ({ method, body }) => {
        const response = await fetch("/api/session", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (!response.ok) throw new Error(`${method} /api/session: ${response.status}`);
      },
      { method, body },
    );
  }

  export async function newUser(page: Page, username = "kim", password = "kim-password") {
    await login(page, ADMIN);
    await page.request.post("/api/users", { data: { username, password }, failOnStatusCode: true });
    await login(page, { username, password });
    const [workspace] = await (await page.request.get("/api/workspaces")).json();
    return { username, password, workspace: workspace.id as string };
  }

  export async function workspace(page: Page): Promise<string> {
    const workspaces: { id: string; role: string }[] = await (await page.request.get("/api/workspaces")).json();
    return workspaces.find(({ role }) => role === "owner")!.id;
  }

  export async function pages(page: Page): Promise<{ id: string; title: string; parent?: string }[]> {
    return await (await page.request.get(`/api/workspaces/${await workspace(page)}/pages`)).json();
  }
}
