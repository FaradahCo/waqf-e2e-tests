import type { Locator, Page } from "@playwright/test";
import { selectAntOption } from "../utils/antSelect";

/**
 * Wraps /admin/consultation (ConsultationForm.tsx) - despite the sidebar
 * label "الاستشارة", this is the pre-consultation questionnaire/FAQ builder,
 * not a list of consultation sessions. A single antd <Form> with a
 * `Form.List name="questions"`, each item rendered as a bordered panel with:
 * text, a "نوع الاجابة" <Select> (single/multiple/text), an inverted
 * "إمكانية تخطي هذا السؤال" checkbox (unchecked === is_required true), and -
 * for single/multiple types only - a nested `Form.List` of options plus a
 * "السماح بخيار "أخرى"" checkbox.
 *
 * GET /admin/questions only returns is_active=true rows by default (the
 * backend needs `include_inactive=1`, which this screen's service call never
 * sends), and `transformFormValues` filters to `is_active` again on the
 * frontend - so an inactive question (like the seeded text-type one) is
 * completely invisible here, with no way to view/reactivate it from this UI.
 */
export class ConsultationQuestionsPage {
  readonly page: Page;
  readonly panels: Locator;
  readonly addQuestionButton: Locator;
  readonly submitButton: Locator;
  readonly previewButton: Locator;
  readonly deleteConfirmModal: Locator;

  constructor(page: Page) {
    this.page = page;
    // Each Form.List item's wrapper div - see ConsultationForm.tsx's
    // `<div key={field.key} className="shadow-sm mb-8 border-gray-300 ...">`.
    this.panels = page.locator(".border-gray-300.border-1.border-solid.rounded-lg");
    this.addQuestionButton = page.getByRole("button", { name: "+ إضافة سؤال جديد" });
    this.submitButton = page.getByRole("button", { name: "نشر", exact: true });
    this.previewButton = page.getByRole("button", { name: "معاينة الأسئلة" });
    this.deleteConfirmModal = page
      .locator(".ant-modal-content")
      .filter({ has: page.getByText("هل انت متأكد من حذف هذا السؤال؟") });
  }

  async goto() {
    await this.page.goto("/admin/consultation");
    await this.waitForLoaded();
  }

  async waitForLoaded() {
    // The "+" button is always rendered once the form itself has replaced
    // the loading <Spin>, regardless of how many question panels exist.
    await this.addQuestionButton.waitFor({ timeout: 15_000 });
  }

  panel(index: number): Locator {
    return this.panels.nth(index);
  }

  panelCount(): Promise<number> {
    return this.panels.count();
  }

  /** The Form.Item whose label is *exactly* this text, scoped to one panel. */
  formField(panel: Locator, label: string): Locator {
    return panel.locator(".ant-form-item").filter({
      // Built from `this.page`, not re-scoped through `panel` - see antSelect
      // gotcha: `has` is already evaluated relative to each candidate.
      has: this.page.locator(".ant-form-item-label").getByText(label, { exact: true }),
    });
  }

  fieldError(panel: Locator, message: string | RegExp): Locator {
    return panel.locator(".ant-form-item-explain-error", { hasText: message });
  }

  textInput(panel: Locator): Locator {
    return panel.locator(
      'input[placeholder="يرجى كتابة السؤال بصياغة مختصرة وسهلة الفهم للعميل"]',
    );
  }

  async fillText(panel: Locator, value: string) {
    await this.textInput(panel).fill(value);
  }

  typeField(panel: Locator): Locator {
    return this.formField(panel, "نوع الاجابة");
  }

  async selectType(panel: Locator, optionText: "اجابة واحدة" | "اختيار من متعدد" | "نص") {
    await selectAntOption(this.page, this.typeField(panel), optionText);
  }

  /** Inverted checkbox: unchecked visual state means `is_required: true`. */
  skippableCheckbox(panel: Locator): Locator {
    return panel.locator(".ant-checkbox-wrapper").filter({ hasText: "إمكانية تخطي هذا السؤال" });
  }

  optionInputs(panel: Locator): Locator {
    return panel.locator('input[placeholder="اضافة خيار اخر"]');
  }

  async fillOption(panel: Locator, index: number, value: string) {
    await this.optionInputs(panel).nth(index).fill(value);
  }

  addOptionButton(panel: Locator): Locator {
    return panel.getByRole("button", { name: "إضافة خيار اخر" });
  }

  /** The "الاجابة" options block (single/multiple types only) - its outer
   * wrapper carries a plain "mt-4" class, distinct from the checkbox below
   * it (which is "mt-4!", a different literal Tailwind token). Scoping
   * remove-option buttons to this block excludes the panel header's own
   * (visually identical) delete-question button. */
  private optionsSection(panel: Locator): Locator {
    return panel.locator(".mt-4");
  }

  /** Only rendered for option rows after the first (index !== 0 in the
   * source) - so `optionIndex` 0 has no corresponding button here. */
  removeOptionButton(panel: Locator, optionIndex: number): Locator {
    return this.optionsSection(panel)
      .locator("button")
      .filter({ has: this.page.locator('img[alt="delete icon"]') })
      .nth(optionIndex - 1);
  }

  hasOtherOptionCheckbox(panel: Locator): Locator {
    return panel.locator(".ant-checkbox-wrapper").filter({ hasText: 'السماح بخيار "أخرى"' });
  }

  /** The panel header's delete-question button (trash icon), always the
   * first "delete icon"-alt button rendered in the panel - option rows'
   * remove buttons come later in the DOM and share the same alt text. */
  deleteQuestionButton(panel: Locator): Locator {
    return panel
      .locator("button")
      .filter({ has: this.page.locator('img[alt="delete icon"]') })
      .first();
  }

  // known issue: this Modal (ConsultationPanelHeader.tsx) doesn't pass
  // okText/cancelText, and - unlike every other confirm dialog in the admin
  // panel - doesn't actually pick up the app's ar_EG antd locale either, so
  // it renders plain English "OK"/"Cancel" buttons in an otherwise fully
  // Arabic/RTL screen.
  async confirmDelete() {
    await this.deleteConfirmModal.getByRole("button", { name: "OK", exact: true }).click();
  }

  async cancelDelete() {
    await this.deleteConfirmModal.getByRole("button", { name: "Cancel", exact: true }).click();
  }

  async submit() {
    await this.submitButton.click();
  }
}
