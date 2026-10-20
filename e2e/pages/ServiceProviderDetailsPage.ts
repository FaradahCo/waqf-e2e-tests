import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

export const SERVICE_PROVIDER_TABS = {
  profile: "الحساب الشخصي",
  services: "الخدمات",
  requests: "الطلبات",
  consultation: "الاستشارة",
  wallet: "المحفظة",
  invoices: "الفواتير",
  reviews: "المراجعات",
} as const;

export type ServiceProviderTabKey = keyof typeof SERVICE_PROVIDER_TABS;

/**
 * Wraps /admin/service-providers/:id/* (serviceProviderDetailsLayout.tsx +
 * its 7 tab pages). Each tab renders its own <CustomTable>, so `list` is
 * re-usable across tabs - just call `list.waitForLoaded()` again after
 * navigating to a new tab. Mirrors AlwaqfDetailsPage's shape with one extra
 * tab ("services") and a different header/status-change UI: instead of an
 * always-present status <Select>, ActionHeader (actionHeader.tsx) only shows
 * "قبول"/"رفض" action buttons while status === "review"; for every other
 * status it renders a plain read-only <Tag>.
 */
export class ServiceProviderDetailsPage {
  readonly page: Page;
  readonly list: ListPage;
  /** The logo + business name/created_at + status area (actionHeader.tsx). */
  readonly header: Locator;
  readonly businessNameHeading: Locator;
  readonly statusTag: Locator;
  readonly acceptButton: Locator;
  readonly rejectButton: Locator;
  readonly tabsNav: Locator;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
    // actionHeader.tsx's outer wrapper - this exact Tailwind class
    // combination (bg-white + p-4 + rounded-lg + shadow + mt-4) is unique to
    // this component on the details page (profile.tsx's collapsible section
    // cards use p-6/mt-2 instead).
    this.header = page.locator(".bg-white.p-4.rounded-lg.shadow.mt-4");
    this.businessNameHeading = this.header.locator("p.text-lg.font-bold");
    this.statusTag = this.header.locator(".ant-tag");
    this.acceptButton = this.header.getByRole("button", { name: "قبول" });
    this.rejectButton = this.header.getByRole("button", { name: "رفض" });
    this.tabsNav = page.locator(".custom-tabs");
  }

  async goto(id: number | string, tab: ServiceProviderTabKey = "profile") {
    const path =
      tab === "profile"
        ? `/admin/service-providers/${id}/profile`
        : `/admin/service-providers/${id}/${tab}`;
    await this.page.goto(path);
  }

  tab(key: ServiceProviderTabKey): Locator {
    return this.tabsNav.locator(".ant-tabs-tab", {
      hasText: SERVICE_PROVIDER_TABS[key],
    });
  }

  async gotoTab(key: ServiceProviderTabKey) {
    await this.tab(key).click();
  }
}
