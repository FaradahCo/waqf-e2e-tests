import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/** /admin/alwaqf-list (alwaqfList.tsx) */
export class AlwaqfListPage {
  readonly page: Page;
  readonly list: ListPage;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
  }

  async goto() {
    await this.page.goto("/admin/alwaqf-list");
    await this.list.waitForLoaded();
  }

  /**
   * The <CardStatistic> value for a dashboard card, matched by its *exact*
   * title text. CardStatistic renders `<span class="text-2xl font-semibold">
   * {value}</span><p>{title}</p>` as siblings under one div, so this walks
   * from the (unique) title <p> up to that div and back down to the span -
   * same pattern as the discount-codes hardcoded-card reference test.
   */
  cardValue(title: string): Locator {
    return this.page
      .locator("p", { hasText: title })
      .locator("xpath=..")
      .locator(".text-2xl.font-semibold");
  }
}
