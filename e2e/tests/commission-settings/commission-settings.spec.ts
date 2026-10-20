import { expect, test, type Page } from "@playwright/test";
import { CommissionSettingsPage } from "../../pages/CommissionSettingsPage";
import { env } from "../../fixtures/env";

type LiveCommissionSettings = {
  main_commission_rate: number;
  offering_provider_commission_rate: number;
  subcontractor_commission_rate: number;
};

async function authHeaders(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
  return { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey };
}

/** Reads the real, currently-live commission rates directly from the backend. */
async function fetchLiveCommissionSettings(page: Page): Promise<LiveCommissionSettings> {
  const headers = await authHeaders(page);
  const response = await page.request.get(`${env.backendApiUrl}/admin/settings/commissions`, {
    headers,
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.data as LiveCommissionSettings;
}

async function fetchLiveCommissionLogs(page: Page): Promise<unknown[]> {
  const headers = await authHeaders(page);
  const response = await page.request.get(
    `${env.backendApiUrl}/admin/settings/commissions/logs`,
    { headers },
  );
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.data as unknown[];
}

/** Restoring PUT via Node's own `fetch` with pre-captured headers instead of
 * `page.request` - used only for the round-trip test's final restore, so it
 * doesn't depend on the Playwright page/context still being alive (e.g. if
 * the test ran long under a fully-parallel full-suite load and got torn
 * down before its own `finally` could run `page.request`). */
async function putLiveCommissionSettingsResilient(
  headers: Record<string, string>,
  values: LiveCommissionSettings,
) {
  await fetch(`${env.backendApiUrl}/admin/settings/commissions`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

// This module mutates the platform's real, global commission rates (used to
// price every new contract) - so every test below either only exercises
// client-side validation (never reaching the network) or mocks the network
// response, EXCEPT the one real round-trip test at the end, which reads the
// live rates first and restores them in a `finally` block no matter what.
test.describe.serial("Commission settings page", () => {
  test("renders the two editable rates, with no input anywhere for the third (subcontractor) rate", async ({
    page,
  }) => {
    const settings = new CommissionSettingsPage(page);
    await settings.goto();
    // Reading localStorage requires having already navigated to the app's
    // own origin at least once (a blank/cross-origin document throws).
    const live = await fetchLiveCommissionSettings(page);

    // The <InputNumber step={0.1}> always formats its display value with one
    // decimal place, even for whole numbers (e.g. "20.0", not "20").
    await expect(settings.mainRateInput()).toHaveValue(live.main_commission_rate.toFixed(1));
    await expect(settings.offeringRateInput()).toHaveValue(
      live.offering_provider_commission_rate.toFixed(1),
    );

    // known issue: the model/API carry a `subcontractor_commission_rate`
    // field (see commissionSettingsModel.ts), but commissionSettings.tsx
    // never renders a Form.Item for it - handleSubmit always re-sends
    // `settings?.subcontractor_commission_rate` untouched. Only 2 labeled
    // Form.Items exist on the whole page.
    await expect(page.locator(".ant-form-item-label")).toHaveCount(2);
  });

  test("requires both rate fields", async ({ page }) => {
    const settings = new CommissionSettingsPage(page);
    await settings.goto();

    await settings.mainRateInput().fill("");
    await settings.offeringRateInput().fill("");
    await settings.save();

    await expect(settings.fieldError("يرجى إدخال نسبة العمولة")).toHaveCount(2);
  });

  test("rate inputs clamp out-of-range values instead of showing an error", async ({ page }) => {
    const settings = new CommissionSettingsPage(page);
    await settings.goto();

    await settings.mainRateInput().fill("150");
    await settings.mainRateInput().blur();
    await expect(settings.mainRateInput()).toHaveValue("100.0");

    await settings.mainRateInput().fill("-20");
    await settings.mainRateInput().blur();
    await expect(settings.mainRateInput()).toHaveValue("0.0");

    await settings.offeringRateInput().fill("150");
    await settings.offeringRateInput().blur();
    await expect(settings.offeringRateInput()).toHaveValue("100.0");
  });

  test("a failed update surfaces the server's error as a global toast (mocked)", async ({
    page,
  }) => {
    const settings = new CommissionSettingsPage(page);
    await settings.goto();

    await page.route("**/admin/settings/commissions", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          message: "قيمة النسبة غير صالحة",
          status: false,
          code: 422,
          errors: ["قيمة النسبة غير صالحة"],
        }),
      });
    });

    await settings.fillMainRate(50);
    await settings.save();
    await expect(page.getByText("قيمة النسبة غير صالحة")).toBeVisible();
  });

  test("a successful update sends both editable rates plus the untouched subcontractor rate (mocked)", async ({
    page,
  }) => {
    const settings = new CommissionSettingsPage(page);
    await settings.goto();
    const live = await fetchLiveCommissionSettings(page);

    let capturedBody: unknown;
    await page.route("**/admin/settings/commissions", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { ...live, main_commission_rate: 33 },
          message: "تم التعديل بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await settings.fillMainRate(33);
    await settings.save();

    expect(capturedBody).toEqual({
      main_commission_rate: 33,
      offering_provider_commission_rate: live.offering_provider_commission_rate,
      subcontractor_commission_rate: live.subcontractor_commission_rate,
    });
    await expect(page.getByText("تم التعديل بنجاح")).toBeVisible();
  });

  test("the logs table renders the current rate row in green and past rows in grey (mocked)", async ({
    page,
  }) => {
    // commissionSettingsConfig.tsx's status column special-cases `is_current`
    // to the literal string "active" (not the resource's own `status:
    // "current"` value) before calling getStatusTag() - so the current row
    // borrows ServiceStatusEnum.active's green (#52c41a), while a past row's
    // real `status: "previous"` matches no entry in that enum and falls back
    // to the default grey (#8c8c8c).
    await page.route("**/admin/settings/commissions/logs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 2,
              date_formatted: "2026-09-04 | 12:00",
              main_commission_rate: "33%",
              offering_provider_commission_rate: "10%",
              subcontractor_commission_rate: "10%",
              performed_by: "مدير النظام",
              status: "current",
              status_label: "الحالية",
              is_current: true,
            },
            {
              id: 1,
              date_formatted: "2026-09-03 | 12:00",
              main_commission_rate: "20%",
              offering_provider_commission_rate: "10%",
              subcontractor_commission_rate: "10%",
              performed_by: "مدير النظام",
              status: "previous",
              status_label: "سابق",
              is_current: false,
            },
          ],
          message: "تم بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    const settings = new CommissionSettingsPage(page);
    await settings.goto();
    await settings.logsList.waitForLoaded();

    expect(await settings.logsList.rowCount()).toBe(2);
    const currentTag = settings.logsList.rowByText("الحالية").locator(".ant-tag");
    const previousTag = settings.logsList.rowByText("سابق").locator(".ant-tag");
    await expect(currentTag).toHaveText("الحالية");
    await expect(previousTag).toHaveText("سابق");

    const currentStyle = await currentTag.getAttribute("style");
    const previousStyle = await previousTag.getAttribute("style");
    expect(currentStyle).toContain("82, 196, 26"); // #52c41a (ServiceStatusEnum.active's green)
    expect(previousStyle).toContain("140, 140, 140"); // #8c8c8c fallback
  });

  test("logs table shows an empty state when there are no rate-change updates yet (real data)", async ({
    page,
  }) => {
    // The seeder never touches commission settings, so on a freshly-reseeded
    // backend this list is empty. But commission-rate logs are a permanent
    // audit trail (there is no "restore to empty" once a real PUT has ever
    // been sent, by this suite or any prior run against this same
    // long-lived container) - so this only holds the first time the suite
    // runs against a given backend. Skip rather than false-fail once that's
    // no longer true.
    const settings = new CommissionSettingsPage(page);
    await settings.goto();
    const live = await fetchLiveCommissionLogs(page);
    test.skip(
      live.length > 0,
      "commission logs already have real entries from a previous run against this backend",
    );
    await expect(settings.logsList.emptyState).toBeVisible();
  });

  test("a real round-trip update changes the live rates and appends a log row, then restores the original values", async ({
    page,
  }) => {
    // Two real network round trips against the live, shared commission
    // rates - give it headroom under a fully-parallel full-suite run so a
    // slow run can't hit the global 30s timeout mid-mutation and get torn
    // down before the `finally` restore below runs.
    test.setTimeout(60_000);

    const settings = new CommissionSettingsPage(page);
    await settings.goto();
    const original = await fetchLiveCommissionSettings(page);
    // Captured now (while the page is definitely still alive) so the
    // `finally` restore below can use plain `fetch` instead of `page.request`.
    const headers = await authHeaders(page);

    // Pick values guaranteed to differ from the live ones, while staying in [0, 100].
    const newMain = original.main_commission_rate === 42 ? 43 : 42;
    const newOffering = original.offering_provider_commission_rate === 17 ? 18 : 17;

    try {
      await settings.fillMainRate(newMain);
      await settings.fillOfferingRate(newOffering);
      await settings.save();

      // known issue: the success toast for this bulk-update PUT reuses the
      // generic __('api.updated_successfully') string, but the *questions*
      // module's equivalent bulk update (see consultation spec) instead
      // reuses __('api.created_successfully') for what is also an update -
      // inconsistent wording for the same "create or update" shape of action.
      await expect(page.getByText("تم التعديل بنجاح")).toBeVisible();

      await expect(settings.mainRateInput()).toHaveValue(newMain.toFixed(1));
      await expect(settings.offeringRateInput()).toHaveValue(newOffering.toFixed(1));

      // A new "current" log row should now reflect the new rates.
      await settings.logsList.waitForLoaded();
      const currentRow = settings.logsList.rowByText("الحالية");
      await expect(currentRow).toContainText(`${newMain}%`);
      await expect(currentRow).toContainText(`${newOffering}%`);

      const liveAfterChange = await fetchLiveCommissionSettings(page);
      expect(liveAfterChange.main_commission_rate).toBe(newMain);
      expect(liveAfterChange.offering_provider_commission_rate).toBe(newOffering);
      // The untouched third rate must survive the round trip unchanged.
      expect(liveAfterChange.subcontractor_commission_rate).toBe(
        original.subcontractor_commission_rate,
      );

      // Restore via the real UI, exactly like a real admin undoing their change.
      await settings.fillMainRate(original.main_commission_rate);
      await settings.fillOfferingRate(original.offering_provider_commission_rate);
      await settings.save();
      await expect(page.getByText("تم التعديل بنجاح")).toBeVisible();
    } finally {
      // Always restore the platform's real commission rates to exactly what
      // they were before this test ran, even if an assertion above threw
      // partway through - this setting affects pricing for the whole
      // platform's new contracts, not a disposable per-test fixture row. Uses
      // plain `fetch` (not `page.request`) so it still runs even if the page
      // itself got torn down by a test-level timeout.
      await putLiveCommissionSettingsResilient(headers, original);
    }

    const liveAfterRestore = await fetchLiveCommissionSettings(page);
    expect(liveAfterRestore).toEqual(original);
  });
});
