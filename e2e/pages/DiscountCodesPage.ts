import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";
import { openAntSelectListbox, selectAntOption } from "../utils/antSelect";

export type DiscountCodeFormValues = {
  code?: string;
  percentage?: number;
  type?: "الكل" | "خدمة" | "باقة";
  serviceName?: string;
  startAt?: string; // YYYY-MM-DD
  expiresAt?: string; // YYYY-MM-DD
  remainingUses?: number;
};

/** /admin/discound-codes */
export class DiscountCodesPage {
  readonly page: Page;
  readonly list: ListPage;
  readonly addButton: Locator;
  readonly modal: Locator;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
    this.addButton = page.getByRole("button", { name: "إضافة كود" });
    this.modal = page.locator(".ant-modal-content");
  }

  async goto() {
    await this.page.goto("/admin/discound-codes");
    await this.list.waitForLoaded();
  }

  async openCreateModal() {
    await this.addButton.click();
    await this.modal.locator(".ant-modal-title", { hasText: "إضافة كود خصم جديد" }).waitFor();
  }

  /** Matches the Form.Item whose label is *exactly* this text - labels like
   * "نوع الكود" / "تاريخ بداية الكود" all contain "الكود" as a substring, so
   * a substring match on the whole form item would be ambiguous. */
  formField(label: string): Locator {
    return this.modal.locator(".ant-form-item").filter({
      // `has` is evaluated relative to each candidate already, so this must
      // NOT be re-scoped through `this.modal` (that would look for a nested
      // .ant-modal-content inside the form item, which never matches).
      has: this.page.locator(".ant-form-item-label").getByText(label, { exact: true }),
    });
  }

  fieldError(message: string | RegExp): Locator {
    return this.modal.locator(".ant-form-item-explain-error", {
      hasText: message,
    });
  }

  async fillCode(value: string) {
    await this.formField("الكود").locator("input").fill(value);
  }

  async fillPercentage(value: number) {
    await this.formField("نسبة الخصم").locator("input").fill(String(value));
  }

  private serviceField(): Locator {
    return this.modal.locator(".ant-form-item").filter({
      has: this.page
        .locator(".ant-form-item-label")
        .getByText(/^(اسم الخدمة|اسم الباقة|اسم الخدمه \/ الباقة)$/),
    });
  }

  async selectType(optionText: "الكل" | "خدمة" | "باقة") {
    await selectAntOption(this.page, this.formField("نوع الكود"), optionText);
  }

  async selectService(serviceTitle: string) {
    await selectAntOption(this.page, this.serviceField(), serviceTitle);
    await this.page.keyboard.press("Escape");
  }

  /** Picks whichever real service option comes first, skipping the pseudo "select all"/"clear all" rows. */
  async selectFirstServiceOption() {
    const listbox = await openAntSelectListbox(this.page, this.serviceField());
    await listbox.locator(".ant-select-item-option").nth(2).click();
    await this.page.keyboard.press("Escape");
  }

  async fillStartAt(date: string) {
    const input = this.formField("تاريخ بداية الكود").locator("input");
    await input.fill(date);
    await input.press("Enter");
  }

  async fillExpiresAt(date: string) {
    const input = this.formField("تاريخ نهاية الكود").locator("input");
    await input.fill(date);
    await input.press("Enter");
  }

  async fillRemainingUses(value: number) {
    await this.formField("عدد مرات الاستخدام").locator("input").fill(String(value));
  }

  async fillForm(values: DiscountCodeFormValues) {
    if (values.code !== undefined) await this.fillCode(values.code);
    if (values.percentage !== undefined) await this.fillPercentage(values.percentage);
    if (values.type !== undefined) await this.selectType(values.type);
    if (values.serviceName !== undefined) await this.selectService(values.serviceName);
    if (values.startAt !== undefined) await this.fillStartAt(values.startAt);
    if (values.expiresAt !== undefined) await this.fillExpiresAt(values.expiresAt);
    if (values.remainingUses !== undefined)
      await this.fillRemainingUses(values.remainingUses);
  }

  async submit() {
    await this.modal.getByRole("button", { name: "حفظ" }).click();
  }

  async cancel() {
    await this.modal.getByRole("button", { name: "إلغاء" }).click();
  }

  rowActions(rowIndex: number) {
    const row = this.list.row(rowIndex);
    return {
      edit: row.locator(".anticon-edit").locator(".."),
      delete: row.locator(".anticon-delete").locator(".."),
    };
  }
}
