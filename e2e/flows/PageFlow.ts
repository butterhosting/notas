import { expect, Page } from "@playwright/test";

export namespace PageFlow {
  export async function create(page: Page, { title }: { title: string }): Promise<string> {
    const before = page.url();
    await page.getByRole("button", { name: "Add new", exact: true }).click();
    await expect(page).not.toHaveURL(before);
    await expect(page.getByLabel("page title")).toBeFocused();
    await page.keyboard.type(title);
    return page.url().split("/p/")[1]!;
  }

  export async function write(page: Page, text: string): Promise<void> {
    await page.getByLabel("page title").press("Enter");
    await page.keyboard.type(text);
  }

  export async function insertBlock(page: Page, name: string): Promise<void> {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`/${name}`);
    await expect(page.getByRole("listbox", { name: "blocks" })).toBeVisible();
    await page.keyboard.press("Enter");
  }

  export async function saved(page: Page): Promise<void> {
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved", { timeout: 5_000 });
  }

  export async function markdown(page: Page, id: string): Promise<string> {
    const response = await page.request.get(`/api/pages/${id}`);
    return (await response.json()).markdown;
  }
}
