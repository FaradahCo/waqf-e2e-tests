import type { Locator, Page } from "@playwright/test";
import { ListPage } from "./ListPage";

/**
 * /admin (home.tsx) - the post-login landing page. Every widget fetches its
 * own data independently (dashboardCards, generalStatistics, qualityControl
 * and confirmationRequestsTable each own their own useApiQuery call) - only
 * `dashboardOverview`/`reviewRequest` are lifted into home.tsx itself and
 * gate the page behind a single full-screen <Spin/> until both resolve.
 */
export class HomeDashboardPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto("/admin");
    // home.tsx blocks on a full-screen <Spin/> until dashboardOverview +
    // reviewRequest both resolve - wait for the page heading rather than the
    // spinner, which may already be gone by the time we look.
    await this.page.getByRole("heading", { name: "الرئيسية", exact: true }).waitFor();
  }

  /** Card `<h3>` label -> its ancestor grid-cell -> the finance-type value
   * `<p class="text-2xl font-semibold">` (see card.tsx `type="finance"`). */
  financeCardValue(label: string): Locator {
    return this.page
      .locator("h3", { hasText: label })
      .locator("xpath=ancestor::div[contains(@class,'grid-cols-[1fr_3rem]')][1]")
      .locator("p.text-2xl.font-semibold");
  }

  /** The finance card's trend percentage text + color-bearing element. Excludes
   * `.text-2xl` to avoid also matching the value <p> (which also carries
   * `font-semibold`). */
  financeCardTrend(label: string): Locator {
    return this.page
      .locator("h3", { hasText: label })
      .locator("xpath=ancestor::div[contains(@class,'grid-cols-[1fr_3rem]')][1]")
      .locator("p.font-semibold:not(.text-2xl)");
  }

  /** Overview-type card (card.tsx `type="overview"`) - value+unit share one <p>. */
  overviewCardValue(label: string): Locator {
    return this.page
      .locator("h3", { hasText: label, exact: true })
      .locator("xpath=following-sibling::p[1]");
  }

  overviewCardTrendPercent(label: string): Locator {
    return this.page
      .locator("h3", { hasText: label, exact: true })
      .locator("xpath=ancestor::div[contains(@class,'flex-col gap-4')][1]")
      .locator("p.font-semibold");
  }

  /** "طلبات المراجعة والاعتماد" clickable stat cards, by their exact label text. */
  reviewStatCard(label: string): Locator {
    return this.page.locator("p", { hasText: label }).locator("xpath=ancestor::div[@class][1]");
  }

  reviewStatCount(label: string): Locator {
    return this.reviewStatCard(label).locator("span.text-3xl");
  }

  get financialSummaryDatePicker(): Locator {
    return this.page.locator("h2", { hasText: "المالية" }).locator(
      "xpath=ancestor::div[1]",
    ).locator(".ant-picker");
  }

  get generalStatisticsDatePicker(): Locator {
    return this.page.locator("h2", { hasText: "إحصائيات عامة" }).locator(
      "xpath=ancestor::div[1]",
    ).locator(".ant-picker");
  }

  /** Opens an antd month-picker and steps back `yearsBack` years (its panel
   * only ever renders the super-prev/next, i.e. +/-1 year, buttons - see
   * rc-picker's MonthPanel, which never passes a plain `offset`), then picks
   * the January cell of whatever year that lands on. */
  async pickPastMonth(datePicker: Locator, yearsBack: number) {
    await datePicker.click();
    const dropdown = this.page.locator(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)");
    await dropdown.waitFor({ state: "visible" });
    const superPrev = dropdown.locator(".ant-picker-header-super-prev-btn");
    for (let i = 0; i < yearsBack; i++) {
      await superPrev.click();
    }
    await dropdown.locator(".ant-picker-cell-in-view").first().click();
  }

  /** "طلبات الاعتماد" widget's type selector ("سحب"/"إيداع") + its bare <CustomTable>. */
  get approvalTableTypeSelect(): Locator {
    return this.page.locator("h2", { hasText: "طلبات الاعتماد" }).locator(
      "xpath=ancestor::div[1]",
    ).locator(".ant-select");
  }

  async selectApprovalTableType(label: "سحب" | "إيداع") {
    await this.approvalTableTypeSelect.click();
    await this.page
      .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
      .getByText(label, { exact: true })
      .click();
  }

  approvalTable(): ListPage {
    // ancestor::div[2]: div[1] is the inner "flex justify-between" row shared
    // with the h2/Select, div[2] is the outer wrapper that also contains the
    // sibling <CustomTable>.
    return new ListPage(
      this.page,
      this.page.locator("h2", { hasText: "طلبات الاعتماد" }).locator("xpath=ancestor::div[2]"),
    );
  }

  get qualityControlSection(): Locator {
    // div[1] is the "مراقبة الجودة" header row alone; div[2] is the outer
    // wrapper that also contains the sibling alerts card.
    return this.page.locator("h2", { hasText: "مراقبة الجودة" }).locator("xpath=ancestor::div[2]");
  }

  get qualityAlertRows(): Locator {
    return this.qualityControlSection.locator(".rounded-xl.shadow-md > div > div.flex-wrap");
  }

  get recentActivitiesSection(): Locator {
    // div[1] is the header-only row; div[2] is the outer card that also
    // contains the sibling "divide-y" activities list.
    return this.page.locator("h2", { hasText: "أحدث الأنشطة" }).locator("xpath=ancestor::div[2]");
  }

  get topRequestedServicesSection(): Locator {
    return this.page.locator("h2", { hasText: "الخدمات الأكثر طلباً" }).locator("xpath=ancestor::div[1]");
  }

  get serviceCompletionSection(): Locator {
    return this.page
      .locator("h2", { hasText: "نسبة اكتمال المخرجات في المنصة" })
      .locator("xpath=ancestor::div[1]");
  }

  /** General-statistics stat tile, by its exact label text. */
  generalStatValue(label: string): Locator {
    return this.page
      .locator("p", { hasText: label })
      .locator("xpath=following-sibling::div[1]")
      .locator("span.text-2xl");
  }
}
