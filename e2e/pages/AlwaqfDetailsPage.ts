import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";
import { selectAntOption } from "../utils/antSelect";

export const ALWAQF_TABS = {
  profile: "الحساب الشخصي",
  requests: "الطلبات",
  consultation: "الاستشارة",
  wallet: "المحفظة",
  invoices: "الفواتير",
  reviews: "المراجعات",
} as const;

export type AlwaqfTabKey = keyof typeof ALWAQF_TABS;

/**
 * Wraps /admin/alwaqf-list/:id/* (alwaqfDetailsLayout.tsx + its 6 tab pages).
 * Each tab renders its own <CustomTable>, so `list` is re-usable across tabs -
 * just call `list.waitForLoaded()` (or `list.rowCount()`) again after
 * navigating to a new tab.
 */
export class AlwaqfDetailsPage {
  readonly page: Page;
  readonly list: ListPage;
  /** The client image + name/created_at + status <Select> bar (alwaqfHeader.tsx). */
  readonly header: Locator;
  readonly statusSelect: Locator;
  readonly waqfNameHeading: Locator;
  readonly tabsNav: Locator;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
    // The client photo's alt text is unique to alwaqfHeader.tsx - walk up
    // three levels (img -> antd's .ant-image wrapper -> name/photo flex
    // wrapper -> outer header bar) to scope everything else (the status
    // <Select>) unambiguously.
    this.header = page.locator('img[alt="صورة العميل"]').locator("../../..");
    this.statusSelect = this.header.locator(".ant-select");
    this.waqfNameHeading = this.header.locator("h2");
    this.tabsNav = page.locator(".custom-tabs");
  }

  async goto(id: number | string, tab: AlwaqfTabKey = "profile") {
    const path =
      tab === "profile"
        ? `/admin/alwaqf-list/${id}/profile`
        : `/admin/alwaqf-list/${id}/${tab}`;
    await this.page.goto(path);
  }

  tab(key: AlwaqfTabKey): Locator {
    return this.tabsNav.locator(".ant-tabs-tab", { hasText: ALWAQF_TABS[key] });
  }

  async gotoTab(key: AlwaqfTabKey) {
    await this.tab(key).click();
  }

  async setStatus(statusLabel: string) {
    await selectAntOption(this.page, this.statusSelect, statusLabel);
  }

  currentStatusText(): Locator {
    return this.statusSelect.locator(".ant-select-selection-item");
  }
}
