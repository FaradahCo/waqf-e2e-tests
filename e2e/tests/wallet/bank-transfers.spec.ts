import { expect, test } from "@playwright/test";
import { WalletTransactionsPage } from "../../pages/WalletTransactionsPage";
import { testData } from "../../fixtures/testData";

// verifyBankTransfer() posts to admin/bank-transfers/{id}/verify - a real
// financial state change on a shared seeded fixture row
// (testData.bankTransfers.pending). Per the module's isolation rules, every
// test below mocks the network response instead of hitting the real endpoint.

// These flows click through 2 levels of nested antd <Modal>s (the row's item
// modal, then a Confirm/Reject modal on top of it) - under this repo's
// shared, single local backend + dev server, running the full suite's
// default parallel workers can occasionally slow a lazy chunk load or
// network round-trip enough to need more than the default 30s.
test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
});

test.describe("Bank transfer verification modal (mocked) - approve flow", () => {
  test("shows the transfer's details and approving sends is_approved=true with empty admin_notes", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.gotoTab("deposit");
    await wallet.openConfirmModal(testData.clients.review.name);

    const modal = page.locator(".ant-modal-content", { hasText: "التحقق من صحة التحويل" });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("E2E Sender Pending");
    await expect(modal).toContainText("500");

    let capturedBody: unknown;
    await page.route(/\/admin\/bank-transfers\/\d+\/verify$/, async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "verified", status_label: "تم التحقق" },
          message: "تمت الموافقة على الحوالة البنكية بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await modal.getByRole("button", { name: "الموافقة" }).click();
    const confirmDialog = page.locator(".ant-modal-content", { hasText: "اعتماد حوالة" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "تأكيد", exact: false }).click();

    expect(capturedBody).toEqual({ is_approved: true, admin_notes: "" });
    await expect(page.getByText("تمت الموافقة على الحوالة البنكية بنجاح")).toBeVisible();
    await expect(modal).toBeHidden();
  });

  test("a failed approve surfaces the server's error as a global toast and leaves the modal open", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.gotoTab("deposit");
    await wallet.openConfirmModal(testData.clients.review.name);

    const modal = page.locator(".ant-modal-content", { hasText: "التحقق من صحة التحويل" });
    await page.route(/\/admin\/bank-transfers\/\d+\/verify$/, async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          message: "حدث خطأ ما",
          status: false,
          code: 422,
          errors: ["حدث خطأ ما"],
        }),
      });
    });

    await modal.getByRole("button", { name: "الموافقة" }).click();
    const confirmDialog = page.locator(".ant-modal-content", { hasText: "اعتماد حوالة" });
    await confirmDialog.getByRole("button", { name: "تأكيد", exact: false }).click();

    await expect(page.getByText("حدث خطأ ما")).toBeVisible();
    await expect(modal).toBeVisible();
  });
});

