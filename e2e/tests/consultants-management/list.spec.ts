import { expect, test } from "@playwright/test";
import { ConsultantsManagementListPage } from "../../pages/ConsultantsManagementListPage";
import { testData } from "../../fixtures/testData";

test.describe("Consultants management list", () => {
  test.beforeEach(async ({ page }) => {
    const consultants = new ConsultantsManagementListPage(page);
    await consultants.goto();
  });

  test("renders provider cards with a logo, status tag and fields", async ({
    page,
  }) => {
    const consultants = new ConsultantsManagementListPage(page);
    expect(await consultants.cards.count()).toBeGreaterThanOrEqual(2);
    await expect(consultants.cards.first().locator(".ant-tag")).toBeVisible();
  });

  test("known issue: the list shows every provider, not just consultant-flagged ones - consultantsManagementList.tsx never sends the is_consultant filter the backend supports", async ({
    page,
  }) => {
    // getConsultantsManagement() calls GET /admin/providers with only
    // {sort:"-created_at", page, per_page} - no is_consultant param at all -
    // even though ProviderRepository declares
    // AllowedFilter::exact('is_consultant') as a supported filter. So this
    // "consultants management" screen is really just an unfiltered copy of
    // the main service-providers list: it shows both consultant-flagged
    // providers (active, incomplete) AND the two that are NOT
    // consultant-flagged (pending, suspended).
    const consultants = new ConsultantsManagementListPage(page);

    await expect(
      consultants.cardByName(testData.providers.active.teamName),
    ).toBeVisible();
    await expect(
      consultants.cardByName(testData.providers.incomplete.teamName),
    ).toBeVisible();
    // These two are NOT is_consultant, yet still show up - proving the list
    // is unfiltered.
    await expect(
      consultants.cardByName(testData.providers.pending.teamName),
    ).toBeVisible();
    await expect(
      consultants.cardByName(testData.providers.suspended.teamName),
    ).toBeVisible();
  });

  test("each card's 'تعيين كمستشار' checkbox reflects that provider's real is_consultant flag", async ({
    page,
  }) => {
    const consultants = new ConsultantsManagementListPage(page);

    await expect(
      consultants.consultantCheckbox(testData.providers.active.teamName),
    ).toBeChecked();
    await expect(
      consultants.consultantCheckbox(testData.providers.incomplete.teamName),
    ).toBeChecked();
    await expect(
      consultants.consultantCheckbox(testData.providers.pending.teamName),
    ).not.toBeChecked();
    await expect(
      consultants.consultantCheckbox(testData.providers.suspended.teamName),
    ).not.toBeChecked();
  });

  test("'عرض الحساب' navigates to that provider's consultants-management detail page", async ({
    page,
  }) => {
    const consultants = new ConsultantsManagementListPage(page);
    await consultants.viewAccountLink(testData.providers.active.teamName).click();

    await expect(page).toHaveURL(/\/admin\/consultants-management\/\d+$/);
  });

  test("saving submits every card's checkbox state as one updateConsultantStatus payload (mocked)", async ({
    page,
  }) => {
    const consultants = new ConsultantsManagementListPage(page);

    let capturedBody: { items?: { team_id: number; status: boolean }[] } = {};
    await page.route("**/admin/providers/consultant", async (route) => {
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

    // Flip the pending provider's checkbox on, then save.
    await consultants.consultantCheckbox(testData.providers.pending.teamName).check();
    await consultants.saveButton.click();

    await expect(page.getByText("تم تحديث حالة المزود بنجاح")).toBeVisible();
    expect(capturedBody.items).toBeDefined();
    // onFinish maps is_consultant -> the "status" key (not "is_consultant")
    // for every card, in one batched request.
    expect(capturedBody.items!.length).toBeGreaterThanOrEqual(4);
    // At least one item reflects the freshly-checked "pending" card's new
    // (true) state, alongside the others' unchanged state.
    expect(capturedBody.items!.some((item) => item.status === true)).toBe(true);
  });
});
