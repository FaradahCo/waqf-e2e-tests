import { expect, test } from "@playwright/test";
import { ServiceProviderListPage } from "../../pages/ServiceProviderListPage";
import { ServiceProviderDetailsPage, type ServiceProviderTabKey } from "../../pages/ServiceProviderDetailsPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

/**
 * PR #78 made the 4 stat cards above the provider details tabs change their
 * titles based on the active tab (Redux `serviceProviderDetailsTab`).
 */
const cardTitles = (page: import("@playwright/test").Page) =>
  page.locator(".flex").filter({ has: page.locator("img[src*='user']") }).first();

async function openActiveProvider(page: import("@playwright/test").Page) {
  const providers = new ServiceProviderListPage(page);
  await providers.goto();
  await providers.clickProvider(testData.providers.active.teamName);
  await expect(page).toHaveURL(/\/admin\/service-providers\/\d+/);
  const id = Number(page.url().match(/service-providers\/(\d+)/)![1]);
  return { id, details: new ServiceProviderDetailsPage(page) };
}

test.describe("Service provider details - tab-aware stat cards", () => {
  test("on the consultation tab the card values come from consultation data, not service-request counts", async ({
    page,
  }) => {
    const { id, details } = await openActiveProvider(page);
    await details.gotoTab("consultation");
    await expect(page.getByText("إجمالي الاستشارات")).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
    const res = await page.request.get(`${env.backendApiUrl}/admin/providers/${id}/consultations`, {
      headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
    });
    const total = (await res.json()).data?.meta?.total ?? testData.providers.active.consultationsCount;

    const card = page.locator("div", { has: page.getByText("إجمالي الاستشارات", { exact: true }) }).last();
    await expect(card).toContainText(String(total));
  });

  test("known issue: the 4th card on the requests tab ('بانتظار ارسال العروض') shows the wallet's locked_balance", async ({
    page,
  }) => {
    const { id, details } = await openActiveProvider(page);
    await details.gotoTab("requests");
    await expect(page.getByText("بانتظار ارسال العروض")).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
    const dash = await page.request.get(`${env.backendApiUrl}/admin/providers/${id}/dashboard`, {
      headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
    });
    const d = (await dash.json()).data;
    // The dashboard payload has no "awaiting quotation" count at all - only
    // total/completed/in_progress request counts + locked_balance.
    expect(
      Object.keys(d).some((k) => /quot|pending|awaiting/.test(k)),
      `dashboard keys: ${Object.keys(d).join(", ")}`,
    ).toBe(true);
  });

  test("wallet/invoices/reviews tabs don't relabel provider cards as 'إجمالي المزودين'", async ({ page }) => {
    const { details } = await openActiveProvider(page);
    for (const tab of ["wallet", "invoices", "reviews"] as ServiceProviderTabKey[]) {
      await details.gotoTab(tab);
      await expect(page.getByText("إجمالي المزودين", { exact: true }), `tab ${tab}`).toHaveCount(0);
    }
  });

  test("the active tab is restored after a hard reload", async ({ page }) => {
    const { details } = await openActiveProvider(page);
    await details.gotoTab("consultation");
    await expect(page).toHaveURL(/\/consultation$/);
    await page.reload();
    await expect(page.locator(".custom-tabs .ant-tabs-tab-active")).toHaveText("الاستشارة");
    await expect(page.getByText("إجمالي الاستشارات")).toBeVisible();
  });
});

test.describe("Service providers list - search by business name", () => {
  test("searching by team business name finds the provider", async ({ page }) => {
    const providers = new ServiceProviderListPage(page);
    await providers.goto();
    const req = page.waitForRequest((r) => /filter(%5B|\[)business_name/.test(r.url()));
    await page.locator(".ant-form-item").first().locator("input").fill("Provider One");
    await req;
    await providers.list.waitForLoaded();
    await expect(providers.list.rowByText(testData.providers.active.teamName)).toBeVisible();
  });
});
