import { expect, test } from "@playwright/test";
import { AppBoundary } from "./boundaries/AppBoundary";
import { PageFlow } from "./flows/PageFlow";

test.beforeEach(async ({ page }) => {
  await AppBoundary.purge(page);
  await AppBoundary.newUser(page);
  await page.goto("");
});

test("what's typed is stored as markdown, directives included", async ({ page }) => {
  // when
  const id = await PageFlow.create(page, { title: "Trip to Lisbon" });
  await PageFlow.write(page, "Some **notes**");
  await PageFlow.insertBlock(page, "callout");
  await page.keyboard.type("Remember the tram!");
  await PageFlow.saved(page);
  // then
  await expect(page.getByTestId("sidebar-page").filter({ hasText: "Trip to Lisbon" })).toBeVisible();
  expect(await PageFlow.markdown(page, id)).toEqual('Some **notes**\n\n:::callout{icon="💡"}\nRemember the tram!\n:::');

  // when
  await page.reload();
  // then
  await expect(page.getByLabel("page title")).toHaveValue("Trip to Lisbon");
  await expect(page.locator(".callout")).toContainText("Remember the tram!");
});

test("a video can be uploaded into a page, and plays from the media endpoint", async ({ page }) => {
  // given
  const id = await PageFlow.create(page, { title: "Clips" });
  await PageFlow.write(page, "A clip:");

  // when
  await PageFlow.insertBlock(page, "video");
  await page.getByLabel("upload file").setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(64 * 1024, 7) });
  // then
  const video = page.locator(".media-video video");
  await expect(video).toBeVisible();
  const src = (await video.getAttribute("src"))!;
  expect(src).toMatch(/^\/media\/.+\/clip\.mp4$/);
  await PageFlow.saved(page);
  expect(await PageFlow.markdown(page, id)).toEqual(`A clip:\n\n::video{src="${src}"}`);

  // when
  const response = await page.request.get(src, { headers: { range: "bytes=10-19" } });
  // then
  expect(response.status()).toEqual(206);
  expect(response.headers()["content-range"]).toEqual("bytes 10-19/65536");
});

test("a page gets an icon and a cover from its header", async ({ page }) => {
  // given
  const id = await PageFlow.create(page, { title: "Decorated" });

  // when
  await page.getByLabel("page title").hover();
  await page.getByRole("button", { name: "Add cover" }).click();
  await page.getByRole("button", { name: "Add icon" }).click();
  // then
  await expect(page.getByTestId("page-cover")).toBeVisible();
  await expect(page.getByRole("button", { name: "page icon" })).toBeVisible();

  // when
  await page.getByRole("button", { name: "page icon" }).click();
  await page.keyboard.type("rocket");
  await page.getByRole("gridcell", { name: "Rocket", exact: true }).click();
  // then
  await expect(page).toHaveTitle("🚀 Decorated | Notas");
  await expect
    .poll(async () => (await (await page.request.get(`/api/pages/${id}`)).json()).icon)
    .toEqual("🚀");
});

