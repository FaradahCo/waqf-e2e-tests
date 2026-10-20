import { expect, test } from "@playwright/test";
import { WalletTransactionsPage } from "../../pages/WalletTransactionsPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

/** Reads the admin's bearer token straight out of localStorage, same pattern
 * used by service-providers/list.spec.ts for direct backend API checks. */
async function getAdminToken(page: import("@playwright/test").Page) {
  return page.evaluate(() => localStorage.getItem("ADMIN_token"));
}

test.describe("Wallet dashboard cards (shared by all /admin/wallet/* routes)", () => {
  test("the two balance cards reflect the real GET admin/wallet/dashboard numbers", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();

    const token = await getAdminToken(page);
    const response = await page.request.get(`${env.backendApiUrl}/admin/wallet/dashboard`, {
      headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
    });
    expect(response.status()).toBe(200);
    const dashboard = (await response.json()).data;

    await expect(wallet.cardValue("الرصيد المتاح")).toHaveText(
      String(dashboard.available_balance),
    );
    await expect(wallet.cardValue("رصيد قيد السحب")).toHaveText(
      String(dashboard.pending_balance),
    );
    // Real (not hardcoded): total_profits is null with no completed platform
    // commission recorded, so "الأرباح" correctly falls back to 0 rather than
    // showing some fixed placeholder number.
    await expect(wallet.cardValue("الأرباح")).toHaveText("0");
  });

  test("known issue: 'رصيد قيد السحب' and 'الرصيد المعلق' are two different cards bound to the exact same field", async ({
    page,
  }) => {
    // walletLayout.tsx passes `walletDashboard?.pending_balance` to BOTH the
    // "رصيد قيد السحب" and "الرصيد المعلق" <CardStatistic>s - a copy-paste bug.
    // The dashboard payload's distinct `withdrawal_balance` field (the
    // platform wallet's locked_balance, i.e. what's actually mid-withdrawal)
    // is never rendered anywhere on this page.
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();

    const token = await getAdminToken(page);
    const response = await page.request.get(`${env.backendApiUrl}/admin/wallet/dashboard`, {
      headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
    });
    const dashboard = (await response.json()).data;

    const pendingCard = wallet.cardValue("رصيد قيد السحب");
    const suspendedCard = wallet.cardValue("الرصيد المعلق");
    await expect(pendingCard).toHaveText(String(dashboard.pending_balance));
    await expect(suspendedCard).toHaveText(String(dashboard.pending_balance));

    // withdrawal_balance is a different, non-zero value in this fixture data
    // (there's a pending withdrawal locking part of the platform wallet) -
    // yet it appears on neither card.
    expect(dashboard.withdrawal_balance).not.toBe(dashboard.pending_balance);
    await expect(
      wallet.dashboardCards.getByText(String(dashboard.withdrawal_balance), { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("Wallet transactions page (/admin/wallet) - withdraw tab", () => {
  test("shows only the pending withdrawal fixture (status is hardcoded to pending, with no filter UI to see anything else)", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();

    // No <CustomFilter> is rendered on this page at all (unlike payments.tsx),
    // so there's no way to search or change the pending-only filter here.
    await expect(page.locator(".ant-form-item")).toHaveCount(0);

    const list = wallet.list();
    expect(await list.rowCount()).toBe(1);
    const row = list.rows.first();
    await expect(row).toContainText(testData.providers.active.ownerName);
    await expect(row).toContainText("200");
  });
});

test.describe("Wallet transactions page (/admin/wallet) - deposit tab", () => {
  test("shows only the pending bank-transfer fixture", async ({ page }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.gotoTab("deposit");

    const list = wallet.list();
    expect(await list.rowCount()).toBe(1);
    const row = list.rows.first();
    // bankTransferListColumns' "الاسم" column is bound to `name`, which the
    // API resolves to the *client's* name, not the sender_name shown inside
    // the verification modal.
    await expect(row).toContainText(testData.clients.review.name);
    await expect(row).toContainText("500");
  });

  test("known issue: pagination on the deposit tab is wired to the withdraw list's filter setter, so it never actually pages the bank-transfer table", async ({
    page,
  }) => {
    // walletList.config.tsx's getTabsItems() takes a single filter-change
    // callback and passes the *same* function (the withdraw useListHook's
    // handleFilterChange) to both <WithdrawList onChangeWithdrawListFilter>
    // and <DepositeList onChangeDepositeListFilter> - the bank-transfer
    // useListHook's own setter is never even destructured/used. Mock a
    // multi-page bank-transfer response and prove clicking "page 2" leaves
    // both the request and the rendered active-page indicator on page 1.
    const bankTransferRequests: string[] = [];
    await page.route("**/admin/bank-transfers*", async (route) => {
      bankTransferRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            data: [
              {
                id: 1,
                name: testData.clients.review.name,
                payment_id: 3,
                status: "pending",
                status_label: "بانتظار المراجعة",
                sender_name: "E2E Sender Pending",
                payment: { total_paid: "500" },
                created_at: "4 سبتمبر 2026",
              },
            ],
            links: { first: "", last: "", prev: null, next: "x" },
            meta: { current_page: 1, from: 1, last_page: 3, per_page: 10, to: 1, total: 25 },
          },
          message: "ok",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.gotoTab("deposit");
    const list = wallet.list();
    await list.waitForLoaded();

    expect(bankTransferRequests.length).toBe(1);
    await expect(list.pagination.locator(".ant-pagination-item-1")).toHaveClass(
      /ant-pagination-item-active/,
    );

    await list.pagination.locator(".ant-pagination-item-2").click();
    // Give any (incorrectly-routed) refetch a moment to fire.
    await page.waitForTimeout(500);

    // No second request ever reaches admin/bank-transfers...
    expect(bankTransferRequests.length).toBe(1);
    // ...and the pagination control snaps back to page 1, since its `current`
    // prop is still driven by the never-changing mocked response's meta.
    await expect(list.pagination.locator(".ant-pagination-item-1")).toHaveClass(
      /ant-pagination-item-active/,
    );
  });
});
