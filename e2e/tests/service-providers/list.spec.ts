import { expect, test } from "@playwright/test";
import { ServiceProviderListPage } from "../../pages/ServiceProviderListPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

test.describe("Service providers list", () => {
  test.beforeEach(async ({ page }) => {
    const providers = new ServiceProviderListPage(page);
    await providers.goto();
  });

  test("renders the seeded providers with a status tag each", async ({ page }) => {
    const providers = new ServiceProviderListPage(page);
    expect(await providers.list.rowCount()).toBeGreaterThanOrEqual(4);
    await expect(providers.list.table.locator(".ant-tag").first()).toBeVisible();
    for (const provider of [
      testData.providers.active,
      testData.providers.pending,
      testData.providers.suspended,
      testData.providers.incomplete,
    ]) {
      await expect(providers.list.rowByText(provider.teamName)).toBeVisible();
    }
  });

  test("the 'إجمالي المزودين' card reflects the real total provider count, not a hardcoded number", async ({
    page,
  }) => {
    const providers = new ServiceProviderListPage(page);
    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));

    const response = await page.request.get(
      `${env.backendApiUrl}/admin/providers/status-counts`,
      { headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey } },
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    const total: number = body.data.total;

    await expect(providers.cardValue("إجمالي المزودين")).toHaveText(String(total));
    expect(total).toBeGreaterThan(0);
  });

  test("known issue: 'مزود قيد المراجعة' reads a provider status that never exists (in_progress), and 'مزود غير مكتمل' shows the review count", async ({
    page,
  }) => {
    // serviceProviderLayout.tsx (no id): card 3 looks up status
    // "in_progress" and card 4 looks up "review" in
    // /admin/providers/status-counts - but provider statuses are
    // incomplete/active/inactive/review/stop.
    const providers = new ServiceProviderListPage(page);
    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
    const response = await page.request.get(
      `${env.backendApiUrl}/admin/providers/status-counts`,
      { headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey } },
    );
    const counts: { status: string; count: number }[] = (await response.json()).data.data;
    const countFor = (status: string) => counts.find((c) => c.status === status)?.count ?? 0;

    await expect(providers.cardValue("مزود نشط")).toHaveText(String(countFor("active")));
    // Expected behaviour (fails today): under-review card = review count,
    // incomplete card = incomplete count.
    await expect(providers.cardValue("مزود قيد المراجعة")).toHaveText(String(countFor("review")));
    await expect(providers.cardValue("مزود غير مكتمل")).toHaveText(String(countFor("incomplete")));
  });

  test("searches by provider owner name (partial match)", async ({ page }) => {
    // "مزود الخدمة" filters on team.user.name (the team owner's name, e.g.
    // "E2E Provider One Owner"), not business_name - "Provider One" happens
    // to be a substring of both, which is why it still resolves to the row
    // displaying business_name "E2E Provider One - Active".
    const providers = new ServiceProviderListPage(page);
    await providers.list.searchByInput("مزود الخدمة", "Provider One");

    expect(await providers.list.rowCount()).toBe(1);
    await expect(
      providers.list.rowByText(testData.providers.active.teamName),
    ).toBeVisible();
  });

  test("a search with no matches shows the empty state", async ({ page }) => {
    const providers = new ServiceProviderListPage(page);
    await providers.list.searchByInput("مزود الخدمة", "no-such-provider-zzz");

    await expect(providers.list.emptyState).toBeVisible();
    expect(await providers.list.rows.count()).toBe(0);
  });

  test("filters by status", async ({ page }) => {
    const providers = new ServiceProviderListPage(page);
    await providers.list.filterBySelect("الحالة", "غير مكتمل");

    expect(await providers.list.rowCount()).toBe(1);
    await expect(
      providers.list.rowByText(testData.providers.incomplete.teamName),
    ).toBeVisible();
    await expect(providers.list.table).not.toContainText(
      testData.providers.active.teamName,
    );
  });

  test("filtering by a status with no matching providers shows an empty table", async ({
    page,
  }) => {
    // "غير نشط" (inactive) has zero seeded providers - every seeded team is
    // active/review/stop/incomplete.
    const providers = new ServiceProviderListPage(page);
    await providers.list.filterBySelect("الحالة", "غير نشط");
    await expect(providers.list.emptyState).toBeVisible();
  });

  test("pagination controls render correctly even though every seeded provider fits on one page", async ({
    page,
  }) => {
    const providers = new ServiceProviderListPage(page);
    await providers.list.waitForLoaded();

    await expect(providers.list.paginationTotalText()).toContainText("من");
    await expect(providers.list.isNextPageDisabled()).toBeVisible();
  });

  test("clicking a non-review provider's name navigates to its profile", async ({
    page,
  }) => {
    const providers = new ServiceProviderListPage(page);
    await providers.clickProvider(testData.providers.active.teamName);

    await expect(page).toHaveURL(/\/admin\/service-providers\/\d+\/profile$/);
  });

  test("known issue: clicking a review-status provider's name routes to a completely different page (/admin/reviews/:id), not the tabbed details layout", async ({
    page,
  }) => {
    // serviceProvidersList.tsx's handleProviderClick special-cases
    // status===review to navigate to serviceProviderRoutePath
    // .SERVICE_PROVIDER_REVIEWS(id), whose value is "/admin/reviews/${id}" -
    // a *different* top-level route (serviceProviderReview.tsx) than the
    // tabbed /admin/service-providers/:id/profile layout every other status
    // uses. It renders the same header + profile sections but with no tabs
    // at all, so a review-status provider's requests/consultation/wallet/
    // invoices/reviews data is unreachable from the list.
    const providers = new ServiceProviderListPage(page);
    await providers.clickProvider(testData.providers.pending.teamName);

    await expect(page).toHaveURL(
      new RegExp(`/admin/reviews/\\d+$`),
    );
    await expect(page.locator(".custom-tabs")).toHaveCount(0);
  });

  test("clicking elsewhere on a row (not the business-name link) does not navigate", async ({
    page,
  }) => {
    // Unlike AlwaqfListPage, serviceProvidersList.tsx never passes an onRow
    // handler to <CustomTable> - only the business-name <span> is clickable.
    const providers = new ServiceProviderListPage(page);
    const row = providers.list.rowByText(testData.providers.active.teamName);
    // Click the "ID" cell instead of the business-name link.
    await row.locator("td").first().click();

    await expect(page).toHaveURL(/\/admin\/service-providers\/?$/);
  });
});

