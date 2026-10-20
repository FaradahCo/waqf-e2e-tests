import { expect, type Locator, type Page } from "@playwright/test";
import { openAntSelectListbox } from "../utils/antSelect";

/**
 * Generic wrapper around the app's shared `<CustomTable>` + `<CustomFilter>`
 * components (see src/app/shared/components/customTable, custom-filter).
 * Nearly every list screen in the admin panel (alwaqf, providers, clients,
 * consultations, discount codes, static pages, ...) is built from these two,
 * so this POM captures the conventions once instead of per-module.
 */
export class ListPage {
  readonly page: Page;
  readonly root: Locator;
  readonly table: Locator;
  readonly rows: Locator;
  readonly pagination: Locator;
  readonly emptyState: Locator;
  readonly spinner: Locator;

  constructor(page: Page, root?: Locator) {
    this.page = page;
    this.root = root ?? page.locator("body");
    this.table = this.root.locator(".custom-table");
    this.rows = this.table.locator(".ant-table-tbody > tr.ant-table-row");
    this.pagination = this.root.locator(".ant-pagination");
    this.emptyState = this.table.locator(".ant-empty");
    this.spinner = this.table.locator(".ant-spin-spinning");
  }

  row(index: number): Locator {
    return this.rows.nth(index);
  }

  rowByText(text: string | RegExp): Locator {
    return this.rows.filter({ hasText: text });
  }

  /**
   * Waits until the table has actually settled on either data or the empty
   * state - checking the spinner alone races with the initial fetch, which
   * may not have started spinning yet by the time this runs.
   */
  async waitForLoaded() {
    await expect(this.rows.first().or(this.emptyState)).toBeVisible({
      timeout: 15_000,
    });
    await this.spinner.waitFor({ state: "hidden" }).catch(() => {});
  }

  async rowCount(): Promise<number> {
    await this.waitForLoaded();
    return this.rows.count();
  }

  /** The Form.Item whose <CustomFilter> label is *exactly* this text (avoids
   * substring collisions between similarly-worded filter labels). */
  filterField(label: string): Locator {
    return this.root.locator(".ant-form-item").filter({
      has: this.page.locator(".ant-form-item-label").getByText(label, { exact: true }),
    });
  }

  async searchByInput(label: string, value: string) {
    const field = this.filterField(label).locator("input");
    await field.fill(value);
    // CustomFilter debounces onValuesChange by 800ms before refetching.
    await this.page.waitForTimeout(900);
    await this.waitForLoaded();
  }

  async filterBySelect(label: string, optionText: string | RegExp) {
    const listbox = await openAntSelectListbox(this.page, this.filterField(label));
    await listbox.getByText(optionText, { exact: false }).first().click();
    await this.page.waitForTimeout(900);
    await this.waitForLoaded();
  }

  async clearFilter(label: string) {
    const field = this.filterField(label);
    await field.locator(".ant-select-clear, .ant-input-clear-icon").click();
    await this.page.waitForTimeout(900);
    await this.waitForLoaded();
  }

  paginationTotalText(): Locator {
    return this.pagination.locator(".ant-pagination-total-text");
  }

  async goToPage(page: number) {
    await this.pagination.locator(`.ant-pagination-item-${page}`).click();
    await this.waitForLoaded();
  }

  async goToNextPage() {
    await this.pagination.locator(".ant-pagination-next").click();
    await this.waitForLoaded();
  }

  isNextPageDisabled(): Locator {
    return this.pagination.locator(".ant-pagination-next.ant-pagination-disabled");
  }

  async setPageSize(size: 10 | 50 | 100 | 200) {
    const listbox = await openAntSelectListbox(this.page, this.pagination);
    await listbox.getByText(`${size} / الصفحة`).click();
    await this.waitForLoaded();
  }

  async clickRow(index: number) {
    await this.row(index).click();
  }
}
