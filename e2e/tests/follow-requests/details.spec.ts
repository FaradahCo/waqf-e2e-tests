import { expect, test, type Page } from "@playwright/test";
import { FollowRequestsDetailsPage } from "../../pages/FollowRequestsDetailsPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

/**
 * Service request ids aren't stable across a reseed, and the list table
 * never renders the request's own `description` (see list.spec.ts's "known
 * issue" test) - so the only reliable way to find "the seeded request in
 * status X" is a direct, authenticated API lookup, exactly like the
 * dashboard-card assertions in service-providers/list.spec.ts.
 */
async function getServiceRequestIdByStatus(page: Page, status: string): Promise<number> {
  await page.goto("/admin/follow-requests");
  const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
  const response = await page.request.get(`${env.backendApiUrl}/admin/service-requests`, {
    params: { "filter[status]": status, per_page: 50 },
    headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const match = (body.data.data as { id: number; status: string }[]).find(
    (r) => r.status === status,
  );
  if (!match) throw new Error(`No seeded service request found in status "${status}"`);
  return match.id;
}

test.describe("Follow request details - a request with no quotation (pending)", () => {
  test("shows placeholder values for every cost/invoice field and an empty offer-details table", async ({
    page,
  }) => {
    const id = await getServiceRequestIdByStatus(
      page,
      testData.serviceRequests.statusWithoutQuotation,
    );
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(id);

    await expect(details.statusTag).toHaveText("بانتظار عرض السعر");

    // "الوقف" box: no accounting data at all yet.
    const waqfBox = details.box("الوقف");
    await expect(details.fieldValue(waqfBox, "التكلفة")).toHaveText("--");
    await expect(details.fieldValue(waqfBox, "طريقة الدفع")).toHaveText("--");
    await expect(details.fieldValue(waqfBox, "الفاتورة")).toHaveText("--");

    // No quotation at all yet -> no preview/print button, "--" placeholder instead.
    await expect(details.quotationActionButton).toHaveCount(0);

    // OfferDetails (quotations) table is empty.
    await expect(details.offerDetailsList().emptyState).toBeVisible();
  });
});

test.describe("Follow request details - a request with a quotation but no accepted/completed payment (quoted)", () => {
  test("falls back to the raw quotation price as 'cost', with no payment method or invoice", async ({
    page,
  }) => {
    const id = await getServiceRequestIdByStatus(page, "quoted");
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(id);

    await expect(details.statusTag).toHaveText("بانتظار الدفع");

    const waqfBox = details.box("الوقف");
    // accounting.client.cost falls back to the (unaccepted) quotation's own
    // price when there's no PaymentItem yet - shown as the raw "500.00"
    // string with no rounding/formatting.
    await expect(details.fieldValue(waqfBox, "التكلفة")).toContainText(/\b500(\.00)?\b/);
    await expect(details.fieldValue(waqfBox, "طريقة الدفع")).toHaveText("--");
    // has_invoice is true/false based on payment.invoice, but the button
    // only ever checks invoice_url (always null - odoo_url is never seeded),
    // so this is always "--" regardless of has_invoice.
    await expect(details.fieldValue(waqfBox, "الفاتورة")).toHaveText("--");

    // One quotation, listed in the offer-details table.
    expect(await details.offerDetailsList().rowCount()).toBe(1);
    await expect(details.offerDetailsList().rows.first()).toContainText("500");
    await expect(details.offerDetailsList().rows.first()).toContainText("بانتظار الدفع");

    await expect(details.quotationActionButton).toBeVisible();
  });
});

test.describe("Follow request details - a request with real accounting data (completed)", () => {
  test("shows the accepted quotation's payment item cost, payment method and invoice code", async ({
    page,
  }) => {
    const id = await getServiceRequestIdByStatus(
      page,
      testData.serviceRequests.statusWithRealAccounting,
    );
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(id);

    await expect(details.statusTag).toHaveText("مكتمل");

    const waqfBox = details.box("الوقف");
    // Overridden by the COMPLETED PaymentItem's own price (500), not the
    // quotation's own price (400 - visible instead in the offer-details row).
    await expect(details.fieldValue(waqfBox, "التكلفة")).toContainText(/\b500(\.00)?\b/);
    await expect(details.fieldValue(waqfBox, "طريقة الدفع")).toHaveText("فيزا");
    // has_invoice is true here, but invoice_url is still null (odoo_url never
    // seeded) - so the "الفاتورة" button never renders even for the one
    // request that actually has a real Invoice row.
    await expect(details.fieldValue(waqfBox, "الفاتورة")).toHaveText("--");

    // The platform box's own "التكلفة" section shows the invoice's total_cost.
    await expect(page.getByText(/^500\s/).first()).toBeVisible();

    const providerBox = details.box("مزود الخدمة");
    await expect(details.fieldValue(providerBox, "التكلفة")).toContainText(/\b450(\.00)?\b/);

    const platformBox = details.box("المنصة");
    await expect(details.fieldValue(platformBox, "نسبة المنصة")).toHaveText("10");

    expect(await details.offerDetailsList().rowCount()).toBe(1);
    await expect(details.offerDetailsList().rows.first()).toContainText("400");
    await expect(details.offerDetailsList().rows.first()).toContainText("مقبول");

    await expect(details.quotationActionButton).toBeVisible();
  });

  test("clicking the quotation preview/print button fires a print request with the quotation id and doesn't throw", async ({
    page,
  }) => {
    const id = await getServiceRequestIdByStatus(
      page,
      testData.serviceRequests.statusWithRealAccounting,
    );
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(id);

    let capturedBody: unknown;
    await page.route("**/admin/quotations/print", async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: Buffer.from("%PDF-1.4 fake"),
      });
    });

    await details.quotationActionButton.click();
    await expect
      .poll(() => capturedBody, { timeout: 5_000 })
      .toMatchObject({ quotation_ids: expect.any(Array) });
    expect((capturedBody as { quotation_ids: number[] }).quotation_ids).toHaveLength(1);
    // No crash / error toast from the mutation's onSuccess handler.
    await expect(page.locator(".ant-message-error")).toHaveCount(0);
  });
});

