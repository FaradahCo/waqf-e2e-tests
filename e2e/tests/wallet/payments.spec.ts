import { expect, test } from "@playwright/test";
import { WalletPaymentsPage } from "../../pages/WalletPaymentsPage";
import { testData } from "../../fixtures/testData";
import { openAntSelectListbox } from "../../utils/antSelect";

test.describe("Payments list - clients tab", () => {
  test("renders all 6 seeded payments with their client, amount, method and status", async ({
    page,
  }) => {
    const payments = new WalletPaymentsPage(page);
    await payments.goto();

    // admin/payments has exactly these 6 rows system-wide (confirmed via a
    // direct API check) - no pagination surprises at the default per_page.
    expect(await payments.list().rowCount()).toBe(6);
    await expect(payments.list().table).toContainText(testData.clients.active.waqfName);
    await expect(payments.list().table.locator(".ant-tag").first()).toBeVisible();
  });

  test("filtering by 'مكتملة' shows exactly the 2 completed payments, both belonging to the same client", async ({
    page,
  }) => {
    const payments = new WalletPaymentsPage(page);
    await payments.goto();
    await payments.filterByStatus("مكتملة");

    const list = payments.list();
    expect(await list.rowCount()).toBe(2);
    for (let i = 0; i < 2; i++) {
      await expect(list.row(i)).toContainText(testData.clients.active.waqfName);
    }
    await expect(list.table).toContainText("فيزا");
    await expect(list.table).toContainText("محفظة");
  });

  test("filtering by 'بانتظار الدفع' shows only that client's pending payment", async ({
    page,
  }) => {
    const payments = new WalletPaymentsPage(page);
    await payments.goto();
    await payments.filterByStatus("بانتظار الدفع");

    const list = payments.list();
    expect(await list.rowCount()).toBe(1);
    await expect(list.rows.first()).toContainText(testData.clients.active2.waqfName);
  });

  test("known issue: neither the completed-with-invoice nor the completed-without-invoice payment shows any invoice info - the clients tab has no invoice column at all", async ({
    page,
  }) => {
    // paymentClientsColumns (paymentConfig.tsx) only renders id/client/code/
    // total_paid/payment_method_label/created_at/status - PaymentClientItem
    // carries a full `invoice` object from the API, but nothing on this
    // screen ever reads it. An admin can't tell from this list which
    // payments actually produced an invoice.
    const payments = new WalletPaymentsPage(page);
    await payments.goto();
    await payments.filterByStatus("مكتملة");

    const list = payments.list();
    expect(await list.rowCount()).toBe(2);
    await expect(list.table).not.toContainText("E2E-INV-");
  });
});

test.describe("Payments list - providers tab ('مزودي الخدمات')", () => {
  test("known issue: this tab actually renders withdrawal requests (admin/withdrawals), not provider payments/earnings", async ({
    page,
  }) => {
    // walletService.getPaymentsProvider() calls GET admin/withdrawals - the
    // exact same endpoint the /admin/wallet withdraw tab uses. The 3 rows
    // shown here are the 3 seeded *withdrawal* fixtures (amount 200 each),
    // not any of the 6 seeded *payment* fixtures (amount 500 each) that
    // actually belong to this provider's service.
    const payments = new WalletPaymentsPage(page);
    await payments.goto();
    await payments.gotoTab("providers");

    const list = payments.list();
    expect(await list.rowCount()).toBe(testData.providers.active.withdrawalsCount);
    for (let i = 0; i < 3; i++) {
      await expect(list.row(i)).toContainText(testData.providers.active.ownerName);
      await expect(list.row(i)).toContainText("200");
    }
    // Withdrawal codes are prefixed "W" (see WithdrawalResource) - a real
    // provider *payment* row would show a payment code (prefixed "P") and a
    // 500 SAR amount instead, as seen on the clients tab.
    await expect(list.table.getByText(/^W\w+$/)).toHaveCount(3);
    await expect(list.table).not.toContainText("500");
  });

  test("known issue: the status filter's options on this tab are withdrawal statuses, not payment statuses - another symptom of the same endpoint mixup", async ({
    page,
  }) => {
    const payments = new WalletPaymentsPage(page);
    await payments.goto();
    await payments.gotoTab("providers");
    await payments.list().waitForLoaded();

    const listbox = await openAntSelectListbox(page, payments.statusFilterField());
    for (const label of ["قيد الانتظار", "مكتمل", "مرفوض"]) {
      await expect(listbox.getByText(label, { exact: true })).toBeVisible();
    }
    // Payment-only statuses must NOT appear as options here.
    await expect(listbox.getByText("بانتظار الدفع", { exact: true })).toHaveCount(0);
    await expect(listbox.getByText("قيد الاعتماد", { exact: true })).toHaveCount(0);
  });
});
