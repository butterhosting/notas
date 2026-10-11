import { expect, test } from "@playwright/test";
import { AppBoundary } from "./boundaries/AppBoundary";

let workspace: string;

test.beforeEach(async ({ page }) => {
  await AppBoundary.purge(page);
  workspace = (await AppBoundary.newUser(page)).workspace;
});

test("the pages api supports crud, with the trash as an update", async ({ page }) => {
  // when
  const created = await page.request.post(`/api/workspaces/${workspace}/pages`, { data: { title: "Groceries", markdown: "- [ ] milk" } });
  // then
  expect(created.status()).toEqual(200);
  const groceries = await created.json();
  expect(groceries).toEqual(
    expect.objectContaining({ object: "page", workspace, title: "Groceries", markdown: "- [ ] milk", revision: 1, position: 1 }),
  );

  // when
  const child = await (await page.request.post(`/api/workspaces/${workspace}/pages`, { data: { parent: groceries.id, title: "Shops" } })).json();
  const listed = await (await page.request.get(`/api/workspaces/${workspace}/pages`)).json();
  // then
  expect(listed).toEqual([expect.objectContaining({ id: groceries.id }), expect.objectContaining({ id: child.id, parent: groceries.id })]);
  expect(listed[0].markdown).toBeUndefined();

  // when
  const updated = await (await page.request.patch(`/api/pages/${groceries.id}`, { data: { markdown: "- [x] milk", revision: 1, icon: "🥛" } })).json();
  // then
  expect(updated).toEqual(expect.objectContaining({ markdown: "- [x] milk", revision: 2, icon: "🥛", updated: expect.any(String) }));

  // when
  await page.request.patch(`/api/pages/${groceries.id}`, { data: { deleted: true } });
  // then
  expect(await (await page.request.get(`/api/workspaces/${workspace}/pages`)).json()).toEqual([]);
  expect(await (await page.request.get(`/api/workspaces/${workspace}/pages?deleted=true`)).json()).toEqual([
    expect.objectContaining({ id: groceries.id, deleted: expect.any(String) }),
  ]);

  // when
  await page.request.patch(`/api/pages/${groceries.id}`, { data: { deleted: false } });
  // then
  expect(await (await page.request.get(`/api/workspaces/${workspace}/pages`)).json()).toHaveLength(2);

  // when
  expect(await (await page.request.delete(`/api/pages/${groceries.id}`)).json()).toEqual({
    problem: "PageError::not_in_trash",
    details: { id: groceries.id },
  });
  await page.request.patch(`/api/pages/${groceries.id}`, { data: { deleted: true } });
  expect((await page.request.delete(`/api/pages/${groceries.id}`)).status()).toEqual(200);
  // then
  expect(await (await page.request.get(`/api/workspaces/${workspace}/pages?deleted=true`)).json()).toEqual([]);
  expect((await page.request.get(`/api/pages/${child.id}`)).status()).toEqual(400);
});

test("the pages api refuses a body based on an old revision", async ({ page }) => {
  // given
  const { id } = await (await page.request.post(`/api/workspaces/${workspace}/pages`, { data: { markdown: "v1" } })).json();
  await page.request.patch(`/api/pages/${id}`, { data: { markdown: "v2", revision: 1 } });

  // when
  const response = await page.request.patch(`/api/pages/${id}`, { data: { markdown: "also v2", revision: 1 } });
  // then
  expect(response.status()).toEqual(400);
  expect(await response.json()).toEqual({ problem: "PageError::revision_conflict", details: { id, revision: 2 } });
});

test("the pages api refuses to move a page into itself", async ({ page }) => {
  // given
  const parent = await (await page.request.post(`/api/workspaces/${workspace}/pages`, { data: {} })).json();
  const child = await (await page.request.post(`/api/workspaces/${workspace}/pages`, { data: { parent: parent.id } })).json();

  // when
  const response = await page.request.patch(`/api/pages/${parent.id}`, { data: { parent: child.id } });
  // then
  expect(await response.json()).toEqual({ problem: "PageError::parent_is_descendant", details: { id: parent.id, parent: child.id } });
});

test("the search api finds pages by prefix, ignoring accents, and leaves out the trash", async ({ page }) => {
  // given
  await page.request.post(`/api/workspaces/${workspace}/pages`, { data: { title: "Lisbon", markdown: "Eat **pastéis** de nata." } });
  const trashed = await (await page.request.post(`/api/workspaces/${workspace}/pages`, { data: { title: "Pastries" } })).json();
  await page.request.patch(`/api/pages/${trashed.id}`, { data: { deleted: true } });

  // when
  const results = await (await page.request.get(`/api/workspaces/${workspace}/search?q=PASTEI`)).json();
  // then
  expect(results).toEqual([{ object: "search_result", page: expect.objectContaining({ title: "Lisbon" }), snippet: "Eat \u0002pastéis\u0003 de nata." }]);
});

test("a page exports as a markdown file with frontmatter", async ({ page }) => {
  // given
  const { id } = await (
    await page.request.post(`/api/workspaces/${workspace}/pages`, { data: { title: "Lisbon", icon: "🚋", markdown: ':::callout{icon="💡"}\nTram!\n:::' } })
  ).json();

  // when
  const response = await page.request.get(`/api/pages/${id}/markdown`);
  // then
  expect(response.headers()["content-disposition"]).toEqual("attachment; filename*=UTF-8''Lisbon.md");
  expect(await response.text()).toEqual('---\ntitle: "Lisbon"\nicon: "🚋"\n---\n\n:::callout{icon="💡"}\nTram!\n:::');
});

test("the media api stores an upload and serves it back", async ({ page }) => {
  // when
  const response = await page.request.post(`/api/workspaces/${workspace}/media?filename=notes.txt`, {
    headers: { "content-type": "text/plain" },
    data: "hello world",
  });
  // then
  const media = await response.json();
  expect(media).toEqual(expect.objectContaining({ object: "media", workspace, filename: "notes.txt", mime: "text/plain", size: 11 }));

  // when
  const served = await page.request.get(media.url);
  // then
  expect(await served.text()).toEqual("hello world");
  expect(served.headers()["content-security-policy"]).toEqual("sandbox");
});

test("the api returns a problem for an unknown page or media", async ({ page }) => {
  // then
  expect(await (await page.request.get("/api/pages/does-not-exist")).json()).toEqual({ problem: "PageError::not_found", details: { id: "does-not-exist" } });
  expect(await (await page.request.get("/media/does-not-exist/x.png")).json()).toEqual({ problem: "MediaError::not_found", details: { id: "does-not-exist" } });
});

test("the health endpoint is available, to anyone", async ({ page }) => {
  // given
  await AppBoundary.logout(page);

  // when
  const response = await page.request.get("/health");
  // then
  expect(response.status()).toEqual(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