test.describe("Service providers list - marketplace/consultant toggles", () => {
  test("known issue: enabling السوق الوقفي/الاستشارة for a non-active provider fails server-side with no inline explanation on the switch itself - only a global toast", async ({
    page,
  }) => {
    // ProviderService::updateSingleProviderMarketplaceStatus throws a 422
    // ("cannot_enable_marketplace_for_inactive_provider") before saving
    // anything if the target provider's user status isn't Active - this is
    // real backend validation, not mocked, so it's safe to exercise against
    // the shared "pending" (review-status) fixture: the request is always
    // rejected before any row is written.
    const providers = new ServiceProviderListPage(page);
    await providers.goto();

    const toggle = providers.toggleSwitch(
      testData.providers.pending.teamName,
      "waqfMarket",
    );
    // Note: the switch's own Tailwind class ("[&.ant-switch-checked]:!bg-brand")
    // literally contains the substring "ant-switch-checked" regardless of
    // state, so assert on the aria-checked attribute instead of the class list.
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();

    await expect(
      page.getByText("لا يمكن تفعيل السوق الوقفي أو الاستشارة لمزود حسابه غير نشط"),
    ).toBeVisible({ timeout: 10_000 });

    // The switch must not remain visually "on" - it's a controlled
    // component bound to the (unchanged) cached provider list data.
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("toggling a switch sends the expected updateMarketplaceStatus payload (mocked)", async ({
    page,
  }) => {
    const providers = new ServiceProviderListPage(page);
    await providers.goto();

    let capturedBody: unknown;
    await page.route("**/admin/providers/marketplace-status", async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          message: "تم تحديث حالة المزود بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    const toggle = providers.toggleSwitch(
      testData.providers.active.teamName,
      "consultant",
    );
    await toggle.click();

    await expect(page.getByText("تم تحديث حالة المزود بنجاح")).toBeVisible();
    expect(capturedBody).toMatchObject({
      items: [
        expect.objectContaining({
          is_consultant: false,
          is_waqf_market: true,
        }),
      ],
    });
  });
});
