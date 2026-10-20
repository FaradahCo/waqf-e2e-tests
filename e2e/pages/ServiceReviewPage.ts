import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * Wraps /admin/service-management/reviews/:id (serviceReview.tsx). Renders
 * read-only service fields plus either:
 *  - a status <Select> (hold/approved/inactive/removed selectable; pending/
 *    revision_pending/draft shown but disabled) when the service has NO
 *    pending revision, or
 *  - a plain status <Tag> + "اعتماد الخدمة"/"إرجاع للمزوّد مع ملاحظات"
 *    action buttons when it DOES have one (serviceData.pending_revision).
 *
 * No seeded fixture service actually has a pending_revision row (the
 * E2EFixtureSeeder never creates one, even for the "revision_pending"-status
 * service) - so tests exercising the approve/refuse actions mock
 * GET /admin/services/:id's response to simulate one, per the repo's
 * established mocked-mutation pattern (see alwaqf/details.spec.ts,
 * service-providers/details.spec.ts).
 */
export class ServiceReviewPage {
  readonly page: Page;
  readonly headerCard: Locator;
  readonly statusSelect: Locator;
  readonly statusTag: Locator;
  readonly approveButton: Locator;
  readonly returnWithNotesButton: Locator;
  readonly rejectModal: Locator;
  readonly serviceLogCollapse: Locator;

  constructor(page: Page) {
    this.page = page;
    this.headerCard = page.locator(".bg-white.shadow.rounded-lg.p-6").first();
    this.statusSelect = this.headerCard.locator(".ant-select");
    this.statusTag = this.headerCard.locator(".ant-tag");
    this.approveButton = page.getByRole("button", { name: "اعتماد الخدمة" });
    this.returnWithNotesButton = page.getByRole("button", {
      name: "إرجاع للمزوّد مع ملاحظات",
    });
    this.rejectModal = page
      .locator(".ant-modal-content")
      .filter({ has: page.getByText("إرجاع الخدمة مع ملاحظات") });
    this.serviceLogCollapse = page.locator(".service-log-collapse");
  }

  async goto(id: number | string) {
    await this.page.goto(`/admin/service-management/reviews/${id}`);
  }

  /** A read-only Form.Item's value, matched by the field's *exact* label text. */
  field(label: string): Locator {
    return this.page
      .locator(".ant-form-item")
      .filter({
        has: this.page.locator(".ant-form-item-label").getByText(label, { exact: true }),
      })
      .locator("input, textarea")
      .first();
  }

  reasonTextarea(): Locator {
    return this.rejectModal.locator("textarea");
  }

  reasonError(): Locator {
    return this.rejectModal.getByText("يرجى إدخال ملاحظات الإدارة");
  }

  async submitReject() {
    await this.page.getByRole("button", { name: "إرسال", exact: true }).click();
  }

  async cancelReject() {
    await this.page.getByRole("button", { name: "إلغاء", exact: true }).click();
  }

  serviceLogList(): ListPage {
    return new ListPage(this.page, this.serviceLogCollapse);
  }
}
