import { expect, test } from "@playwright/test";
import { AppBoundary } from "./boundaries/AppBoundary";

test.beforeEach(async ({ page }) => {
  await AppBoundary.purge(page);
});

test("logged out, every way in asks to log in", async ({ page }) => {
  // when
  await page.goto("");
  // then
  await expect(page.getByRole("heading", { name: "Log in to Notas" })).toBeVisible();
  for (const url of ["/api/workspaces", "/api/users", "/media/x/y.png"]) {
    expect((await page.request.get(url)).status()).toEqual(401);
  }
});

test("the admin manages users, and users log in to their own workspace", async ({ page }) => {
  // given
  await page.goto("");

  // when
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Log in" }).click();
  // then
  await expect(page.getByRole("alert")).toHaveText("That username and password don't match.");

  // when
  await page.getByLabel("Password").fill(AppBoundary.ADMIN.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("button", { name: "New user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Username").fill("Kim");
  await dialog.getByLabel("Password").fill("kim-password");
  await dialog.getByRole("button", { name: "Create user" }).click();
  // then
  await expect(page.getByTestId("user-row")).toHaveText([/kim/]);

  // when
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByLabel("Username").fill("kim");
  await page.getByLabel("Password").fill("kim-password");
  await page.getByRole("button", { name: "Log in" }).click();
  // then
  await expect(page.getByRole("button", { name: "workspaces" })).toContainText("Personal Workspace");
  await expect(page.getByText("Nothing here yet")).toBeVisible();
});

test("deleting a user takes a typed confirmation, and everything they own", async ({ page }) => {
  // given
  await AppBoundary.seed(page);
  await AppBoundary.login(page, AppBoundary.ADMIN);
  await page.goto("");

  // when
  await page.getByTestId("user-row").filter({ hasText: "ron" }).getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  // then
  await expect(dialog.getByRole("button", { name: "Delete user" })).toBeDisabled();

  // when
  await dialog.getByLabel("confirmation").fill("ron");
  await dialog.getByRole("button", { name: "Delete user" }).click();
  // then
  await expect(page.getByTestId("user-row")).toHaveText([/kim/]);
  await AppBoundary.login(page, AppBoundary.KIM);
  const workspaces = await (await page.request.get("/api/workspaces")).json();
  expect(workspaces.map(({ name }: { name: string }) => name)).toEqual(["Personal Workspace"]);
});

test("a workspace is shared by username, read only or to write, and nobody else gets in", async ({ page }) => {
  // given
  await AppBoundary.newUser(page, "lee", "lee-password");
  const kim = await AppBoundary.newUser(page, "kim", "kim-password");
  const { id: pageId } = await (await page.request.post(`/api/workspaces/${kim.workspace}/pages`, { data: { title: "Plans" } })).json();
  const media = await (await page.request.post(`/api/workspaces/${kim.workspace}/media?filename=a.txt`, { data: "secret" })).json();

  // when
  await AppBoundary.login(page, { username: "lee", password: "lee-password" });
  // then
  expect(await (await page.request.get(`/api/pages/${pageId}`)).json()).toEqual(expect.objectContaining({ problem: "PageError::not_found" }));
  expect((await page.request.get(media.url)).status()).toEqual(400);

  // when
  await AppBoundary.login(page, kim);
  expect((await page.request.post(`/api/workspaces/${kim.workspace}/members`, { data: { username: "lee", role: "read" } })).status()).toEqual(200);
  await AppBoundary.login(page, { username: "lee", password: "lee-password" });
  // then
  expect((await page.request.get(`/api/pages/${pageId}`)).status()).toEqual(200);
  expect(await (await page.request.get(media.url)).text()).toEqual("secret");
  expect((await page.request.patch(`/api/pages/${pageId}`, { data: { title: "Mine now" } })).status()).toEqual(403);

  // when
  await AppBoundary.login(page, kim);
  const [lee] = await (await page.request.get(`/api/workspaces/${kim.workspace}/members`)).json();
  await page.request.patch(`/api/workspaces/${kim.workspace}/members/${lee.user.id}`, { data: { role: "write" } });
  await AppBoundary.login(page, { username: "lee", password: "lee-password" });
  // then
  expect((await page.request.patch(`/api/pages/${pageId}`, { data: { title: "Our plans" } })).status()).toEqual(200);
  await page.request.patch(`/api/pages/${pageId}`, { data: { deleted: true } });
  expect((await page.request.delete(`/api/pages/${pageId}`)).status()).toEqual(403);
  expect((await page.request.patch(`/api/workspaces/${kim.workspace}`, { data: { name: "Taken over" } })).status()).toEqual(403);
});

test("a shared workspace shows up in the switcher, live", async ({ page, browser }) => {
  // given
  await AppBoundary.newUser(page, "lee", "lee-password");
  await page.goto("");
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  const other = await browser.newPage();
  const kim = await AppBoundary.newUser(other, "kim", "kim-password");

  // when
  await other.request.post(`/api/workspaces/${kim.workspace}/members`, { data: { username: "lee", role: "read" } });
  // then
  await page.getByRole("button", { name: "workspaces" }).click();
  await expect(page.getByRole("menuitem").filter({ hasText: "Personal Workspace (read-only)" }).filter({ hasText: "kim" })).toBeVisible();
  await other.close();
});

test("a basic auth header works as well as a login, for a proxy doing single sign-on", async ({ page }) => {
  // given
  await AppBoundary.newUser(page, "kim", "kim-password");
  await AppBoundary.logout(page);
  const basic = (password: string) => ({ authorization: `Basic ${Buffer.from(`kim:${password}`).toString("base64")}` });

  // then
  expect((await page.request.get("/api/workspaces")).status()).toEqual(401);
  expect((await page.request.get("/api/workspaces", { headers: basic("kim-password") })).status()).toEqual(200);
  expect((await page.request.get("/api/workspaces", { headers: basic("wrong") })).status()).toEqual(401);

  // when
  await page.setExtraHTTPHeaders(basic("kim-password"));
  await page.goto("");
  // then
  await expect(page.getByRole("button", { name: "workspaces" })).toContainText("Personal Workspace");
});

test("users rename themselves, change their password, and delete their own account", async ({ page }) => {
  // given
  await AppBoundary.newUser(page);
  await page.goto("");
  const dialog = page.getByRole("dialog");
  const openAccount = async () => {
    await page.getByRole("button", { name: "workspaces" }).click();
    await page.getByRole("button", { name: /My account/ }).click();
  };

  // when
  await openAccount();
  await dialog.getByLabel("Username").fill("kimberly");
  await dialog.getByLabel("New password").fill("a new password");
  await dialog.getByLabel("Password", { exact: true }).fill("wrong");
  await dialog.getByRole("button", { name: "Save" }).click();
  // then
  await expect(dialog.getByText("That's not your current password.")).toBeVisible();

  // when
  await dialog.getByLabel("Password", { exact: true }).fill("kim-password");
  await Promise.all([page.waitForEvent("load"), dialog.getByRole("button", { name: "Save" }).click()]);
  // then
  await page.getByRole("button", { name: "workspaces" }).click();
  await expect(page.getByRole("button", { name: /My account/ })).toContainText("kimberly");
  await AppBoundary.logout(page);
  await AppBoundary.login(page, { username: "kimberly", password: "a new password" });

  // when
  await page.goto("");
  await openAccount();
  await dialog.getByRole("button", { name: "Delete account…" }).click();
  await dialog.getByLabel("Password", { exact: true }).fill("a new password");
  await dialog.getByLabel("confirmation").fill("kimberly");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  // then
  await expect(page.getByRole("heading", { name: "Log in to Notas" })).toBeVisible();
  expect((await page.request.post("/api/session", { data: { username: "kimberly", password: "a new password" } })).status()).toEqual(400);
});
