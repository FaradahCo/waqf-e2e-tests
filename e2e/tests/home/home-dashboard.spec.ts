import { expect, test, type Page } from "@playwright/test";
import { HomeDashboardPage } from "../../pages/HomeDashboardPage";
import { WalletTransactionsPage } from "../../pages/WalletTransactionsPage";
import { env } from "../../fixtures/env";
import { testData } from "../../fixtures/testData";

// Covers /admin (home.tsx) - the post-login landing page. Every widget below
// (dashboardCards, dashboardOverview, confirmationRequests,
// confirmationRequestsTable, generalStatistics, qualityControl) fetches its
// own data independently, all against real seeded fixture data (this suite
// never mutates anything here - every endpoint involved is a GET). Inherits
// the project's default (already-authenticated) storageState.

/** Same localStorage-token pattern used by wallet-transactions.spec.ts and
 * service-providers/list.spec.ts for direct backend API assertions. */
async function getAdminToken(page: Page) {
  return page.evaluate(() => localStorage.getItem("ADMIN_token"));
}

async function fetchDashboardData(
  page: Page,
  path: string,
  params: Record<string, string> = {},
) {
  const token = await getAdminToken(page);
  const url = new URL(`${env.backendApiUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await page.request.get(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}

/** dashboardCards.tsx/generalStatistics.tsx always send the *current* month
 * (their DatePicker defaults to `dayjs()`), so this must match the frontend's
 * default query params exactly to compare against the same cached response. */
function currentMonthYear() {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1).padStart(2, "0"),
    year: String(now.getFullYear()),
  };
}

test.describe("Dashboard smoke", () => {
  test("every widget renders without a page error, using real seeded data", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const homePage = new HomeDashboardPage(page);
    await homePage.goto();

    for (const heading of [
      "المالية",
      "نظرة عامة",
      "طلبات المراجعة والاعتماد",
      "طلبات الاعتماد",
      "إحصائيات عامة",
      "مراقبة الجودة",
    ]) {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.locator(".ant-avatar").first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

test.describe("Financial summary cards (المالية)", () => {
  test("reflects real GET admin/dashboard/financial-summary numbers for the current month", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/financial-summary", {
      month,
      year,
    });

    await expect(homePage.financeCardValue("إجمالي أرباح المنصة")).toHaveText(
      String(data.platform_revenue.total),
    );
    await expect(homePage.financeCardValue("إجمالي أرباح المزودين")).toHaveText(
      String(data.providers_earnings.total),
    );
    await expect(homePage.financeCardValue("الرصيد المحجوز")).toHaveText(
      String(data.pending_balance.total),
    );
  });

  test("known issue: trend color is always the 'down' (red) style for real 'UP' data - dashboardCards.tsx compares trend to lowercase 'up', but FinancialSummaryService always returns uppercase 'UP'/'DOWN'", async ({
    page,
  }) => {
    // dashboardCards.tsx: `trend === "up" ? "text-green-600" : "text-red-600"`
    // - since the API's `trend` is always 'UP' or 'DOWN' (uppercase, see
    // FinancialSummaryService::getPlatformRevenue et al.), this comparison
    // can never be true, so every finance card shows the "down" red color
    // even when the real trend is 'UP'.
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/financial-summary", {
      month,
      year,
    });

    const fields: Array<[string, "platform_revenue" | "providers_earnings" | "pending_balance"]> = [
      ["إجمالي أرباح المنصة", "platform_revenue"],
      ["إجمالي أرباح المزودين", "providers_earnings"],
      ["الرصيد المحجوز", "pending_balance"],
    ];
    const upFields = fields.filter(([, key]) => data[key]?.trend === "UP");
    expect(
      upFields.length,
      "expected at least one finance field with a real trend of 'UP' in the current fixture data",
    ).toBeGreaterThan(0);

    for (const [label] of upFields) {
      const trend = homePage.financeCardTrend(label);
      await expect(trend).toHaveClass(/text-red-600/);
      await expect(trend).not.toHaveClass(/text-green-600/);
    }
  });

  test("changing the month picker refetches with the new month/year, and a month with no data renders zero instead of crashing", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { year } = currentMonthYear();
    const targetYear = Number(year) - 6;

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/admin/dashboard/financial-summary") &&
        res.url().includes("month=01") &&
        res.url().includes(`year=${targetYear}`),
    );
    await homePage.pickPastMonth(homePage.financialSummaryDatePicker, 6);
    await responsePromise;

    await expect(homePage.financeCardValue("إجمالي أرباح المنصة")).toHaveText("0");
    await expect(homePage.financeCardValue("إجمالي أرباح المزودين")).toHaveText("0");
    await expect(homePage.financeCardValue("الرصيد المحجوز")).toHaveText("0");
  });
});

test.describe("Overview cards (نظرة عامة)", () => {
  test("new/in-progress/completed counts reflect real GET admin/dashboard/overview data", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/overview", { month, year });

    await expect(homePage.overviewCardValue("العملاء الجدد")).toContainText(
      String(data.new_clients.total),
    );
    await expect(homePage.overviewCardValue("الطلبات الجديدة")).toContainText(
      String(data.new_requests.total),
    );
    await expect(homePage.overviewCardValue("الطلبات الجارية")).toContainText(
      String(data.in_progress_requests.total),
    );
    await expect(homePage.overviewCardValue("الطلبات مكتملة")).toContainText(
      String(data.completed_requests.total),
    );
  });
});

test.describe("الخدمات الأكثر طلباً (top requested services)", () => {
  test("renders one progress bar per top requested service returned by the API", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/overview", { month, year });
    const top: { title: string }[] = data.top_services ?? [];

    await expect(homePage.topRequestedServicesSection.locator(".ant-progress")).toHaveCount(top.length);
    for (const service of top) {
      await expect(homePage.topRequestedServicesSection).toContainText(service.title);
    }
  });
});

test.describe("نسبة اكتمال المخرجات في المنصة (service completion rate)", () => {
  test("renders the doughnut chart and a graceful zero state when there are no deliverables yet", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/overview", { month, year });
    const completion = data.deliverables_completion;

    await expect(homePage.serviceCompletionSection.locator("canvas")).toBeVisible();
    await expect(homePage.serviceCompletionSection).toContainText(
      `${completion.completion_percentage}%`,
    );
    await expect(homePage.serviceCompletionSection).toContainText(
      `من أصل ${completion.total_deliverables} مُخرج`,
    );
  });
});

test.describe("أحدث الأنشطة (latest activities)", () => {
  test("known issue: activity descriptions render as raw, unparsed JSON instead of human-readable Arabic text", async ({
    page,
  }) => {
    // ActivityLogService::getLatestActivities() passes `$activity->description`
    // straight through - for a commission-settings change, the stored
    // description is the raw JSON payload the update was made with (e.g.
    // `{"main_commission_rate":20,...}`), not a formatted sentence like every
    // other activity type. recentActivitiesList.tsx renders it verbatim.
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/overview", { month, year });
    const jsonActivity = (data.latest_activities ?? []).find(
      (a: { description?: string }) =>
        typeof a.description === "string" && a.description.trim().startsWith("{"),
    );
    test.skip(
      !jsonActivity,
      "no raw-JSON-description activity present in the current fixture/cache window",
    );

    await expect(
      homePage.recentActivitiesSection.locator("h3", { hasText: jsonActivity.description }).first(),
    ).toBeVisible();
  });

  test("known issue: the actor-type label is mistranslated - shows 'وقف' (waqf/endowment) for an activity performed by the admin", async ({
    page,
  }) => {
    // lang/ar/api.php: 'dashboard.activity.actor_types.user' => 'وقف' -
    // ActivityLogService maps `App\Models\User` through this key, and the
    // seeded admin account is itself a User record (type=admin per the login
    // response), so an admin-performed action's actor-type label renders as
    // the Arabic word for "waqf/endowment" instead of anything describing an
    // admin or user.
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/overview", { month, year });
    const adminActivity = (data.latest_activities ?? []).find(
      (a: { actor_name?: string; actor_type?: string }) =>
        a.actor_name === "E2E Test Admin" && a.actor_type,
    );
    test.skip(
      !adminActivity,
      "no admin-performed activity present in the current fixture/cache window",
    );

    expect(
      adminActivity.actor_type,
      "lang/ar/api.php's actor_types.user is 'وقف' - nonsensical for describing who performed an action",
    ).toBe("وقف");
    const heading = homePage.recentActivitiesSection.locator("h3", {
      hasText: adminActivity.description,
    });
    const subtitle = heading.first().locator("xpath=following-sibling::p[1]");
    await expect(subtitle).toContainText("وقف");
  });
});

test.describe("طلبات المراجعة والاعتماد (review/approval stat cards)", () => {
  test("known issue: 'مزودون بانتظار التفعيل' and 'تحديثات بروفايل بانتظار المراجعة' show the exact same count - both are bound to the same pending_providers.count field, despite linking to different filters", async ({
    page,
  }) => {
    // confirmationRequests.tsx's `stats` array reuses
    // `reviewRequest?.pending_providers?.count` for *both* cards - there is
    // no separate "pending profile updates" bucket anywhere in PendingItems -
    // yet the two cards link to genuinely different filtered routes
    // (status=inactive vs status=review).
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const data = await fetchDashboardData(page, "/admin/dashboard/review-requests");
    const expectedCount = String(data.pending_providers.count);

    const inactiveCount = homePage.reviewStatCount("مزودون بانتظار التفعيل");
    const reviewCount = homePage.reviewStatCount("تحديثات بروفايل بانتظار المراجعة");
    await expect(inactiveCount).toHaveText(expectedCount);
    await expect(reviewCount).toHaveText(expectedCount);

    await homePage.reviewStatCard("مزودون بانتظار التفعيل").click();
    await expect(page).toHaveURL(/\/admin\/service-providers\?status=inactive$/);
    await homePage.goto();
    await homePage.reviewStatCard("تحديثات بروفايل بانتظار المراجعة").click();
    await expect(page).toHaveURL(/\/admin\/service-providers\?status=review$/);
  });

  test("'خدمات بانتظار الاعتماد' reflects the real pending_services count and navigates to the correctly filtered service-management route", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const data = await fetchDashboardData(page, "/admin/dashboard/review-requests");

    await expect(homePage.reviewStatCount("خدمات بانتظار الاعتماد")).toHaveText(
      String(data.pending_services.count),
    );
    await homePage.reviewStatCard("خدمات بانتظار الاعتماد").click();
    await expect(page).toHaveURL(/\/admin\/service-management\?type=service&status=pending$/);
  });
});

test.describe("طلبات الاعتماد (approval table)", () => {
  test("withdraw tab (default) shows the real pending withdrawal fixture", async ({ page }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const data = await fetchDashboardData(page, "/admin/dashboard/approval-table");
    const withdrawal = data.withdrawals.items[0];

    const list = homePage.approvalTable();
    await list.waitForLoaded();
    expect(await list.rowCount()).toBe(1);
    const row = list.rows.first();
    await expect(row).toContainText(withdrawal.name);
    await expect(row).toContainText("200");
  });

  test("switching to 'إيداع' shows the real pending bank-transfer fixture", async ({ page }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const data = await fetchDashboardData(page, "/admin/dashboard/approval-table");
    const transfer = data.bank_transfers.items[0];

    await homePage.selectApprovalTableType("إيداع");
    const list = homePage.approvalTable();
    await list.waitForLoaded();
    expect(await list.rowCount()).toBe(1);
    const row = list.rows.first();
    await expect(row).toContainText(transfer.name);
    await expect(row).toContainText("500");
  });

  test("known issue: 'وثيقة الدفع' and 'الإجراء' columns are bound to fields the API never returns, so both render blank for every row", async ({
    page,
  }) => {
    // confirmationRequestsTableColumns.tsx binds "وثيقة الدفع" to
    // `dataIndex: "client_name"` (the real field is `payment_document`) and
    // "الإجراء" to `dataIndex: "action"` (never returned at all, and no
    // render fn either) - neither key exists on withdrawal or bank-transfer
    // items (see ApprovalTableService), so both columns are always empty.
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const list = homePage.approvalTable();
    await list.waitForLoaded();

    const headerTexts = (await list.table.locator("thead th").allTextContents()).map((t) =>
      t.trim(),
    );
    const paymentDocIndex = headerTexts.indexOf("وثيقة الدفع");
    const actionIndex = headerTexts.indexOf("الإجراء");
    expect(paymentDocIndex).toBeGreaterThanOrEqual(0);
    expect(actionIndex).toBeGreaterThanOrEqual(0);

    const firstRow = list.rows.first();
    await expect(firstRow.locator("td").nth(paymentDocIndex)).toHaveText("");
    await expect(firstRow.locator("td").nth(actionIndex)).toHaveText("");
  });

  test("known issue: the withdrawal's provider is shown here by its team/business name, while the identical withdrawal on /admin/wallet shows the owner's personal name instead", async ({
    page,
  }) => {
    // ApprovalTableService::getWithdrawalsData() resolves
    // `$ownerable->provider->business_name ?? $ownerable->user?->name` for a
    // provider-owned wallet - but wallet-transactions.spec.ts already
    // confirmed /admin/withdrawals (rendered on /admin/wallet) shows the
    // *owner's user name* for this exact same withdrawal fixture. Same
    // underlying record, two different admin screens, two different names.
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const list = homePage.approvalTable();
    await list.waitForLoaded();
    await expect(list.rows.first()).toContainText(testData.providers.active.teamName);
    await expect(list.rows.first()).not.toContainText(testData.providers.active.ownerName);

    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    const walletRow = wallet.list().rows.first();
    await expect(walletRow).toContainText(testData.providers.active.ownerName);
    await expect(walletRow).not.toContainText(testData.providers.active.teamName);
  });
});

test.describe("إحصائيات عامة (general statistics)", () => {
  test("'عدد الأوقاف'/'عدد الخدمات'/'عدد الباقات' reflect real GET admin/dashboard/general-statistics numbers", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/general-statistics", {
      month,
      year,
    });

    await expect(homePage.generalStatValue("عدد الأوقاف")).toHaveText(
      String(data.total_clients),
    );
    await expect(homePage.generalStatValue("عدد الخدمات")).toHaveText(
      String(data.total_services),
    );
    await expect(homePage.generalStatValue("عدد الباقات")).toHaveText(
      String(data.total_packages),
    );
  });

  test("known issue: 'عدد المزودين' is bound to total_active_providers, not the total_providers count the same API also returns", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/general-statistics", {
      month,
      year,
    });
    // general-statistics is month-scoped; once the fixtures' month has
    // passed both counts are 0 and the assertion can't tell them apart.
    test.skip(
      data.total_providers === data.total_active_providers,
      "total_providers == total_active_providers in the current month window",
    );

    await expect(homePage.generalStatValue("عدد المزودين")).toHaveText(
      String(data.total_active_providers),
    );
    await expect(homePage.generalStatValue("عدد المزودين")).not.toHaveText(
      String(data.total_providers),
    );
  });

  test("known issue: 'عدد المستشارين' shows total_consultations (a count of consultation requests), not a distinct headcount of consultants - the API doesn't even expose one", async ({
    page,
  }) => {
    // GeneralStatisticsData has no "number of consultants" field at all -
    // generalStatistics.tsx's "عدد المستشارين" ("number of consultants") tile
    // is bound to `total_consultations`, which counts consultation *requests*
    // (7 in the current fixture window), while only 1 of the 4 seeded
    // provider teams is even consultant-capable (testData.providers.active.isConsultant).
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { month, year } = currentMonthYear();
    const data = await fetchDashboardData(page, "/admin/dashboard/general-statistics", {
      month,
      year,
    });

    await expect(homePage.generalStatValue("عدد المستشارين")).toHaveText(
      String(data.total_consultations),
    );
  });

  test("changing the month to one with no data zeroes every stat instead of crashing", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const { year } = currentMonthYear();
    const targetYear = Number(year) - 6;

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/admin/dashboard/general-statistics") &&
        res.url().includes("month=01") &&
        res.url().includes(`year=${targetYear}`),
    );
    await homePage.pickPastMonth(homePage.generalStatisticsDatePicker, 6);
    await responsePromise;

    for (const label of ["عدد الأوقاف", "عدد المزودين", "عدد المستشارين", "عدد الخدمات", "عدد الباقات"]) {
      await expect(homePage.generalStatValue(label)).toHaveText("0");
    }
  });
});

test.describe("مراقبة الجودة (quality control)", () => {
  test("renders the real critical alerts (or the empty state) without crashing", async ({
    page,
  }) => {
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    const data = await fetchDashboardData(page, "/admin/dashboard/quality-monitoring");

    if ((data.alerts ?? []).length === 0) {
      await expect(page.getByText("لا يوجد طلبات حرجة")).toBeVisible();
    } else {
      await expect(homePage.qualityAlertRows).toHaveCount(data.alerts.length);
    }
  });

  test("shows 'لا يوجد طلبات حرجة' when there are no critical alerts", async ({ page }) => {
    await page.route("**/admin/dashboard/quality-monitoring*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { total_alerts: 0, delayed_count: 0, warning_count: 0, alerts: [] },
          message: "ok",
          status: true,
          code: 200,
          errors: [],
        }),
      }),
    );
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();
    await expect(page.getByText("لا يوجد طلبات حرجة")).toBeVisible();
    await expect(homePage.qualityAlertRows).toHaveCount(0);
  });

  test("known issue: item border-bottom placement is wrong whenever the real alert count isn't exactly 3 - qualityControl.tsx hardcodes a local 3-item placeholder array's .length instead of the real list's length", async ({
    page,
  }) => {
    // qualityControl.tsx keeps an unused, hardcoded `data` placeholder array
    // (length 3) purely to compute
    // `index !== data.length - 1 ? "border-b ..." : ""` for each *real*
    // alert - instead of the real `qualityMonitoring.alerts.length`. With 4
    // real alerts: index 2 (not the last) wrongly loses its border, and
    // index 3 (the real last item) wrongly gets one it shouldn't.
    await page.route("**/admin/dashboard/quality-monitoring*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            total_alerts: 4,
            delayed_count: 2,
            warning_count: 2,
            alerts: [1, 2, 3, 4].map((n) => ({
              id: n,
              type: n % 2 === 0 ? "warning" : "danger",
              category: "service_request",
              message: `E2E mocked alert #${n}`,
              detail: `E2E mocked detail #${n}`,
              created_at: "منذ يوم",
            })),
          },
          message: "ok",
          status: true,
          code: 200,
          errors: [],
        }),
      }),
    );
    const homePage = new HomeDashboardPage(page);
    await homePage.goto();

    await expect(homePage.qualityAlertRows).toHaveCount(4);
    // Real index 2 (3rd of 4, NOT the last) - should have a border, but the
    // hardcoded check (index !== 2) says otherwise.
    await expect(homePage.qualityAlertRows.nth(2)).not.toHaveClass(/border-b/);
    // Real index 3 (the actual last item) - should have NO border, but gets
    // one anyway since 3 !== 2.
    await expect(homePage.qualityAlertRows.nth(3)).toHaveClass(/border-b/);
  });
});
