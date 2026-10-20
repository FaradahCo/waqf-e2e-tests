import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * Wraps /admin/follow-requests/:id (followRequestsDetails.tsx). Unlike
 * AlwaqfDetailsPage/ServiceProviderDetailsPage this is a single long page
 * with no tabs, built from several <Box> sections + a ServiceDetails card +
 * an OfferDetails (quotations) table + two Collapse'd tables (service
 * outputs, request history activity log) - so `list` (from ListPage) isn't
 * reusable as-is: there are up to 3 `.custom-table` instances on the page at
 * once. Each getter below scopes a fresh ListPage to the right container.
 */
export class FollowRequestsDetailsPage {
  readonly page: Page;
  readonly serviceDetailsSection: Locator;
  readonly statusTag: Locator;
  readonly quotationActionButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // ServiceDetails' outer wrapper - the only element with this exact
    // Tailwind combination, and it uniquely contains "تفاصيل الخدمة".
    this.serviceDetailsSection = page
      .locator("div.bg-white.shadow.p-4.mt-4")
      .filter({ has: page.locator("p", { hasText: "تفاصيل الخدمة" }) });
    // The request-status Tag (top of the section) is rendered before the
    // OfferDetails (quotations) table's own per-quotation status Tags -
    // `.first()` reliably grabs it regardless of whether any quotations exist.
    this.statusTag = this.serviceDetailsSection.locator(".ant-tag").first();
    // The "العرض الفني والمالي.pdf" preview/print button - only rendered
    // when latest_quotation is present.
    this.quotationActionButton = this.serviceDetailsSection.getByRole(
      "button",
      { name: /العرض الفني والمالي/ },
    );
  }

  async goto(id: number | string) {
    await this.page.goto(`/admin/follow-requests/${id}`);
  }

  /** A top-level <Box title="..."> section (الوقف / مزود الخدمة / المنصة / المستشار). */
  box(title: string): Locator {
    return this.page.locator("div.bg-white.rounded-lg.shadow-sm").filter({
      has: this.page.locator("h3", { hasText: title }),
    });
  }

  /**
   * The <p> value rendered as the second sibling in a
   * `<div className="flex gap-4 items-center">` label/value pair, scoped to
   * a specific Box (each label appears exactly once per box).
   */
  fieldValue(container: Locator, label: string): Locator {
    return container
      .locator("div.flex.gap-4.items-center", { hasText: label })
      .locator("p")
      .last();
  }

  /** The quotations ("تفاصيل العرض") table - the only <CustomTable> directly
   * inside the ServiceDetails section (not nested in a Collapse). */
  offerDetailsList(): ListPage {
    return new ListPage(this.page, this.serviceDetailsSection);
  }

  /** The service-outputs table, inside the "الخدمة" Collapse. */
  serviceOutputsList(): ListPage {
    const collapse = this.page
      .locator(".ant-collapse")
      .filter({ has: this.page.locator("p", { hasText: "مخرجات الخدمة" }) });
    return new ListPage(this.page, collapse);
  }

  /** The request-history/activity-log table, inside the "سجل تحديثات الطلب" Collapse. */
  requestHistoryList(): ListPage {
    const collapse = this.page
      .locator(".ant-collapse")
      .filter({ has: this.page.locator("p", { hasText: "سجل تحديثات الطلب" }) });
    return new ListPage(this.page, collapse);
  }
}
