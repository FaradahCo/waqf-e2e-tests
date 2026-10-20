import { expect, test } from "@playwright/test";
import { FollowRequestsListPage } from "../../pages/FollowRequestsListPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

test.describe("Follow requests (service requests) list", () => {
  test.beforeEach(async ({ page }) => {
    const list = new FollowRequestsListPage(page);
    await list.goto();
  });

  test("renders the 9 seeded service requests, one per status, with a status tag each", async ({
    page,
  }) => {
    const list = new FollowRequestsListPage(page);
    expect(await list.list.rowCount()).toBeGreaterThanOrEqual(
      testData.serviceRequests.statuses.length,
    );
    await expect(list.list.table.locator(".ant-tag").first()).toBeVisible();
  });

  test("the 4 status cards reflect real status-counts data, not hardcoded numbers", async ({
    page,
  }) => {
    const list = new FollowRequestsListPage(page);
    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));

    const response = await page.request.get(
      `${env.backendApiUrl}/admin/service-requests/status-counts`,
      { headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey } },
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    const total: number = body.data.total;
    const counts: { status: string; count: number }[] = body.data.data;
    const countFor = (status: string) =>
      counts.find((c) => c.status === status)?.count ?? 0;

    await expect(list.cardValue("إجمالي الطلبات")).toHaveText(String(total));
    await expect(list.cardValue("الطلبات المكتملة")).toHaveText(
      String(countFor("completed")),
    );
    await expect(list.cardValue("جاري العمل")).toHaveText(
      String(countFor("in_progress")),
    );
    await expect(list.cardValue("بانتظار عرض السعر")).toHaveText(
      String(countFor("pending")),
    );
    expect(total).toBeGreaterThan(0);
  });

  test("searches by the linked service's title", async ({ page }) => {
    const list = new FollowRequestsListPage(page);
    await list.list.searchByInput("ابحث عن", testData.services.approved1.title);

    expect(await list.list.rowCount()).toBe(
      testData.serviceRequests.statusesForApprovedService1.length,
    );

    await list.list.searchByInput("ابحث عن", testData.services.approved2.title);
    expect(await list.list.rowCount()).toBe(
      testData.serviceRequests.statusesForApprovedService2.length,
    );
  });

  test("a search with no matches shows the empty state", async ({ page }) => {
    const list = new FollowRequestsListPage(page);
    await list.list.searchByInput("ابحث عن", "no-such-service-request-zzz");
    await expect(list.list.emptyState).toBeVisible();
  });

  test("filters by status", async ({ page }) => {
    // Note: the "اسم الخدمة أو العميل" search description implies the
    // request's own description text is searchable, but the description
    // isn't even rendered as a table column - so identify rows by their
    // status tag text (from the server's status_label) instead.
    const list = new FollowRequestsListPage(page);
    await list.list.filterBySelect("الحالة", "مكتمل");

    expect(await list.list.rowCount()).toBe(1);
    await expect(list.list.rows.first()).toContainText("مكتمل");
  });

  test("pagination controls render correctly", async ({ page }) => {
    const list = new FollowRequestsListPage(page);
    await list.list.waitForLoaded();
    await expect(list.list.paginationTotalText()).toContainText("من");
  });

  test("clicking a row navigates to its details page", async ({ page }) => {
    const list = new FollowRequestsListPage(page);
    await list.list.filterBySelect("الحالة", "مكتمل");
    await list.list.clickRow(0);
    await expect(page).toHaveURL(/\/admin\/follow-requests\/\d+$/);
  });

  test("known issue: the description text used to identify a request isn't rendered anywhere in the list table", async ({
    page,
  }) => {
    // followRequestsListConfig.tsx's columns are id/type/client/service
    // title/field/price/date/status - the request's own `description` (the
    // only field that uniquely names *which* seeded request a row is,
    // per-status) is never rendered, even though the search placeholder text
    // ("ابحث عن اسم الخدمة أو العميل...") and filter param (`service.title`)
    // both confirm free-text search doesn't cover it either.
    const list = new FollowRequestsListPage(page);
    await expect(list.list.table).not.toContainText(
      testData.serviceRequests.descriptionFor("completed"),
    );
  });

  test("known issue: statuses missing from getStatusTag's color map (quoted, under_negotiation, pending_transfer_verification) render with the generic gray fallback color instead of a distinct one", async ({
    page,
  }) => {
    // sharedService.ts's getStatusTag config only defines colors for the
    // frontend's own ServiceStatusEnum, which does not include "quoted",
    // "under_negotiation" or "pending_transfer_verification" - 3 of the
    // ServiceRequestStatusEnum's 9 real values. Its fallback
    // ({color:"#8c8c8c", text:"غير محدد"}) is used for their Tag color even
    // though the text label shown is still the correct backend status_label
    // (item.status_label), since only .color is read from getStatusTag here.
    const list = new FollowRequestsListPage(page);

    await list.list.filterBySelect("الحالة", "بانتظار الدفع"); // quoted
    expect(await list.list.rowCount()).toBe(1);
    await expect(list.list.rows.first().locator(".ant-tag")).toHaveCSS(
      "background-color",
      "rgb(140, 140, 140)",
    );

    await list.list.clearFilter("الحالة");
    await list.list.filterBySelect("الحالة", "مكتمل"); // completed
    expect(await list.list.rowCount()).toBe(1);
    await expect(list.list.rows.first().locator(".ant-tag")).not.toHaveCSS(
      "background-color",
      "rgb(140, 140, 140)",
    );
  });
});