test.describe("Bank transfer verification modal (mocked) - reject flow", () => {
  test("rejecting requires selecting a reason, and sends is_approved=false with that reason as admin_notes", async ({
    page,
  }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.gotoTab("deposit");
    await wallet.openConfirmModal(testData.clients.review.name);

    const modal = page.locator(".ant-modal-content", { hasText: "التحقق من صحة التحويل" });
    await modal.getByRole("button", { name: "رفض", exact: true }).click();

    const rejectDialog = page.locator(".ant-modal-content", { hasText: "رفض التحويل" });
    await expect(rejectDialog).toBeVisible();
    await rejectDialog.getByRole("button", { name: "تأكيد", exact: true }).click();
    await expect(page.getByText("يرجى اختيار السبب")).toBeVisible();

    const reason = "الإيصال غير واضح أو ناقص البيانات";
    await rejectDialog.getByText(reason, { exact: true }).click();

    let capturedBody: unknown;
    await page.route(/\/admin\/bank-transfers\/\d+\/verify$/, async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "rejected", status_label: "مرفوض" },
          message: "تم رفض الحوالة البنكية",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await rejectDialog.getByRole("button", { name: "تأكيد", exact: true }).click();
    expect(capturedBody).toEqual({ is_approved: false, admin_notes: reason });
    await expect(page.getByText("تم رفض الحوالة البنكية")).toBeVisible();
  });

  test("'سبب آخر' additionally requires free text before confirming", async ({ page }) => {
    const wallet = new WalletTransactionsPage(page);
    await wallet.goto();
    await wallet.gotoTab("deposit");
    await wallet.openConfirmModal(testData.clients.review.name);

    const modal = page.locator(".ant-modal-content", { hasText: "التحقق من صحة التحويل" });
    await modal.getByRole("button", { name: "رفض", exact: true }).click();
    const rejectDialog = page.locator(".ant-modal-content", { hasText: "رفض التحويل" });

    await rejectDialog.getByText("سبب آخر", { exact: true }).click();
    await rejectDialog.getByRole("button", { name: "تأكيد", exact: true }).click();
    await expect(page.getByText("يرجى كتابة السبب", { exact: true })).toBeVisible();
  });
});

test.describe("Bank transfer verification - status-transition edge case (mocked)", () => {
  test("known issue: the UI never guards against re-verifying an already-verified/rejected transfer - only the backend does, with a dedicated 422", async ({
    page,
  }) => {
    // BankTransferService::verifyBankTransfer() throws
    // api.bank_transfer_already_verified ("تم التحقق من الحوالة البنكية
    // مسبقاً") when the transfer's status isn't pending. But the frontend's
    // "تأكيد المعاملة" action (and the modal it opens) never checks the
    // row's status before allowing "الموافقة"/"رفض" - the wallet list simply
    // never shows a non-pending row today because its status filter is
    // hardcoded to "pending" with no UI to change it. We mock a non-pending
    // row here (and the backend's real rejection message) to prove the gap
    // exists purely on the client.
    await page.route("**/admin/bank-transfers*", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            data: [
              {
                id: 999002,
                name: "mocked already-verified sender",
                payment_id: 1,
                status: "verified",
                status_label: "تم التحقق",
                sender_name: "mocked already-verified sender",
                payment: { total_paid: "500", payment_method_label: "تحويل بنكي" },
                created_at: "4 سبتمبر 2026",
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
    await page.route(/\/admin\/bank-transfers\/999002$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: 999002,
            sender_name: "mocked already-verified sender",
            created_at: "4 سبتمبر 2026",
            transfer_receipt: null,
            payment: { total_paid: "500", payment_method_label: "تحويل بنكي" },
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
    // bankTransferListColumns renders no status column at all (only ever
    // meaningful because this list is hardcoded to status=pending) - so this
    // already-verified mocked row looks identical to a real pending one.
    expect(await list.rowCount()).toBe(1);

    await wallet.openConfirmModal("mocked already-verified sender");
    const modal = page.locator(".ant-modal-content", { hasText: "التحقق من صحة التحويل" });
    // The approve/reject actions are offered identically, with no
    // indication anywhere that this transfer was already resolved.
    await expect(modal.getByRole("button", { name: "الموافقة" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "رفض", exact: true })).toBeVisible();

    await page.route(/\/admin\/bank-transfers\/999002\/verify$/, async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          message: "تم التحقق من الحوالة البنكية مسبقاً",
          status: false,
          code: 422,
          errors: ["تم التحقق من الحوالة البنكية مسبقاً"],
        }),
      });
    });

    await modal.getByRole("button", { name: "الموافقة" }).click();
    const confirmDialog = page.locator(".ant-modal-content", { hasText: "اعتماد حوالة" });
    await confirmDialog.getByRole("button", { name: "تأكيد", exact: false }).click();

    await expect(page.getByText("تم التحقق من الحوالة البنكية مسبقاً")).toBeVisible();
  });
});
