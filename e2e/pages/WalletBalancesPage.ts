import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

export const BALANCES_TABS = {
  platform: "المنصة",
  providers: "مزودي الخدمات",
  clients: "العملاء",
} as const;

export type BalancesTabKey = keyof typeof BALANCES_TABS;

/**
 * Wraps /admin/wallet/balances (balancesList.tsx, "الأرصدة") - 3 client-side
 * antd <Tabs>, each fetching GET admin/wallet with a different `type` query
 * param: "provider"/"client" for their respective tabs, but the "platform"
 * tab calls getWallets() with NO type param at all - so it never actually
 * asks the backend for the platform-only wallet (which the API supports via
 * `filter[type]=platform`, confirmed via a direct API check). It just lists
 * every wallet in the system (every client + every provider + the platform
 * row) under a tab literally labeled "المنصة" - see the "known issue" test.
 *
 * All 3 tabs are antd Tabs panes kept mounted (hidden) once visited, so
 * `list()` scopes to the active pane only, same as the other wallet pages.
 */
export class WalletBalancesPage {
  readonly page: Page;
  readonly tabsNav: Locator;
  readonly activePane: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabsNav = page.locator(".ant-tabs").first();
    this.activePane = page.locator(".ant-tabs-tabpane-active");
  }

  async goto() {
    // See WalletPaymentsPage.goto()'s comment: wait for the real response
    // rather than risk ListPage.waitForLoaded() latching onto CustomTable's
    // transient (dimmed, but technically visible) empty placeholder during
    // the initial fetch.
    const responsePromise = this.page.waitForResponse(
      (res) => /\/admin\/wallet(\?|$)/.test(res.url()) && res.request().method() === "GET",
    );
    await this.page.goto("/admin/wallet/balances");
    await responsePromise;
    await this.list().waitForLoaded();
  }

  tab(key: BalancesTabKey): Locator {
    return this.tabsNav.locator(".ant-tabs-tab", { hasText: BALANCES_TABS[key] });
  }

  async gotoTab(key: BalancesTabKey) {
    // Each tab's wallet query only enables (dataSource resets to []) once
    // selected - wait for the actual fetch rather than racing the transient
    // empty-table render against it.
    const responsePromise = this.page.waitForResponse(
      (res) => /\/admin\/wallet(\?|$)/.test(res.url()) && res.request().method() === "GET",
    );
    await this.tab(key).click();
    await responsePromise;
    await this.list().waitForLoaded();
  }

  list(): ListPage {
    return new ListPage(this.page, this.activePane);
  }
}
