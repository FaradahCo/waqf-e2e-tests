import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * Wraps /admin/follow-requests (followRequestsList.tsx's 4 status cards +
 * CustomFilter/CustomTable). Mirrors AlwaqfListPage/ServiceProviderListPage.
 */
export class FollowRequestsListPage {
  readonly page: Page;
  readonly list: ListPage;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
  }

  async goto() {
    await this.page.goto("/admin/follow-requests");
    await this.list.waitForLoaded();
  }

  /**
   * The <CardStatistic> value for a dashboard card, matched by its *exact*
   * title text - same pattern as AlwaqfListPage.cardValue.
   */
  cardValue(title: string): Locator {
    return this.page
      .locator("p", { hasText: title })
      .locator("xpath=..")
      .locator(".text-2xl.font-semibold");
  }

  async clickRequest(idOrText: string | RegExp) {
    await this.list.rowByText(idOrText).click();
  }
}
