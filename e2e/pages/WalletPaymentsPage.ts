import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";
import { openAntSelectListbox } from "../utils/antSelect";

/**
 * Wraps /admin/wallet/payments (paymentsList.tsx, "جدول وبيانات المعاملات
 * المالية"). Two client-side antd <Tabs>: "العملاء" (paymentClientsList.tsx,
 * GET admin/payments) and "مزودي الخدمات" (paymentsProvider.tsx) - the latter
 * is a suspicious copy-paste: its data comes from
 * walletService.getPaymentsProvider(), which actually calls GET
 * admin/withdrawals (the same endpoint the /admin/wallet withdraw tab uses),
 * not any real provider-earnings/payments endpoint - see the "known issue"
 * test in payments.spec.ts.
 *
 * Like WalletTransactionsPage, both tabs are antd Tabs panes kept mounted
 * (hidden) after being visited, so `list()` scopes to the active pane only.
 * The single "الحالة" status <Select> filter is shared across both tabs, but
 * its *options* swap per tab (payment statuses for "العملاء", withdrawal
 * statuses for "مزودي الخدمات") - another symptom of the same endpoint mixup.
 */
export class WalletPaymentsPage {
  readonly page: Page;
  readonly tabsNav: Locator;
  readonly activePane: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabsNav = page.locator(".ant-tabs").first();
    this.activePane = page.locator(".ant-tabs-tabpane-active");
  }

  async goto() {
    // CustomTable's dataSource is [] until the first response lands, and
    // antd's Table still renders (a dimmed) ".ant-empty" placeholder under
    // its loading spinner during that window - waiting for the real response
    // first avoids ListPage.waitForLoaded() latching onto that transient
    // empty render instead of the real one (more likely to bite under the
    // full suite's parallel workers sharing one local backend).
    const responsePromise = this.page.waitForResponse(
      (res) => /\/admin\/payments(\?|$)/.test(res.url()) && res.request().method() === "GET",
    );
    await this.page.goto("/admin/wallet/payments");
    await responsePromise;
    await this.list().waitForLoaded();
  }

  tab(key: "clients" | "providers"): Locator {
    return this.tabsNav.locator(".ant-tabs-tab", {
      hasText: key === "clients" ? "العملاء" : "مزودي الخدمات",
    });
  }

  async gotoTab(key: "clients" | "providers") {
    // The other tab's query only enables (dataSource resets to []) once
    // selected - wait for the actual fetch rather than racing the transient
    // empty-table render against it.
    const endpoint = key === "clients" ? "payments" : "withdrawals";
    const responsePromise = this.page.waitForResponse(
      (res) =>
        new RegExp(`/admin/${endpoint}(\\?|$)`).test(res.url()) &&
        res.request().method() === "GET",
    );
    await this.tab(key).click();
    await responsePromise;
    await this.list().waitForLoaded();
  }

  list(): ListPage {
    return new ListPage(this.page, this.activePane);
  }

  /** The page-level "الحالة" status filter (outside any tab pane, shared by both tabs). */
  statusFilterField(): Locator {
    return this.page.locator(".ant-form-item").filter({
      has: this.page.locator(".ant-form-item-label").getByText("الحالة", { exact: true }),
    });
  }

  async filterByStatus(optionText: string | RegExp) {
    const listbox = await openAntSelectListbox(this.page, this.statusFilterField());
    // CustomTable clears its dataSource to [] while a refetch is in flight,
    // which can flash the ".ant-empty" state before the filtered response
    // lands - waiting on the debounced request itself (rather than a fixed
    // timeout) avoids racing that transient empty render.
    const responsePromise = this.page.waitForResponse(
      (res) =>
        /\/admin\/(payments|withdrawals)(\?|$)/.test(res.url()) &&
        res.request().method() === "GET",
    );
    await listbox.getByText(optionText, { exact: false }).first().click();
    await responsePromise;
    await this.list().waitForLoaded();
  }
}
