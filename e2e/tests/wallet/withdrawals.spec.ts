import { expect, test } from "@playwright/test";
import { WalletTransactionsPage } from "../../pages/WalletTransactionsPage";
import { testData } from "../../fixtures/testData";
import { makeDummyImageFile } from "../../utils/dummyFile";

const dummyReceipt = makeDummyImageFile();

// confirmWithdraw() posts a multipart FormData to admin/withdrawals/{id}/status
// - this is a real financial state change on a shared seeded fixture row
// (testData.withdrawals.pending), which service-providers/details.spec.ts's
// wallet-tab tests also assert on. Per the module's isolation rules, every
// test below mocks the network response instead of hitting the real endpoint.

// These flows click through 2 levels of nested antd <Modal>s (the row's item
// modal, then a Confirm/Reject modal on top of it) - under this repo's
// shared, single local backend + dev server, running the full suite's
// default parallel workers can occasionally slow a lazy chunk load or
// network round-trip enough to need more than the default 30s.
test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
});

test.describe("Withdraw confirmation modal (mocked) - file requirement", () => {
  test("both 'تأكيد السحب' and 'رفض' require a receipt to be uploaded first", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.openConfirmModal(testData.providers.active.ownerName);

    const modal = page.locator(".ant-modal-content", { hasText: "سحب الرصيد" });
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: "تأكيد السحب" }).click();
    await expect(page.getByText("يرجى رفع الإيصال")).toBeVisible();
    // No confirm dialog opened.
    await expect(page.getByText("اعتماد سحب ارباح")).toHaveCount(0);

    await modal.getByRole("button", { name: "رفض", exact: true }).click();
    await expect(page.getByText("يرجى رفع الإيصال").last()).toBeVisible();
    await expect(page.getByText("رفض طلب سحب الرصيد")).toHaveCount(0);
  });
});

test.describe("Withdraw confirmation modal (mocked) - complete flow", () => {
  test("uploading a receipt and confirming sends answer=complete with the receipt, and shows the success toast", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.openConfirmModal(testData.providers.active.ownerName);

    const modal = page.locator(".ant-modal-content", { hasText: "سحب الرصيد" });
    await modal.locator('input[type="file"]').setInputFiles(dummyReceipt);

    let capturedBody = "";
    let capturedUrl = "";
    await page.route(/\/admin\/withdrawals\/\d+\/status$/, async (route) => {
      capturedUrl = route.request().url();
      capturedBody = route.request().postData() ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "complete", status_label: "مكتمل" },
          message: "تم طلب السحب بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await modal.getByRole("button", { name: "تأكيد السحب" }).click();
    const confirmDialog = page.locator(".ant-modal-content", { hasText: "اعتماد سحب ارباح" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "تأكيد السحب", exact: true }).click();

    await expect(page.getByText("تم طلب السحب بنجاح")).toBeVisible();
    expect(capturedUrl).toMatch(/\/status$/);
    expect(capturedBody).toContain('name="answer"');
    expect(capturedBody).toContain("complete");
    expect(capturedBody).toContain('name="receipt"');
    // No `note` field is ever sent on the "complete" path.
    expect(capturedBody).not.toContain('name="note"');
    // Modal closes on success.
    await expect(modal).toBeHidden();
  });

  test("a failed confirm surfaces the server's error as a global toast and leaves the modal open", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.openConfirmModal(testData.providers.active.ownerName);

    const modal = page.locator(".ant-modal-content", { hasText: "سحب الرصيد" });
    await modal.locator('input[type="file"]').setInputFiles(dummyReceipt);

    await page.route(/\/admin\/withdrawals\/\d+\/status$/, async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          message: "لا يمكن اعتماد هذا السحب",
          status: false,
          code: 422,
          errors: ["لا يمكن اعتماد هذا السحب"],
        }),
      });
    });

    await modal.getByRole("button", { name: "تأكيد السحب" }).click();
    const confirmDialog = page.locator(".ant-modal-content", { hasText: "اعتماد سحب ارباح" });
    await confirmDialog.getByRole("button", { name: "تأكيد السحب", exact: true }).click();

    await expect(page.getByText("لا يمكن اعتماد هذا السحب")).toBeVisible();
    await expect(modal).toBeVisible();
  });
});

