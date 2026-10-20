import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * Wraps /admin/wallet (walletList.tsx, titled "تأكيد المعاملات" in the UI -
 * this is NOT a list of wallets/balances despite the route name; it's a
 * transaction-confirmation inbox with two client-side antd <Tabs> ("سحب" for
 * withdrawals, "إيداع" for bank-transfer deposits), both hardcoded to
 * `status: "pending"` with no filter UI to ever see non-pending items here.
 * The actual wallet balances list lives at /admin/wallet/balances
 * (see WalletBalancesPage).
 *
 * walletLayout.tsx (shared by all 3 /admin/wallet/* routes) renders 4
 * dashboard <CardStatistic> cards above the <Outlet/> - cardValue() below
 * reads them, same pattern as AlwaqfListPage/ServiceProviderListPage.
 *
 * Both tabs' content are real antd Tabs panes (not separate routes), and antd
 * keeps a tab's pane mounted (display:none) once visited instead of
 * unmounting it - so `withdrawTab`/`depositTab` scope everything (including
 * the shared `.custom-table` class) to the *active* pane to avoid Playwright
 * strict-mode collisions once both tabs have been opened in one test.
 */
export class WalletTransactionsPage {
  readonly page: Page;
  readonly tabsNav: Locator;
  readonly activePane: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabsNav = page.locator(".custom-tabs, .ant-tabs").first();
    this.activePane = page.locator(".ant-tabs-tabpane-active");
  }

  async goto() {
    // See WalletPaymentsPage.goto()'s comment: wait for the real response
    // rather than risk ListPage.waitForLoaded() latching onto CustomTable's
    // transient (dimmed, but technically visible) empty placeholder during
    // the initial fetch.
    const responsePromise = this.page.waitForResponse(
      (res) => /\/admin\/withdrawals(\?|$)/.test(res.url()) && res.request().method() === "GET",
    );
    await this.page.goto("/admin/wallet");
    await responsePromise;
    await this.list().waitForLoaded();
  }

  cardValue(title: string): Locator {
    return this.page
      .locator("p", { hasText: title })
      .locator("xpath=..")
      .locator(".text-2xl.font-semibold");
  }

  /** walletLayout.tsx's wrapper around the 4 <CardStatistic>s - scope text
   * assertions here to avoid colliding with unrelated page content below
   * (e.g. a withdrawal row that happens to show the same amount). */
  get dashboardCards(): Locator {
    return this.page.locator(".flex.gap-5.flex-wrap.flex-row.flex-center.justify-start");
  }

  tab(key: "withdraw" | "deposit"): Locator {
    return this.tabsNav.locator(".ant-tabs-tab", {
      hasText: key === "withdraw" ? "سحب" : "إيداع",
    });
  }

  async gotoTab(key: "withdraw" | "deposit") {
    // The deposit tab's bank-transfer query only enables (and its
    // <CustomTable> dataSource resets to []) once this tab is first
    // selected - wait for that fetch to actually land before returning,
    // rather than racing the transient empty-table render against it.
    const endpoint = key === "withdraw" ? "withdrawals" : "bank-transfers";
    const responsePromise = this.page.waitForResponse(
      (res) =>
        new RegExp(`/admin/${endpoint}(\\?|$)`).test(res.url()) &&
        res.request().method() === "GET",
    );
    await this.tab(key).click();
    await responsePromise;
    await this.list().waitForLoaded();
  }

  /** The active tab's <CustomTable>, scoped so it never collides with the other (hidden) tab's table. */
  list(): ListPage {
    return new ListPage(this.page, this.activePane);
  }

  /** Row identified by the withdrawal/deposit's unique note or sender name text. */
  row(text: string | RegExp): Locator {
    return this.list().rowByText(text);
  }

  /**
   * known issue: walletList.config.tsx imports `Button` from "antd/es/radio"
   * (RadioButton) instead of antd's top-level Button - the "تأكيد المعاملة"
   * action in every row is actually an unlabelled, group-less radio input
   * wearing button styling. Its onClick still fires (rc-checkbox's click
   * bubbling reaches the handler either way), but the native <input
   * type="radio"> antd renders it around is visually hidden (opacity:0,
   * styling comes from the wrapping <label>) - so this clicks the wrapping
   * <label>, the same element a real user's click would land on, rather than
   * `getByRole("radio", ...)`, which resolves the never-visible <input>
   * itself and hangs waiting for it to become actionable.
   */
  confirmActionControl(rowText: string | RegExp): Locator {
    return this.row(rowText).locator("label", { hasText: "تأكيد المعاملة" });
  }

  async openConfirmModal(rowText: string | RegExp) {
    await this.confirmActionControl(rowText).click();
  }
}
