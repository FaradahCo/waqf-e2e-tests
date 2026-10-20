import { expect, test } from "@playwright/test";
import { WalletBalancesPage } from "../../pages/WalletBalancesPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

test.describe("Balances - clients tab ('العملاء', filter[type]=client)", () => {
  test("shows real, non-hardcoded balances for both seeded client wallets", async ({
    page,
  }) => {
    const balances = new WalletBalancesPage(page);
    await balances.goto();
    await balances.gotoTab("clients");

    const list = balances.list();
    // Zero-balance client wallets are created lazily (e.g. when a client's
    // wallet tab is first opened), so the row count depends on prior
    // activity - compare against the API instead of a fixed number.
    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
    const res = await page.request.get(`${env.backendApiUrl}/admin/wallet`, {
      params: { "filter[type]": "client", per_page: 50 },
      headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
    });
    const apiCount = ((await res.json()).data.data as unknown[]).length;
    expect(apiCount).toBeGreaterThanOrEqual(2);
    expect(await list.rowCount()).toBe(apiCount);

    const activeRow = list.rowByText(testData.clients.active.name);
    await expect(activeRow).toContainText(testData.wallet.clientAvailableBalance);
    await expect(activeRow).toContainText(testData.wallet.clientPendingBalance);

    const active2Row = list.rowByText(testData.clients.active2.name);
    await expect(active2Row).toContainText(testData.wallet.clientAvailableBalance);
  });
});

test.describe("Balances - providers tab ('مزودي الخدمات', filter[type]=provider)", () => {
  test("shows real balances for every seeded provider team's wallet", async ({ page }) => {
    const balances = new WalletBalancesPage(page);
    await balances.goto();
    await balances.gotoTab("providers");

    const list = balances.list();
    expect(await list.rowCount()).toBe(4);

    // otherBalancesColumns renders `ownerable.name`, which for a Team
    // ownerable resolves to the *owner user's* name, not the business name -
    // same lookup used for withdrawal owners.
    const activeRow = list.rowByText(testData.providers.active.ownerName);
    await expect(activeRow).toContainText(testData.wallet.providerAvailableBalance);
    await expect(activeRow).toContainText(testData.wallet.providerPendingBalance);
  });
});

test.describe("Balances - platform tab ('المنصة') - known issue", () => {
  test("known issue: the 'platform' tab calls GET admin/wallet with no type filter at all, so it lists every wallet in the system instead of just the platform's own", async ({
    page,
  }) => {
    // balancesList.tsx: the "client"/"provider" tabs correctly pass
    // `{type: "client"}` / `{type: "provider"}` to getWallets(), but the
    // "platform" tab passes no `type` at all - even though the backend
    // explicitly supports `filter[type]=platform` to isolate the single
    // platform wallet (ownerable_id/type both NULL), confirmed via a direct
    // API check. As a result this tab, literally labeled "المنصة", shows
    // every client AND every provider wallet mixed in with the platform row.
    const balances = new WalletBalancesPage(page);
    await balances.goto(); // "platform" is the default (first) tab.

    const list = balances.list();
    await list.setPageSize(100);

    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
    const [allResp, platformOnlyResp] = await Promise.all([
      page.request.get(`${env.backendApiUrl}/admin/wallet`, {
        headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
      }),
      page.request.get(`${env.backendApiUrl}/admin/wallet?filter[type]=platform`, {
        headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
      }),
    ]);
    const allTotal = (await allResp.json()).data.meta.total;
    const platformOnlyTotal = (await platformOnlyResp.json()).data.meta.total;

    expect(platformOnlyTotal).toBe(1);
    expect(allTotal).toBeGreaterThan(1);
    expect(await list.rowCount()).toBe(allTotal);

    // Both a client's and a provider's wallet show up under "المنصة".
    await expect(list.rowByText(testData.clients.active.name)).toBeVisible();
    await expect(list.rowByText(testData.providers.active.ownerName)).toBeVisible();
  });
});