test("a page goes to the trash with everything inside it, and can come back or be deleted for good", async ({ page }) => {
  // given
  await AppBoundary.seed(page);
  await AppBoundary.login(page, AppBoundary.KIM);
  await page.goto("");
  const welcome = page.getByTestId("sidebar-page").filter({ hasText: "Welcome to Notas" });

  // when
  await welcome.hover();
  await welcome.getByRole("button", { name: "page actions" }).click();
  await page.getByRole("button", { name: "Move to trash" }).click();
  // then
  await expect(page.getByTestId("sidebar-page")).toHaveCount(1);
  expect(await AppBoundary.pages(page)).toEqual([expect.objectContaining({ title: "Reading list" })]);

  // when
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByTestId("trash-page").filter({ hasText: "Welcome to Notas" }).getByText("Welcome to Notas").click();
  // then
  await expect(page.getByRole("alert")).toContainText("This page is in Trash.");
  await expect(page.getByLabel("page content")).toHaveAttribute("contenteditable", "false");

  // when
  await page.getByRole("button", { name: "Restore page" }).click();
  // then
  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByTestId("sidebar-page").filter({ hasText: "Welcome to Notas" })).toBeVisible();

  // when
  await welcome.hover();
  await welcome.getByRole("button", { name: "page actions" }).click();
  await page.getByRole("button", { name: "Move to trash" }).click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByTestId("trash-page").filter({ hasText: "Welcome to Notas" }).getByRole("button", { name: "delete permanently" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  // then
  await expect(dialog).not.toBeVisible();
  expect(await (await page.request.get(`/api/workspaces/${await AppBoundary.workspace(page)}/pages?deleted=true`)).json()).toEqual([]);
});

test("pages are found by their content", async ({ page }) => {
  // given
  await AppBoundary.seed(page);
  await AppBoundary.login(page, AppBoundary.KIM);
  await page.goto("");

  await expect(page.getByLabel("page content")).toBeVisible();

  // when
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByLabel("search", { exact: true }).fill("directiv");
  // then
  const result = page.getByRole("option").filter({ hasText: "Markdown underneath" });
  await expect(result).toContainText("are stored as directives");
  await expect(result.locator("mark")).toHaveText("directives");

  // when
  await page.keyboard.press("Enter");
  // then
  await expect(page).toHaveTitle("🧩 Markdown underneath | Notas");
});

test("blocks can go side by side, or behind tabs", async ({ page }) => {
  // given
  const id = await PageFlow.create(page, { title: "Layouts" });
  await PageFlow.write(page, "Left");

  // when
  await page.keyboard.type(" /2 col");
  await page.keyboard.press("Enter");
  await page.locator('[data-type="column"]').nth(1).click();
  await page.keyboard.type("Right");
  await page.locator(".notas-editor > p").last().click();
  await page.keyboard.type("/tabs");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First");
  await page.getByRole("tab", { name: "Tab 2" }).click();
  await page.keyboard.type("Second");
  await PageFlow.saved(page);
  // then
  expect(await PageFlow.markdown(page, id)).toEqual(
    [
      "::::columns",
      ":::column",
      "Left ",
      ":::",
      ":::column",
      "Right",
      ":::",
      "::::",
      "",
      "::::tabs",
      ":::tab[Tab 1]",
      "First",
      ":::",
      ":::tab[Tab 2]",
      "Second",
      ":::",
      "::::",
    ].join("\n"),
  );
  await expect(page.getByText("First")).not.toBeVisible();
});

test("a page can be dragged into another page in the sidebar, and back out", async ({ page }) => {
  // given
  await AppBoundary.seed(page);
  await AppBoundary.login(page, AppBoundary.KIM);
  await page.goto("");
  const row = (title: string) => page.getByTestId("sidebar-page").filter({ hasText: title });
  const parentOf = async (title: string) => {
    const pages = await AppBoundary.pages(page);
    const child = pages.find((p) => p.title === title)!;
    return pages.find((p) => p.id === child.parent)?.title;
  };

  // when
  await row("Reading list").dragTo(row("Welcome to Notas"), { targetPosition: { x: 100, y: 15 } });
  // then
  await expect.poll(() => parentOf("Reading list")).toEqual("Welcome to Notas");

  // when
  await row("Reading list").dragTo(row("Welcome to Notas"), { targetPosition: { x: 100, y: 2 } });
  // then
  await expect.poll(() => parentOf("Reading list")).toBeUndefined();
  await expect(page.getByTestId("sidebar-page").first()).toContainText("Reading list");
});

test("a table grows and shrinks from its handles", async ({ page }) => {
  // given
  const { id } = await (
    await page.request.post(`/api/workspaces/${await AppBoundary.workspace(page)}/pages`, {
      data: { title: "Table", markdown: "| A | B |\n| --- | --- |\n| 1 | 2 |" },
    })
  ).json();
  await page.goto(`p/${id}`);
  const cell = (text: string) => page.locator(".notas-editor td, .notas-editor th").filter({ hasText: new RegExp(`^${text}$`) });

  // when
  await cell("2").hover();
  await page.getByRole("button", { name: "add row" }).click();
  await cell("2").hover();
  await page.getByRole("button", { name: "add column" }).click();
  // then
  await PageFlow.saved(page);
  expect(await PageFlow.markdown(page, id)).toEqual("| A   | B   |     |\n| --- | --- | --- |\n| 1   | 2   |     |\n|     |     |     |");

  // when
  await cell("A").hover();
  await page.getByRole("button", { name: "row actions" }).click();
  await page.getByRole("button", { name: "Delete row" }).click();
  // then
  await PageFlow.saved(page);
  expect(await PageFlow.markdown(page, id)).toEqual("| 1   | 2   |     |\n| --- | --- | --- |\n|     |     |     |");

  // when (cursor outside the table; the move commands only see the selection)
  await page.getByLabel("page title").click();
  await cell("2").hover();
  await page.getByRole("button", { name: "column actions" }).click();
  await page.getByRole("button", { name: "Move left" }).click();
  // then
  await PageFlow.saved(page);
  expect(await PageFlow.markdown(page, id)).toEqual("| 2   | 1   |     |\n| --- | --- | --- |\n|     |     |     |");
});