test.describe("Withdraw confirmation modal (mocked) - reject flow", () => {
  test("rejecting requires selecting a reason, and 'سبب آخر' additionally requires free text", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.openConfirmModal(testData.providers.active.ownerName);

    const modal = page.locator(".ant-modal-content", { hasText: "سحب الرصيد" });
    await modal.locator('input[type="file"]').setInputFiles(dummyReceipt);
    await modal.getByRole("button", { name: "رفض", exact: true }).click();

    const rejectDialog = page.locator(".ant-modal-content", { hasText: "رفض طلب سحب الرصيد" });
    await expect(rejectDialog).toBeVisible();

    await rejectDialog.getByRole("button", { name: "تأكيد", exact: true }).click();
    await expect(page.getByText("يرجى اختيار السبب")).toBeVisible();

    await rejectDialog.getByText("سبب آخر", { exact: true }).click();
    await rejectDialog.getByRole("button", { name: "تأكيد", exact: true }).click();
    await expect(page.getByText("يرجى كتابة السبب", { exact: true })).toBeVisible();
  });

  test("rejecting with a reason sends answer=reject with that reason as `note` - unlike the service-providers reject bug, this reason IS wired through", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.openConfirmModal(testData.providers.active.ownerName);

    const modal = page.locator(".ant-modal-content", { hasText: "سحب الرصيد" });
    await modal.locator('input[type="file"]').setInputFiles(dummyReceipt);
    await modal.getByRole("button", { name: "رفض", exact: true }).click();

    const rejectDialog = page.locator(".ant-modal-content", { hasText: "رفض طلب سحب الرصيد" });
    const reason = "رقم الآيبان غير صحيح أو غير نشط";
    await rejectDialog.getByText(reason, { exact: true }).click();

    let capturedBody = "";
    await page.route(/\/admin\/withdrawals\/\d+\/status$/, async (route) => {
      capturedBody = route.request().postData() ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "rejected", status_label: "مرفوض" },
          message: "تم طلب السحب بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await rejectDialog.getByRole("button", { name: "تأكيد", exact: true }).click();
    await expect(page.getByText("تم طلب السحب بنجاح")).toBeVisible();
    expect(capturedBody).toContain('name="answer"');
    expect(capturedBody).toContain("reject");
    expect(capturedBody).toContain('name="note"');
    expect(capturedBody).toContain(reason);
    // A receipt is required client-side before the reject modal can even
    // open (see the file-requirement test), so it's sent here too even
    // though rejecting a withdrawal has no obvious reason to need one.
    expect(capturedBody).toContain('name="receipt"');
  });
});

test.describe("Withdraw status transitions - known issue", () => {
  test("known issue: neither the frontend nor the backend guards against re-confirming an already non-pending withdrawal (unlike bank-transfer verification, which the backend rejects with a dedicated error)", async ({
    page,
  }) => {
    // Confirmed by reading app/Services/Admin/WithdrawalService.php: unlike
    // BankTransferService::verifyBankTransfer() (which throws
    // api.bank_transfer_already_verified for a non-pending transfer),
    // updateStatus()/markAsCompleted()/markAsRejected() never check the
    // withdrawal's current status at all - so a "complete" or "reject"
    // answer would be accepted for an already-complete/rejected withdrawal
    // by the real backend. We mock the list+confirm here (rather than
    // exercising the real endpoint against a seeded fixture) purely to prove
    // there's no client-side guard either: the "تأكيد المعاملة" action is
    // exposed identically regardless of the row's status.
    await page.route("**/admin/withdrawals*", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            data: [
              {
                id: 999001,
                code: "W-MOCK-REJECTED",
                wallet_id: 3,
                bank_account_id: 1,
                item_id: null,
                amount: "200",
                status: "rejected",
                status_label: "مرفوض",
                note: "mocked already-rejected withdrawal",
                invoice: null,
                receipt: null,
                owner: { name: testData.providers.active.ownerName, type: "Provider", id: 1, logo: null },
                bank_account: { id: 1, bank_name: "E2E Test Bank", account_name: "x", iban: "SA1", created_at: "", updated_at: "" },
                created_at: "4 سبتمبر 2026",
                updated_at: "4 سبتمبر 2026",
              },
            ],
            links: { first: "", last: "", prev: null, next: null },
            meta: { current_page: 1, from: 1, last_page: 1, per_page: 10, to: 1, total: 1 },
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

    const list = wallet.list();
    // withDrawListColumns renders no status column at all (only ever
    // meaningful because this list is hardcoded to status=pending) - so this
    // already-rejected mocked row looks identical to a real pending one.
    expect(await list.rowCount()).toBe(1);
    // The "تأكيد المعاملة" action is present and clickable for this already-
    // rejected row exactly as it would be for a pending one - no status
    // check gates it.
    await wallet.openConfirmModal(testData.providers.active.ownerName);
    await expect(
      page.locator(".ant-modal-content", { hasText: "سحب الرصيد" }),
    ).toBeVisible();
  });
});