test.describe("Follow request details - consultant box (no consultation linked)", () => {
  test("shows the 0%/00 fallback values, never a raw null/undefined", async ({ page }) => {
    const id = await getServiceRequestIdByStatus(
      page,
      testData.serviceRequests.statusWithRealAccounting,
    );
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(id);

    const consultantBox = details.box("المستشار");
    await expect(details.fieldValue(consultantBox, "النسبة")).toHaveText("0%");
  });
});

test.describe("Follow request details - service outputs & request history", () => {
  test("a service with no outputs shows an empty outputs table, and the activity log lists the creation event", async ({
    page,
  }) => {
    const id = await getServiceRequestIdByStatus(
      page,
      testData.serviceRequests.statusWithoutQuotation,
    );
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(id);

    await expect(details.serviceOutputsList().emptyState).toBeVisible();

    expect(await details.requestHistoryList().rowCount()).toBeGreaterThanOrEqual(1);
    await expect(details.requestHistoryList().table).toContainText("تم إنشاء الطلب");
  });
});

test.describe("Follow request details - edge cases", () => {
  test("known issue: the admin quotations 'preview' endpoint the frontend calls when a request has no latest_quotation id does not exist on the backend", async ({
    page,
  }) => {
    // followRequestsService.ts's previewQuotation() posts to
    // /admin/quotations/preview - but routes/api/v1/admin.php only registers
    // POST /admin/quotations/print (QuotationController::printQuotations).
    // "/quotations/preview" only exists under the *provider* namespace
    // (routes/api/v1/provider.php), so this call 404s for every admin who
    // ever reaches that code path (in practice unreachable from this UI,
    // since the "العرض الفني والمالي.pdf" button only renders when
    // latest_quotation is truthy, and it always has an id when present - but
    // the dead endpoint reference is still a real, shippable bug).
    await page.goto("/admin/follow-requests");
    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
    const response = await page.request.post(`${env.backendApiUrl}/admin/quotations/preview`, {
      headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
      data: { quotations: [{ service_id: 1, price: 100, valid_until: 3 }] },
    });
    expect(response.status()).toBe(404);
  });

  test("known issue: navigating to a non-existent service request id fails silently instead of showing a not-found message", async ({
    page,
  }) => {
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(999999);

    // The page never leaves its loading spinner - useApiQuery has no
    // isError branch here, and the query isn't even declared with
    // retry:false, so it silently retries several times in the background
    // while the UI is stuck showing <Spin> forever.
    await expect(page.locator(".ant-spin-spinning")).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(page.locator(".ant-message-error")).toHaveCount(0);
    await expect(details.serviceDetailsSection).toHaveCount(0);
  });
});
