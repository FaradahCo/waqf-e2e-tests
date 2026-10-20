import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * /admin/static-pages - list screen (staticPagesList.tsx). Row actions live
 * behind a "..." Dropdown (MoreOutlined button -> antd Menu), unlike discount
 * codes' inline edit/delete icons - so this needs its own open-menu step
 * before an action item becomes clickable.
 */
export class StaticPagesListPage {
  readonly page: Page;
  readonly list: ListPage;
  readonly addButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
    this.addButton = page.getByRole("button", { name: "صفحة جديدة" });
  }

  async goto() {
    await this.page.goto("/admin/static-pages");
    await this.list.waitForLoaded();
  }

  async clickAdd() {
    await this.addButton.click();
  }

  statusTag(row: Locator): Locator {
    return row.locator(".ant-tag");
  }

  /** Opens the row's "..." dropdown menu. Each row has exactly one action button. */
  async openRowMenu(row: Locator) {
    await row.getByRole("button").click();
  }

  async editViaMenu(row: Locator) {
    await this.openRowMenu(row);
    await this.page.getByRole("menuitem", { name: "تعديل الصفحة" }).click();
  }

  async deleteViaMenu(row: Locator) {
    await this.openRowMenu(row);
    await this.page.getByRole("menuitem", { name: "حذف الصفحة" }).click();
  }
}
