import { expect, test, type Page } from "@playwright/test";
import { ServiceReviewPage } from "../../pages/ServiceReviewPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

/** Service ids aren't stable across a reseed - look one up by its unique seeded title. */
async function getServiceIdByTitle(page: Page, title: string): Promise<number> {
  await page.goto("/admin/service-management");
  const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
  const response = await page.request.get(`${env.backendApiUrl}/admin/services`, {
    params: { per_page: 50 },
    headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const match = (body.data.data as { id: number; title: string }[]).find(
    (s) => s.title === title,
  );
  if (!match) throw new Error(`No seeded service found with title "${title}"`);
  return match.id;
}

test.describe("Service review - a service with no pending revision", () => {
  test("renders the read-only service fields and an editable status <Select> (no approve/refuse buttons)", async ({
    page,
  }) => {
    const id = await getServiceIdByTitle(page, testData.services.byStatus.approved);
    const review = new ServiceReviewPage(page);
    await review.goto(id);

    await expect(review.field("اسم الخدمة")).toHaveValue(testData.services.byStatus.approved);
    await expect(review.field("تصنيف الخدمة")).toHaveValue(testData.services.realFieldNames[2]); // أعمال محاسبية
    await expect(review.statusSelect).toBeVisible();
    await expect(review.statusSelect.locator(".ant-select-selection-item")).toHaveText("متاحة");
    await expect(review.statusTag).toHaveCount(0);
    await expect(review.approveButton).toHaveCount(0);
    await expect(review.returnWithNotesButton).toHaveCount(0);
  });

  test("known issue: no seeded service ever has a pending revision, so the review screen's core purpose (approve/refuse a submitted edit) is untestable against real data - the 'سجل الخدمة' log is always empty too", async ({
    page,
  }) => {
    // E2EFixtureSeeder.php never creates a ServiceRevision row for any of the
    // 8 seeded services, even the one whose *status* is literally
    // "revision_pending" - GET /admin/revisions?filter[service_id]=X always
    // returns an empty collection for every seeded service.
    const id = await getServiceIdByTitle(page, testData.services.byStatus.revision_pending);
    const review = new ServiceReviewPage(page);
    await review.goto(id);

    // The "سجل الخدمة" Collapse has no defaultActiveKey, so it starts closed.
    await page.getByText("سجل الخدمة").click();
    await expect(review.serviceLogList().emptyState).toBeVisible();
  });

  test("known issue: a service whose status is 'revision_pending' still shows the plain editable status <Select>, not the approve/refuse review UI, because it has no actual pending_revision row", async ({
    page,
  }) => {
    // serviceReview.tsx branches purely on `serviceData?.pending_revision`
    // (a separate ServiceRevision relation), not on `serviceData.status` -
    // so an admin can freely reassign a "بانتظار المراجعة" service straight
    // to "معتمد"/"معطلة"/etc. via the same disabled-option Select every
    // other service gets, completely bypassing whatever review flow the
    // "revision_pending" status is meant to gate.
    const id = await getServiceIdByTitle(page, testData.services.byStatus.revision_pending);
    const review = new ServiceReviewPage(page);
    await review.goto(id);

    await expect(review.statusSelect).toBeVisible();
    await expect(review.statusSelect.locator(".ant-select-selection-item")).toHaveText(
      "بانتظار المراجعة",
    );
    await expect(review.approveButton).toHaveCount(0);
    await expect(review.returnWithNotesButton).toHaveCount(0);
  });

  test("changing the status sends the new value and shows the server's success toast (mocked)", async ({
    page,
  }) => {
    const id = await getServiceIdByTitle(page, testData.services.byStatus.inactive);
    const review = new ServiceReviewPage(page);
    await review.goto(id);

    let capturedBody: unknown;
    await page.route(`**/admin/services/${id}`, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { id, status: "approved", status_label: "متاحة" },
          message: "تم التعديل بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    const { selectAntOption } = await import("../../utils/antSelect");
    await selectAntOption(page, review.statusSelect, "متاحة");

    expect(capturedBody).toEqual({ status: "approved" });
    await expect(page.getByText("تم التعديل بنجاح")).toBeVisible();
  });
});

test.describe("Service review - a service with a pending revision (mocked)", () => {
  // No seeded service has a real pending_revision row (see the "known issue"
  // test above), so GET /admin/services/:id's response is mocked to include
  // one - this is a read-only mock (not a mutation), used purely to reach
  // and exercise the approve/refuse UI safely, per the repo's established
  // mock-the-network pattern for otherwise-untestable states.
  async function openMockedRevisionReview(page: Page, id: number) {
    await page.route(`**/admin/services/${id}`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id,
            team_id: 1,
            provider: { id: 1, business_name: "E2E Provider One - Active", logo: "" },
            type: "service",
            status: "revision_pending",
            status_label: "بانتظار المراجعة",
            title: testData.services.byStatus.revision_pending,
            field: { id: 2, name: "أعمال قانونية", slug: "e2e-legal-services" },
            description: "Seeded e2e service in status revision_pending.",
            duration: { type: "day", time: 5 },
            min_price: "700",
            response_time: 2,
            commission_rate: 10,
            outputs: [],
            scopes: [],
            requirements: [],
            pending_revision: {
              id: 4242,
              status: "pending",
              previous_status: "approved",
              note: null,
              data: {
                title: "E2E Service - revision_pending (proposed edit)",
                items: {
                  requirements: [],
                  outputs: [{ title: "مخرج مقترح", order: 0 }],
                  scopes: [],
                },
                duration_type: "day",
                duration_time: 10,
                min_price: "999",
                response_time: 3,
              },
              updated_at: "4 سبتمبر 2026",
              created_at: "4 سبتمبر 2026",
            },
            activities: [],
            published_at: null,
            updated_at: "4 سبتمبر 2026",
            created_at: "4 سبتمبر 2026",
          },
          message: "تم بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    const review = new ServiceReviewPage(page);
    await review.goto(id);
    return review;
  }

  test("shows the status tag + approve/refuse buttons, and the proposed edit's data instead of the live service data", async ({
    page,
  }) => {
    const id = await getServiceIdByTitle(page, testData.services.byStatus.revision_pending);
    const review = await openMockedRevisionReview(page, id);

    await expect(review.statusTag).toHaveText("بانتظار المراجعة");
    await expect(review.statusSelect).toHaveCount(0);
    await expect(review.approveButton).toBeVisible();
    await expect(review.returnWithNotesButton).toBeVisible();

    // The name field shows the *proposed* revision title, not the live one.
    await expect(review.field("اسم الخدمة")).toHaveValue(
      "E2E Service - revision_pending (proposed edit)",
    );
    // Rendered as a readOnly <Input value=.../>, not text content.
    await expect(page.locator('input[value="مخرج مقترح"]')).toBeVisible();
  });

  test("approving sends a request to the pending_revision's own id and shows the server's success toast", async ({
    page,
  }) => {
    const id = await getServiceIdByTitle(page, testData.services.byStatus.revision_pending);
    const review = await openMockedRevisionReview(page, id);

    let approveUrl: string | undefined;
    await page.route("**/admin/revisions/4242/approve", async (route) => {
      approveUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { id: 4242, status: "approved" },
          message: "تم قبول طلب التعديل بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await review.approveButton.click();
    await expect(page.getByText("تم قبول طلب التعديل بنجاح")).toBeVisible();
    expect(approveUrl).toContain("/admin/revisions/4242/approve");
    // onSuccess navigates back to the list.
    await expect(page).toHaveURL(/\/admin\/service-management$/);
  });

  test("refusing requires a non-empty reason before it will submit", async ({ page }) => {
    const id = await getServiceIdByTitle(page, testData.services.byStatus.revision_pending);
    const review = await openMockedRevisionReview(page, id);

    await review.returnWithNotesButton.click();
    await expect(review.rejectModal).toBeVisible();
    await review.submitReject();

    await expect(review.reasonError()).toBeVisible();
    // The modal must stay open - no request should have been sent.
    await expect(review.rejectModal).toBeVisible();
  });

  test("refusing with a reason sends {reason} to the revision's refuse endpoint and shows the success toast", async ({
    page,
  }) => {
    const id = await getServiceIdByTitle(page, testData.services.byStatus.revision_pending);
    const review = await openMockedRevisionReview(page, id);

    let capturedBody: unknown;
    await page.route("**/admin/revisions/4242/refuse", async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { id: 4242, status: "refused" },
          message: "تم رفض طلب التعديل بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await review.returnWithNotesButton.click();
    await review.reasonTextarea().fill("الرجاء توضيح السعر بشكل أدق");
    await review.submitReject();

    expect(capturedBody).toEqual({ reason: "الرجاء توضيح السعر بشكل أدق" });
    await expect(page.getByText("تم رفض طلب التعديل بنجاح")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/service-management$/);
  });

  test("known issue: the reject modal's 'موقع الملاحظة' (note location) field is captured but silently discarded - never sent to the backend", async ({
    page,
  }) => {
    // rejectService.tsx collects `noteLocation` in the same form as `reason`,
    // but serviceReview.tsx's handleOk only forwards `{reason: formData.reason}`
    // to rejectServiceRevisionMutation - the selected note location never
    // reaches the request body, even though RefuseServiceRevisionRequest
    // accepts an (unrelated) `rejection_details` array the frontend never
    // populates either.
    const id = await getServiceIdByTitle(page, testData.services.byStatus.revision_pending);
    const review = await openMockedRevisionReview(page, id);

    let capturedBody: unknown;
    await page.route("**/admin/revisions/4242/refuse", async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {},
          message: "تم رفض طلب التعديل بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await review.returnWithNotesButton.click();
    const { selectAntOption } = await import("../../utils/antSelect");
    await selectAntOption(page, review.rejectModal, "السعر");
    await review.reasonTextarea().fill("سبب الرفض");
    await review.submitReject();

    await expect.poll(() => capturedBody).not.toBeUndefined();
    expect(capturedBody).toEqual({ reason: "سبب الرفض" });
    expect(capturedBody).not.toHaveProperty("noteLocation");
    expect(capturedBody).not.toHaveProperty("rejection_details");
  });
});

test.describe("Service review - edge cases", () => {
  test("a failed status update surfaces the server's error as a global toast", async ({
    page,
  }) => {
    const id = await getServiceIdByTitle(page, testData.services.byStatus.hold);
    const review = new ServiceReviewPage(page);
    await review.goto(id);

    await page.route(`**/admin/services/${id}`, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          message: "قيمة الحالة غير صالحة",
          status: false,
          code: 422,
          errors: ["قيمة الحالة غير صالحة"],
        }),
      });
    });

    const { selectAntOption } = await import("../../utils/antSelect");
    await selectAntOption(page, review.statusSelect, "متاحة"); // approved
    await expect(page.getByText("قيمة الحالة غير صالحة")).toBeVisible();
  });

  test("known issue: navigating to a non-existent service id fails silently with a permanent loading spinner", async ({
    page,
  }) => {
    const review = new ServiceReviewPage(page);
    await review.goto(999999);

    await expect(page.locator(".ant-spin-spinning")).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(page.locator(".ant-message-error")).toHaveCount(0);
    await expect(review.headerCard).toHaveCount(0);
  });
});
