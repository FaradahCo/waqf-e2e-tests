import { expect, test } from "@playwright/test";
import { AlwaqfListPage } from "../../pages/AlwaqfListPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

test.describe("Alwaqf (clients) list", () => {
  test.beforeEach(async ({ page }) => {
    const alwaqf = new AlwaqfListPage(page);
    await alwaqf.goto();
  });

  test("renders the seeded clients with a status tag each", async ({ page }) => {
    const alwaqf = new AlwaqfListPage(page);
    expect(await alwaqf.list.rowCount()).toBeGreaterThanOrEqual(5);
    await expect(alwaqf.list.table.locator(".ant-tag").first()).toBeVisible();
    for (const client of Object.values(testData.clients)) {
      await expect(alwaqf.list.rowByText(client.name)).toBeVisible();
    }
  });

  test("the summary cards reflect real status counts, not hardcoded numbers", async ({
    page,
    request,
  }) => {
    const alwaqf = new AlwaqfListPage(page);
    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));

    const response = await request.get(
      `${env.backendApiUrl}/admin/clients/status-counts`,
      { headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey } },
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    const counts: { status: string; count: number }[] = body.data.data;
    const total: number = body.data.total;
    const countFor = (status: string) =>
      counts.find((c) => c.status === status)?.count ?? 0;

    await expect(alwaqf.cardValue("إجمالي الأوقاف")).toHaveText(String(total));
    await expect(alwaqf.cardValue("الأوقاف النشطة")).toHaveText(
      String(countFor("active")),
    );
    await expect(alwaqf.cardValue("الأوقاف الغير نشطة")).toHaveText(
      String(countFor("inactive")),
    );
    await expect(alwaqf.cardValue("الأوقاف المعلقة")).toHaveText(
      String(countFor("review")),
    );

    // Sanity: these are seeded, non-zero counts - if this ever regresses to
    // 0/0/0/0 (e.g. a hardcoded value, or a broken endpoint) the equality
    // checks above could still pass by coincidence against a wiped table.
    expect(total).toBeGreaterThan(0);
  });

  test("searches by user name (partial match)", async ({ page }) => {
    const alwaqf = new AlwaqfListPage(page);
    await alwaqf.list.searchByInput("اسم المستخدم أو المنظمة", "Client One");

    expect(await alwaqf.list.rowCount()).toBe(1);
    await expect(alwaqf.list.rowByText(testData.clients.active.name)).toBeVisible();
  });

  test("a search with no matches shows the empty state", async ({ page }) => {
    const alwaqf = new AlwaqfListPage(page);
    await alwaqf.list.searchByInput(
      "اسم المستخدم أو المنظمة",
      "no-such-client-zzz",
    );

    await expect(alwaqf.list.emptyState).toBeVisible();
    expect(await alwaqf.list.rows.count()).toBe(0);
  });

  test("filters by status", async ({ page }) => {
    const alwaqf = new AlwaqfListPage(page);
    await alwaqf.list.filterBySelect("الحالة", "قيد المراجعة");

    const rows = await alwaqf.list.rowCount();
    expect(rows).toBeGreaterThan(0);
    await expect(alwaqf.list.table).not.toContainText(
      testData.clients.active.name,
    );
    await expect(alwaqf.list.rowByText(testData.clients.review.name)).toBeVisible();
  });

  test("filtering by a status with no matching clients shows an empty table", async ({
    page,
  }) => {
    // "غير مكتمل" (incomplete) has zero seeded clients - a real status with
    // no matches, rather than a synthetic placeholder option.
    const alwaqf = new AlwaqfListPage(page);
    await alwaqf.list.filterBySelect("الحالة", "غير مكتمل");
    await expect(alwaqf.list.emptyState).toBeVisible();
  });

  test("pagination controls render correctly even though every seeded client fits on one page", async ({
    page,
  }) => {
    const alwaqf = new AlwaqfListPage(page);
    await alwaqf.list.waitForLoaded();

    await expect(alwaqf.list.paginationTotalText()).toContainText("من");
    // Only 5 seeded clients against a page size of 10 - a single page, so
    // "next" is correctly disabled rather than exercising real navigation.
    await expect(alwaqf.list.isNextPageDisabled()).toBeVisible();
  });

  test("clicking a row navigates to that client's profile", async ({ page }) => {
    const alwaqf = new AlwaqfListPage(page);
    const row = alwaqf.list.rowByText(testData.clients.active.name);
    await row.click();

    await expect(page).toHaveURL(/\/admin\/alwaqf-list\/\d+\/profile$/);
    await expect(
      page.getByRole("heading", { name: testData.clients.active.waqfName }),
    ).toBeVisible();
  });
});
