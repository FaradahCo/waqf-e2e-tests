import { expect, test, type Page } from "@playwright/test";
import { ConsultantsManagementListPage } from "../../pages/ConsultantsManagementListPage";
import { testData } from "../../fixtures/testData";

async function openConsultant(page: Page, name: string) {
  const consultants = new ConsultantsManagementListPage(page);
  await consultants.goto();
  await consultants.viewAccountLink(name).click();
  await expect(page).toHaveURL(/\/admin\/consultants-management\/\d+$/);
  return Number(page.url().match(/consultants-management\/(\d+)$/)?.[1]);
}

test.describe("Consultants management - provider detail page", () => {
  test("shows the provider's business name, stats and active services", async ({
    page,
  }) => {
    await openConsultant(page, testData.providers.active.teamName);

    await expect(
      page.getByRole("heading", { name: testData.providers.active.teamName }),
    ).toBeVisible();
    // active provider has 2 approved/published services (approved_extra_1/2).
    await expect(page.getByText("الخدمات المعتمدة")).toBeVisible();
    await expect(page.getByText("E2E Approved Service 1")).toBeVisible();
    await expect(page.getByText("E2E Approved Service 2")).toBeVisible();
  });

  test("a provider with no bio falls back to the '-' placeholder", async ({
    page,
  }) => {
    // None of the seeded providers set a bio (E2EFixtureSeeder.php's
    // Provider::firstOrCreate for providers never sets 'bio').
    await openConsultant(page, testData.providers.incomplete.teamName);

    await expect(page.getByText("نبذة تعريفية")).toBeVisible();
    const bioSection = page.locator("h3", { hasText: "نبذة تعريفية" }).locator("xpath=..");
    await expect(bioSection.locator("p")).toHaveText("-");
  });

  test("known issue: a stat count of exactly 0 renders as the '-' placeholder, indistinguishable from missing/null data", async ({
    page,
  }) => {
    // "pending" only has 2 seeded services (pending/inactive status) -
    // neither is approved/published, so consultations_count,
    // quotations_count and active_services_count are all really 0. But
    // serviceProvider.tsx renders them as
    // `{serviceProvider?.active_services_count || "-"}` etc - and in
    // JavaScript `0 || "-"` evaluates to "-", since 0 is falsy. So a
    // provider with genuinely zero of something looks identical in the UI
    // to a provider whose data is missing entirely, and the services grid
    // itself renders empty without any explicit empty-state message.
    await openConsultant(page, testData.providers.pending.teamName);

    await expect(page.getByText("الخدمات المعتمدة")).toBeVisible();
    const stats = page.locator("li", { hasText: "الخدمات المعتمدة" }).locator("p").last();
    await expect(stats).toHaveText("-");
  });

  test("known issue: the pagination control on this page is decorative - changing page/page size never re-fetches or changes the displayed services", async ({
    page,
  }) => {
    // serviceProvider.tsx keeps its own local {page, per_page} state for the
    // <Pagination>, but getServiceProviderProfile(id) is called with no
    // params at all and is never refetched when that state changes - there's
    // no useEffect/query-key dependency wiring them together.
    const requestsToProfileEndpoint: string[] = [];
    page.on("request", (req) => {
      if (/\/front\/providers\/\d+/.test(req.url())) {
        requestsToProfileEndpoint.push(req.url());
      }
    });

    await openConsultant(page, testData.providers.active.teamName);
    // Wait for the profile data (and thus its one network request) to
    // actually finish loading before inspecting captured requests below.
    await expect(page.getByText("احصائيات")).toBeVisible();
    expect(requestsToProfileEndpoint).toHaveLength(1);

    const nextButton = page.locator(".ant-pagination-next");
    if (await nextButton.isEnabled().catch(() => false)) {
      await nextButton.click();
    } else {
      // Only 2 active services against a page size of 10 - "next" is
      // disabled, so exercise the size-changer dropdown instead, which is
      // always interactive regardless of the total count.
      await page.locator(".ant-pagination-options-size-changer").click();
      await page.locator(".ant-select-item-option").first().click();
    }

    // No matter what was clicked, no second request was ever made.
    expect(requestsToProfileEndpoint).toHaveLength(1);
  });
});

test.describe("Consultants management - edge cases", () => {
  test("known issue: navigating to a non-existent provider id fails silently instead of showing a not-found message", async ({
    page,
  }) => {
    await page.goto("/admin/consultants-management/999999");

    await expect(page).toHaveURL(/\/admin\/consultants-management\/999999$/);
    // GET /front/providers/999999 404s (ProviderService::findByOrFail), the
    // axios interceptor's 404 branch is a no-op, and this page never checks
    // isError - so it just renders with every field falling back to its "-"
    // placeholder instead of any error state.
    await expect(page.locator(".ant-message-error")).toHaveCount(0);
    await expect(page.getByText("احصائيات")).toBeVisible({ timeout: 10_000 });
  });
});
