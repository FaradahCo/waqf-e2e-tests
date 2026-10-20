import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * Wraps /admin/service-management (serviceManagementList.tsx's 4 status
 * cards + CustomFilter/CustomTable). Filters are built inline in
 * serviceManagementList.tsx (the separate serviceManagementFilter.tsx
 * component is dead code, never imported by the list page) with labels that
 * change with the service/package radio ("اسم الخدمة"/"اسم الباقة" etc.), so
 * callers should pass whichever label matches the currently-selected type.
 */
export class ServiceManagementListPage {
  readonly page: Page;
  readonly list: ListPage;
  /** The "خدمات"/"باقات" type toggle - an unlabeled CustomFilter "radio" field. */
  readonly typeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
    this.typeToggle = page.locator(".ant-radio-group");
  }

  async goto() {
    await this.page.goto("/admin/service-management");
    await this.list.waitForLoaded();
  }

  cardValue(title: string): Locator {
    return this.page
      .locator("p", { hasText: title })
      .locator("xpath=..")
      .locator(".text-2xl.font-semibold");
  }

  async selectType(type: "الخدمات" | "الباقات") {
    // The type radio lives in the same antd <Form> as the other filters, so
    // it goes through CustomFilter's shared 800ms onValuesChange debounce
    // before actually refetching - and react-query has no keepPreviousData
    // here, so the table's dataSource transiently goes empty while the new
    // request is in flight. Waiting on the actual GET (not just a fixed
    // delay + ListPage.waitForLoaded, which would happily "pass" on that
    // transient empty state) avoids racing it.
    const responsePromise = this.page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.endsWith("/admin/services"),
    );
    await this.typeToggle.getByText(type, { exact: true }).click();
    await responsePromise;
    await this.list.waitForLoaded();
  }

  /** The service/package title link in a row - navigates to reviews/:id. */
  titleLink(title: string | RegExp): Locator {
    return this.list.rowByText(title).locator("a");
  }
}
