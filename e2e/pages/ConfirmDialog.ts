import type { Locator, Page } from "@playwright/test";

/** The shared <Confirm> component (src/app/shared/components/confirm) rendered inside an antd Modal. */
export class ConfirmDialog {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  dialogWithTitle(title: string): Locator {
    return this.page.locator(".ant-modal-content", { hasText: title });
  }

  async confirm(title: string, confirmText: string) {
    await this.dialogWithTitle(title)
      .getByRole("button", { name: confirmText, exact: true })
      .click();
  }

  async cancel(title: string, cancelText: string) {
    await this.dialogWithTitle(title)
      .getByRole("button", { name: cancelText, exact: true })
      .click();
  }
}
