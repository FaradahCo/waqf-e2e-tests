import { expect, test } from "@playwright/test";
import { testData } from "../../fixtures/testData";

/**
 * serviceProvidersRoutes.tsx declares two distinct "review" routes:
 *  - /admin/reviews/:id (registered as a top-level sibling in pages.routes.tsx,
 *    pointing at serviceProviderReview.tsx) - this is the one the list page
 *    actually navigates to (serviceProviderRoutePath.SERVICE_PROVIDER_REVIEWS).
 *  - /admin/service-providers/reviews/:id (the `{ path: "reviews/:id" }` entry
 *    inside ServiceProviderRoutes itself, with no `lazy`/`element`/`Component`
 *    at all) - referenced by the unused `REVIEW_PAGE` constant, but nothing
 *    in the app ever links to it.
 */
test.describe("Service provider review routes", () => {
  test("/admin/reviews/:id renders the real review page", async ({ page }) => {
    // Look up a review-status provider's team id via the list page click,
    // since ids aren't stable across a reseed.
    await page.goto("/admin/service-providers");
    await page.getByText(testData.providers.pending.teamName).click();
    await expect(page).toHaveURL(/\/admin\/reviews\/\d+$/);

    await expect(
      page.getByText(testData.providers.pending.teamName, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "قبول" })).toBeVisible();
  });

  test("known issue: /admin/service-providers/reviews/:id is a dead route - it matches but renders nothing", async ({
    page,
  }) => {
    await page.goto("/admin/service-providers/reviews/1");

    await expect(page).toHaveURL(/\/admin\/service-providers\/reviews\/1$/);
    // The app shell (sidebar) still renders since MainLayout is still the
    // matched parent route, but the route entry itself has no
    // lazy/element/Component, so <Content><Outlet/></Content> renders empty.
    await expect(page.locator(".ant-layout-sider")).toBeVisible();
    await expect(page.locator(".ant-layout-content")).toBeEmpty();
  });
});
