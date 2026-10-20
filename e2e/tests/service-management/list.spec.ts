import { expect, test } from "@playwright/test";
import { ServiceManagementListPage } from "../../pages/ServiceManagementListPage";
import { testData } from "../../fixtures/testData";

test.describe("Service management list - services (default type)", () => {
  test.beforeEach(async ({ page }) => {
    const list = new ServiceManagementListPage(page);
    await list.goto();
  });

  test("renders only non-draft, type=service services by default", async ({ page }) => {
    const list = new ServiceManagementListPage(page);
    expect(await list.list.rowCount()).toBe(testData.services.serviceTypeVisibleCount);
    await expect(list.list.table).not.toContainText(testData.services.byStatus.draft);
    await expect(list.list.table).toContainText(testData.services.byStatus.approved);
    await expect(list.list.table.locator(".ant-tag").first()).toBeVisible();
  });

  test("known issue: there is no create/delete UI here, matching the backend's read/update-only apiResource", async ({
    page,
  }) => {
    // ServiceController's admin route is registered with
    // ->except(['destroy','store']), and serviceManagementList.tsx has no
    // "add service" button and no per-row delete action anywhere - confirms
    // the frontend correctly has no dead UI pointing at a nonexistent action.
    await expect(page.getByRole("button", { name: /إضافة|أضف/ })).toHaveCount(0);
    await expect(page.locator(".anticon-delete")).toHaveCount(0);
  });

  test("switching to the 'الباقات' (package) type shows only the 2 non-draft packages", async ({
    page,
  }) => {
    const list = new ServiceManagementListPage(page);
    await list.selectType("الباقات");

    expect(await list.list.rowCount()).toBe(testData.services.packageTypeVisibleCount);
    await expect(list.list.table).toContainText(testData.services.byStatus.rejected);
    await expect(list.list.table).toContainText(testData.services.byStatus.hold);
  });

  test("searches by title", async ({ page }) => {
    const list = new ServiceManagementListPage(page);
    await list.list.searchByInput("اسم الخدمة", testData.services.approved1.title);

    expect(await list.list.rowCount()).toBe(1);
    await expect(list.list.rows.first()).toContainText(testData.services.approved1.title);
  });

  test("a search with no matches shows the empty state", async ({ page }) => {
    const list = new ServiceManagementListPage(page);
    await list.list.searchByInput("اسم الخدمة", "no-such-service-zzz");
    await expect(list.list.emptyState).toBeVisible();
  });

  test("filters by status", async ({ page }) => {
    // "متاحة" (approved) matches all 3 type=service approved rows: the
    // round-robin "E2E Service - approved" plus both approved_extra_* services.
    const list = new ServiceManagementListPage(page);
    await list.list.filterBySelect("الحالة", "متاحة"); // approved

    expect(await list.list.rowCount()).toBe(3);
    await expect(list.list.table).toContainText(testData.services.byStatus.approved);
    await expect(list.list.table).toContainText(testData.services.approved1.title);
    await expect(list.list.table).toContainText(testData.services.approved2.title);
  });

  test("the 'مجال الخدمات' filter lists the real seeded fields and filters by field id", async ({
    page,
  }) => {
    // Fixed in PR #77: options now come from useServiceFields() (real
    // fields.id values) instead of the old hardcoded PACKAGE_TYPES slugs.
    const list = new ServiceManagementListPage(page);
    expect(await list.list.rowCount()).toBeGreaterThan(0);

    const fieldRequest = page.waitForRequest((r) => /filter(%5B|\[)field_id(%5D|\])=\d+/.test(r.url()));
    await list.list.filterBySelect("مجال الخدمات", testData.services.realFieldNames[0]);
    await fieldRequest;
    for (const fake of ["الرعاية الصحية", "التعليم", "التكنولوجيا", "الخدمات الاجتماعية"]) {
      await expect(page.locator(".ant-select-dropdown").getByText(fake, { exact: true })).toHaveCount(0);
    }
  });

  test("pagination controls render correctly", async ({ page }) => {
    const list = new ServiceManagementListPage(page);
    await list.list.waitForLoaded();
    await expect(list.list.paginationTotalText()).toContainText("من");
  });

  test("clicking a service title navigates to its review page", async ({ page }) => {
    const list = new ServiceManagementListPage(page);
    await list.titleLink(testData.services.byStatus.approved).click();
    await expect(page).toHaveURL(/\/admin\/service-management\/reviews\/\d+$/);
  });
});

test.describe("Service management list - status cards", () => {
  test("the status cards reflect real, type-scoped status-counts data (not hardcoded)", async ({
    page,
  }) => {
    // Although ServiceController::statusCounts() ignores its own $request
    // argument, Spatie QueryBuilder::for() reads `filter[type]` straight off
    // the current HTTP request regardless, so the /admin/services-status
    // response - and therefore these cards - still end up correctly scoped
    // to the selected type. All 3 seeded "approved" services (the
    // round-robin one + both approved_extra_*) are type=service, so the
    // "نشطة" card shows 3 under the default "الخدمات" type...
    const list = new ServiceManagementListPage(page);
    await list.goto();
    await expect(list.cardValue("نشطة")).toHaveText("3");

    // ...and correctly drops to 0 after switching to "الباقات", since there
    // are zero approved packages.
    await list.selectType("الباقات");
    await expect(list.cardValue("نشطة")).toHaveText("0");
    await expect(list.list.table).not.toContainText(testData.services.byStatus.approved);
  });
});
