import type { Locator, Page } from "@playwright/test";

/**
 * Wraps /admin/consultants-management (consultantsManagementList.tsx).
 * Unlike every other list screen in the app, this one is NOT built on the
 * shared <CustomTable>/<CustomFilter> pair - it's a card grid
 * (consultationManagementItem.tsx) with no filters at all, wrapped in one
 * big antd <Form> whose "حفظ" button submits every card's "تعيين كمستشار"
 * checkbox in a single updateConsultantStatus mutation. So this page object
 * does NOT reuse ListPage.
 */
export class ConsultantsManagementListPage {
  readonly page: Page;
  readonly cards: Locator;
  readonly pagination: Locator;
  readonly saveButton: Locator;
  readonly spinner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cards = page.locator(
      "div.border.border-gray-200.rounded-lg.p-4.text-center",
    );
    this.pagination = page.locator(".ant-pagination");
    this.saveButton = page.getByRole("button", { name: "حفظ" });
    this.spinner = page.locator(".ant-spin-spinning");
  }

  async goto() {
    const responsePromise = this.page.waitForResponse(
      (res) =>
        res.url().includes("/admin/providers") && res.request().method() === "GET",
    );
    await this.page.goto("/admin/consultants-management");
    await responsePromise;
    await this.spinner.waitFor({ state: "hidden" }).catch(() => {});
  }

  cardByName(name: string | RegExp): Locator {
    return this.cards.filter({ hasText: name });
  }

  consultantCheckbox(name: string | RegExp): Locator {
    return this.cardByName(name).getByRole("checkbox", {
      name: "تعيين كمستشار",
    });
  }

  viewAccountLink(name: string | RegExp): Locator {
    return this.cardByName(name).getByRole("link", { name: "عرض الحساب" });
  }
}
