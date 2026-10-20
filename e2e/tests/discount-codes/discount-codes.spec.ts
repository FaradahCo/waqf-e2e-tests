import { expect, test } from "@playwright/test";
import { DiscountCodesPage } from "../../pages/DiscountCodesPage";
import { testData } from "../../fixtures/testData";

test.describe("Discount codes list", () => {
  test.beforeEach(async ({ page }) => {
    const codes = new DiscountCodesPage(page);
    await codes.goto();
  });

  test("renders the seeded discount codes with their status tags", async ({
    page,
  }) => {
    const codes = new DiscountCodesPage(page);
    expect(await codes.list.rowCount()).toBeGreaterThan(0);
    await expect(codes.list.table.locator(".ant-tag").first()).toBeVisible();
  });

  test("known issue: the summary cards show hardcoded counts, not real data", async ({
    page,
  }) => {
    // src/.../discoundCodesList.tsx passes value={20} / value={28} directly
    // instead of deriving them from the fetched list - these never change.
    const activeCardValue = page
      .locator("p", { hasText: "أكواد مفعلة" })
      .locator("xpath=..")
      .locator(".text-2xl.font-semibold");
    const otherCardValue = page
      .locator("p", { hasText: "أكواد ملفية" })
      .locator("xpath=..")
      .locator(".text-2xl.font-semibold");

    await expect(activeCardValue).toHaveText("20");
    await expect(otherCardValue).toHaveText("28");
  });

  test("filtering by a status with no matching codes shows an empty table", async ({
    page,
  }) => {
    const codes = new DiscountCodesPage(page);
    await codes.list.filterBySelect("الحالة", "اختبار");
    await expect(codes.list.emptyState).toBeVisible();
  });
});

test.describe("Discount codes - create modal validation", () => {
  test.beforeEach(async ({ page }) => {
    const codes = new DiscountCodesPage(page);
    await codes.goto();
    await codes.openCreateModal();
  });

  test("requires code, percentage, service, dates, and usage count", async ({
    page,
  }) => {
    const codes = new DiscountCodesPage(page);
    await codes.submit();

    await expect(codes.fieldError("يرجى إدخال الكود")).toBeVisible();
    await expect(codes.fieldError("يرجى إدخال نسبة الخصم")).toBeVisible();
    await expect(codes.fieldError("يرجى إدخال اسم الخدمة")).toBeVisible();
    await expect(codes.fieldError("يرجى اختيار تاريخ البداية")).toBeVisible();
    await expect(codes.fieldError("يرجى اختيار تاريخ النهاية")).toBeVisible();
    await expect(
      codes.fieldError("يرجى إدخال عدد مرات الاستخدام"),
    ).toBeVisible();
  });

  test("rejects a code shorter than 3 characters", async ({ page }) => {
    const codes = new DiscountCodesPage(page);
    await codes.fillCode("ab");
    await codes.submit();
    await expect(
      codes.fieldError("الكود يجب أن يكون 3 أحرف على الأقل"),
    ).toBeVisible();
  });

  test("percentage input clamps out-of-range values instead of showing an error", async ({
    page,
  }) => {
    const codes = new DiscountCodesPage(page);
    const percentageInput = codes.formField("نسبة الخصم").locator("input");

    await percentageInput.fill("150");
    await percentageInput.blur();
    await expect(percentageInput).toHaveValue("100");

    await percentageInput.fill("-20");
    await percentageInput.blur();
    await expect(percentageInput).toHaveValue("0");
  });

  test("remaining-uses input clamps below its minimum of 1", async ({
    page,
  }) => {
    const codes = new DiscountCodesPage(page);
    const usesInput = codes.formField("عدد مرات الاستخدام").locator("input");

    await usesInput.fill("0");
    await usesInput.blur();
    await expect(usesInput).toHaveValue("1");
  });

  test("rejects a code that already exists on the server", async ({
    page,
  }) => {
    const codes = new DiscountCodesPage(page);
    await codes.fillCode(testData.discountCodes.active.code);
    await codes.fillPercentage(15);
    await codes.selectFirstServiceOption();
    await codes.fillStartAt("2026-09-04");
    await codes.fillExpiresAt("2026-12-31");
    await codes.fillRemainingUses(5);
    await codes.submit();

    await expect(page.getByText("كود الخصم موجود بالفعل")).toBeVisible();
    // Stays open - the duplicate-code error is a global toast, not an inline
    // field error, since this mutation has no onError -> setFormFieldErrors.
    await expect(codes.modal).toBeVisible();
  });
});

test.describe("Discount codes - full lifecycle", () => {
  test("creates, edits, and deletes a discount code", async ({ page }) => {
    const codes = new DiscountCodesPage(page);
    await codes.goto();

    const uniqueCode = `E2ECREATE${Date.now()}`;

    await codes.openCreateModal();
    await codes.fillCode(uniqueCode);
    await codes.fillPercentage(15);
    // `type` has no client-side "required" rule (unlike the backend, which
    // does require it) - select it explicitly, and before the service, since
    // changing type re-filters the service options.
    await codes.selectType("خدمة");
    await codes.selectFirstServiceOption();
    await codes.fillStartAt("2026-09-04");
    await codes.fillExpiresAt("2026-12-31");
    await codes.fillRemainingUses(10);
    await codes.submit();

    await expect(codes.modal).toBeHidden();
    await codes.list.setPageSize(100);
    const createdRow = codes.list.rowByText(uniqueCode);
    await expect(createdRow).toBeVisible();

    // Edit: bump the percentage and confirm the modal is pre-filled.
    await createdRow.locator(".anticon-edit").click();
    await expect(
      page.locator(".ant-modal-title", { hasText: "تعديل كود الخصم" }),
    ).toBeVisible();
    await expect(codes.formField("الكود").locator("input")).toHaveValue(
      uniqueCode,
    );
    await codes.fillPercentage(30);
    await codes.submit();
    await expect(codes.modal).toBeHidden();
    await codes.list.setPageSize(100);
    await expect(codes.list.rowByText(uniqueCode)).toContainText("30");

    // Delete: cancel first, row must survive.
    const row = codes.list.rowByText(uniqueCode);
    await row.locator(".anticon-delete").click();
    await expect(page.getByText("هل أنت متأكد من حذف كود الخصم؟")).toBeVisible();
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await expect(codes.list.rowByText(uniqueCode)).toBeVisible();

    // Delete: confirm this time, row must disappear.
    await row.locator(".anticon-delete").click();
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await codes.list.setPageSize(100);
    await expect(codes.list.rowByText(uniqueCode)).toHaveCount(0);
  });
});
