import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * Wraps /admin/settings (commissionSettings.tsx). A single settings form
 * with only TWO editable rate inputs - "نسبة العمولة للمزود الأول (العارض)"
 * (`main_commission_rate`) and "نسبة العمولة للمزود الثاني (المستشار)"
 * (`offering_provider_commission_rate`) - plus a read-only "سجل تحديثات
 * العمولة" log table below it.
 *
 * Despite the model exposing a third `subcontractor_commission_rate` field,
 * there is NO form input for it anywhere on this page: `handleSubmit` always
 * re-sends whatever value was last fetched (`settings?.subcontractor_commission_rate`)
 * untouched, so it can never actually be changed through this UI.
 */
export class CommissionSettingsPage {
  readonly page: Page;
  readonly logsCard: Locator;
  readonly logsList: ListPage;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logsCard = page
      .locator(".ant-card")
      .filter({ has: page.getByText("سجل تحديثات العمولة") });
    this.logsList = new ListPage(page, this.logsCard);
    this.saveButton = page.getByRole("button", { name: "حفظ التغييرات" });
  }

  async goto() {
    await this.page.goto("/admin/settings");
    await this.waitForLoaded();
  }

  async waitForLoaded() {
    await this.mainRateField().locator("input").waitFor({ timeout: 15_000 });
  }

  /** The Form.Item whose label is *exactly* this text (top-level page, no modal). */
  formField(label: string): Locator {
    return this.page.locator(".ant-form-item").filter({
      has: this.page.locator(".ant-form-item-label").getByText(label, { exact: true }),
    });
  }

  fieldError(message: string | RegExp): Locator {
    return this.page.locator(".ant-form-item-explain-error", { hasText: message });
  }

  mainRateField(): Locator {
    return this.formField("نسبة العمولة للمزود الأول (العارض)");
  }

  offeringRateField(): Locator {
    return this.formField("نسبة العمولة للمزود الثاني (المستشار)");
  }

  mainRateInput(): Locator {
    return this.mainRateField().locator("input");
  }

  offeringRateInput(): Locator {
    return this.offeringRateField().locator("input");
  }

  async fillMainRate(value: number) {
    await this.mainRateInput().fill(String(value));
  }

  async fillOfferingRate(value: number) {
    await this.offeringRateInput().fill(String(value));
  }

  async save() {
    await this.saveButton.click();
  }
}
