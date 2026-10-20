import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * Wraps /admin/service-providers (serviceProviderLayout.tsx's status cards +
 * serviceProvidersList.tsx's CustomFilter/CustomTable).
 */
export class ServiceProviderListPage {
  readonly page: Page;
  readonly list: ListPage;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
  }

  async goto() {
    await this.page.goto("/admin/service-providers");
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

  /**
   * serviceProvidersListConfig.tsx only makes the business-name <span>
   * clickable (with its own onClick + event.stopPropagation()) -
   * serviceProvidersList.tsx never passes an `onRow` prop to <CustomTable>,
   * so (unlike AlwaqfListPage/ListPage.clickRow) clicking elsewhere on the
   * row does nothing.
   */
  businessNameLink(name: string | RegExp): Locator {
    return this.list.rowByText(name).locator("span.underline.cursor-pointer");
  }

  async clickProvider(name: string | RegExp) {
    await this.businessNameLink(name).click();
  }

  /**
   * The two per-row <Switch> toggles (السوق الوقفي then الإستشارة, in that
   * column order) that call updateMarketplaceStatus.
   */
  toggleSwitch(rowName: string | RegExp, field: "waqfMarket" | "consultant"): Locator {
    const row = this.list.rowByText(rowName);
    const switches = row.locator(".ant-switch");
    return field === "waqfMarket" ? switches.nth(0) : switches.nth(1);
  }
}
