import type { Locator, Page } from "@playwright/test";

export type ScopeLabel = "كلاهما" | "عميل" | "مزود خدمة";

/**
 * /admin/static-pages/new-page and /admin/static-pages/edit/:id
 * (staticPageForm.tsx) - both routes render the same component, so this POM
 * covers both. Unlike DiscountCodesPage, this form is a dedicated route, not
 * a modal - so every locator is scoped to the page body, not a `.ant-modal`.
 */
export class StaticPageFormPage {
  readonly page: Page;
  readonly card: Locator;
  readonly titleInput: Locator;
  readonly slugInput: Locator;
  /** Tiptap's contenteditable root (see richTextEditor.tsx) - not a plain input/textarea. */
  readonly contentEditor: Locator;
  readonly previewButton: Locator;
  readonly submitButton: Locator;
  /** richTextEditor.tsx's toolbar "🖼️ صورة" button - prompts via
   * `window.prompt()` for an image URL (see insertImage()). */
  readonly insertImageButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.card = page.locator(".ant-card");
    this.titleInput = this.formField("عنوان الصفحة").locator("input");
    this.slugInput = this.formField("رابط الصفحة").locator("input");
    this.contentEditor = page.locator(".ProseMirror");
    this.previewButton = page.getByRole("button", { name: "معاينة الصفحة" });
    this.submitButton = page.getByRole("button", { name: "نشر", exact: true });
    this.insertImageButton = page.getByRole("button", { name: "🖼️ صورة" });
  }

  async gotoNew() {
    await this.page.goto("/admin/static-pages/new-page");
    await this.card.waitFor();
  }

  async gotoEdit(id: number) {
    await this.page.goto(`/admin/static-pages/edit/${id}`);
    await this.card.waitFor();
  }

  /** Matches the Form.Item whose label is *exactly* this text - "عنوان الصفحة"
   * and "محتوى الصفحة" both contain "الصفحة" as a substring, so a substring
   * match on the whole form item would be ambiguous. */
  formField(label: string): Locator {
    return this.page.locator(".ant-form-item").filter({
      // `has` is evaluated relative to each candidate already, so this must
      // NOT be re-scoped through a parent locator (see antSelect.ts's note).
      has: this.page.locator(".ant-form-item-label").getByText(label, { exact: true }),
    });
  }

  fieldError(message: string | RegExp): Locator {
    return this.page.locator(".ant-form-item-explain-error", { hasText: message });
  }

  async fillTitle(value: string) {
    await this.titleInput.fill(value);
  }

  async fillSlug(value: string) {
    await this.slugInput.fill(value);
  }

  /** Replaces the editor's entire content by focusing it, selecting
   * everything, and typing - Tiptap has no plain-value `.fill()` target. */
  async setContent(value: string) {
    await this.contentEditor.click();
    await this.page.keyboard.press("ControlOrMeta+A");
    await this.page.keyboard.press("Backspace");
    if (value) {
      await this.page.keyboard.type(value);
    }
  }

  async contentText(): Promise<string> {
    return (await this.contentEditor.innerText()).trim();
  }

  async contentHtml(): Promise<string> {
    return this.contentEditor.innerHTML();
  }

  /** Answers the toolbar's `window.prompt("أدخل رابط الصورة:")` with `url` and
   * inserts it at the current cursor position (see richTextEditor.tsx's
   * image toolbar button). Click inside the editor first if you need a
   * specific cursor position - this just accepts whatever prompt appears. */
  async insertImage(url: string) {
    this.page.once("dialog", (dialog) => dialog.accept(url));
    await this.insertImageButton.click();
  }

  /** The 4 plain <Checkbox> fields have no Form.Item `label` prop (the
   * checkbox's own child text IS the label) - so they can't use formField(). */
  checkboxWrapper(label: string): Locator {
    return this.page.locator(".ant-checkbox-wrapper").filter({
      has: this.page.getByText(label, { exact: true }),
    });
  }

  checkboxInput(label: string): Locator {
    return this.checkboxWrapper(label).locator('input[type="checkbox"]');
  }

  async setCheckbox(label: string, checked: boolean) {
    const input = this.checkboxInput(label);
    const isChecked = await input.isChecked();
    if (isChecked !== checked) {
      await this.checkboxWrapper(label).click();
    }
  }

  /** Plain antd <Radio.Group>/<Radio.Button> - no antSelect helper needed. */
  scopeOption(label: ScopeLabel): Locator {
    return this.formField("نوع المستخدم").locator(".ant-radio-button-wrapper").filter({
      has: this.page.getByText(label, { exact: true }),
    });
  }

  async selectScope(label: ScopeLabel) {
    await this.scopeOption(label).click();
  }

  async selectedScopeLabel(): Promise<string> {
    const checked = this.formField("نوع المستخدم").locator(
      ".ant-radio-button-wrapper-checked",
    );
    return (await checked.innerText()).trim();
  }

  async submit() {
    await this.submitButton.click();
  }
}
