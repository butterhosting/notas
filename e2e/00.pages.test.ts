import { expect, test } from "@playwright/test";
import { AppBoundary } from "./boundaries/AppBoundary";

test.beforeEach(async ({ page }) => {
  await AppBoundary.purge(page);
});

test("without pages, the home page offers to create one", async ({ page }) => {
  // given
  await AppBoundary.newUser(page);

  // when
  await page.goto("");
  // then
  await expect(page).toHaveTitle("Personal Workspace | Notas");
  await expect(page.getByText("Nothing here yet")).toBeVisible();

  // when
  await page.getByRole("button", { name: "New page", exact: true }).click();
  // then
  await expect(page).toHaveURL(/\/p\/.+/);
  await expect(page.getByTestId("sidebar-page")).toHaveCount(1);
});

test("with pages, the home page opens the first one", async ({ page }) => {
  // given
  await AppBoundary.seed(page);
  await AppBoundary.login(page, AppBoundary.KIM);

  // when
  await page.goto("");
  // then
  await expect(page).toHaveTitle("👋 Welcome to Notas | Notas");
  await expect(page.getByTestId("sidebar-page")).toHaveCount(2); // the subpage is collapsed
  await expect(page.locator(".callout")).toContainText("Type / anywhere");
});

test("an unknown route redirects home", async ({ page }) => {
  // given
  await AppBoundary.newUser(page);

  // when
  await page.goto("does-not-exist");
  // then
  await expect(page).toHaveURL(/\/$/);
});

test("a page created elsewhere shows up in the sidebar at once", async ({ page }) => {
  // given
  const { workspace } = await AppBoundary.newUser(page);
  await page.goto("");
  await expect(page.getByText("Nothing here yet")).toBeVisible();

  // when
  await page.request.post(`/api/workspaces/${workspace}/pages`, { data: { title: "From elsewhere", icon: "🛰️" } });
  // then
  await expect(page.getByTestId("sidebar-page").filter({ hasText: "From elsewhere" })).toBeVisible();
});

test("the theme follows the system until one is picked, and the pick sticks", async ({ page }) => {
  // given
  await page.emulateMedia({ colorScheme: "dark" });
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);

  // when
  await page.route("**/*.js", (route) => route.abort());
  await page.goto("");
  // then
  expect(await theme()).toEqual("dark");

  // when
  await page.unrouteAll();
  await AppBoundary.newUser(page);
  await page.goto("");
  await page.getByRole("radio", { name: "light theme" }).click();
  await page.reload();
  // then
  await expect(page.getByRole("radio", { name: "light theme" })).toHaveAttribute("aria-checked", "true");
  expect(await theme()).toEqual("light");

  // when
  await page.getByRole("radio", { name: "system theme" }).click();
  await page.emulateMedia({ colorScheme: "light" });
  // then
  await expect.poll(theme).toEqual("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(theme).toEqual("dark");
});
