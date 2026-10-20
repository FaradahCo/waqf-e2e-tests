import type { Locator, Page } from "@playwright/test";

/** Page object for the single login screen at "/". */
export class LoginPage {
  readonly page: Page;
  readonly identifierInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.identifierInput = page.getByLabel(/البريد الإلكتروني/);
    this.passwordInput = page.getByLabel("كلمة المرور", { exact: true });
    this.submitButton = page.getByRole("button", { name: "تسجيل الدخول" });
  }

  async goto() {
    await this.page.goto("/");
  }

  async fillIdentifier(value: string) {
    await this.identifierInput.fill(value);
  }

  async fillPassword(value: string) {
    await this.passwordInput.fill(value);
  }

  async submit() {
    await this.submitButton.click();
  }

  async login(identifier: string, password: string) {
    await this.fillIdentifier(identifier);
    await this.fillPassword(password);
    await this.submit();
  }

  /** Antd Form.Item validation error text under a given field. */
  fieldError(message: string | RegExp): Locator {
    return this.page.locator(".ant-form-item-explain-error", {
      hasText: message,
    });
  }
}
