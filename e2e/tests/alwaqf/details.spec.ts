import { expect, test } from "@playwright/test";
import { AlwaqfListPage } from "../../pages/AlwaqfListPage";
import { AlwaqfDetailsPage } from "../../pages/AlwaqfDetailsPage";
import { testData } from "../../fixtures/testData";

/** Search the list for a seeded client by name and click through to their profile. */
/** The <p> value rendered under a profile-tab LabelContent's exact <label> text. */
function profileField(page: import("@playwright/test").Page, label: string) {
  return page
    .locator("label", { hasText: label })
    .locator("xpath=..")
    .locator("p");
}

async function openClient(page: import("@playwright/test").Page, name: string) {
  const alwaqf = new AlwaqfListPage(page);
  await alwaqf.goto();
  await alwaqf.list.searchByInput("اسم المستخدم أو المنظمة", name);
  await alwaqf.list.rowByText(name).click();
  await expect(page).toHaveURL(/\/admin\/alwaqf-list\/\d+\/profile$/);
  const id = Number(page.url().match(/alwaqf-list\/(\d+)\/profile/)?.[1]);
  return id;
}

test.describe("Alwaqf client details - profile & header", () => {
  test("shows the client's basic info and organization address on the profile tab", async ({
    page,
  }) => {
    await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);

    await expect(details.waqfNameHeading).toHaveText(
      testData.clients.active.waqfName,
    );

    await expect(page.getByText(testData.clients.active.name, { exact: true })).toBeVisible();
    await expect(
      page.getByText(testData.clients.active.email, { exact: true }),
    ).toBeVisible();
    // Phone is generated per-fixture-run - just assert it isn't the "-" placeholder.
    const phoneField = profileField(page, "رقم الجوال");
    await expect(phoneField).toBeVisible();
    await expect(phoneField).not.toHaveText("-");

    // Address fields are seeded as null - "الرقم الضريبي" (VAT number) falls
    // back to its "-" placeholder.
    await expect(profileField(page, "الرقم الضريبي")).toHaveText("-");
  });

  test("known issue: the 'المدينة' (city) field actually renders the country region code, not a city", async ({
    page,
  }) => {
    // profile.tsx reads `clientData?.region` (a country-region code like "sa")
    // under the "المدينة" label, instead of `clientData?.profile?.city` (the
    // field that actually models a city and exists on the Client type).
    await openClient(page, testData.clients.active.name);

    await expect(profileField(page, "المدينة")).toHaveText("sa");
  });

  test("the status <Select> in the header reflects the client's real status", async ({
    page,
  }) => {
    await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);
    await expect(details.currentStatusText()).toHaveText("نشط");
  });

  test("tab navigation preserves the client id in the URL", async ({ page }) => {
    const id = await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);

    const tabRoutes: [Parameters<typeof details.gotoTab>[0], string][] = [
      ["requests", "requests"],
      ["consultation", "consultation"],
      ["wallet", "wallet"],
      ["invoices", "invoices"],
      ["reviews", "reviews"],
      ["profile", "profile"],
    ];

    for (const [tabKey, path] of tabRoutes) {
      await details.gotoTab(tabKey);
      await expect(page).toHaveURL(
        new RegExp(`/admin/alwaqf-list/${id}/${path}$`),
      );
    }
  });
});

test.describe("Alwaqf client details - requests & consultation tabs", () => {
  test("requests tab lists that client's service requests", async ({ page }) => {
    await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("requests");

    expect(await details.list.rowCount()).toBe(2);
    await expect(details.list.table.locator(".ant-tag").first()).toBeVisible();
  });

  test("consultation tab lists that client's consultations", async ({ page }) => {
    await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("consultation");

    expect(await details.list.rowCount()).toBe(2);
  });

  test("a client with only one request shows exactly one row on the requests tab", async ({
    page,
  }) => {
    await openClient(page, testData.clients.stopped.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("requests");

    expect(await details.list.rowCount()).toBe(1);
  });
});

test.describe("Alwaqf client details - wallet tab", () => {
  test("shows the wallet balances and that client's payment history", async ({
    page,
  }) => {
    await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("wallet");

    await expect(page.getByText("إجمالي المدفوعات")).toBeVisible();
    expect(await details.list.rowCount()).toBe(2);
    // Known issue: the card relabeled "الرصيد المعلق" (pending balance) in
    // PR #77 still renders wallet.available_balance (200), not
    // pending_balance (50).
    const pendingCard = page.locator("div.flex.flex-col", { has: page.locator("h2", { hasText: "الرصيد المعلق" }) });
    await expect(pendingCard.locator("p")).toHaveText(/^\s*50(\.0+)?\s*$/);
  });

  test("a client with a zero balance still renders the wallet tab without error", async ({
    page,
  }) => {
    await openClient(page, testData.clients.stopped.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("wallet");

    await expect(page.getByText("الرصيد المعلق")).toBeVisible();
    expect(await details.list.rowCount()).toBe(1);
  });
});

test.describe("Alwaqf client details - invoices tab", () => {
  test("a client with an invoice shows it in the invoices tab", async ({ page }) => {
    await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("invoices");

    expect(await details.list.rowCount()).toBe(1);
    await expect(details.list.table).toContainText("E2E-INV-");
    // The seeded invoice's odoo_url is null, so the download icon column
    // always renders its "-" fallback rather than a link, for every client.
    await expect(details.list.rows.first()).toContainText("-");
  });

  test("a client with no invoices shows the empty state", async ({ page }) => {
    await openClient(page, testData.clients.inactive.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("invoices");

    await expect(details.list.emptyState).toBeVisible();
  });

  test("invoices can be filtered by code", async ({ page }) => {
    await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("invoices");
    await details.list.waitForLoaded();

    await details.list.searchByInput("الفاتورة", "no-such-invoice-code");
    await expect(details.list.emptyState).toBeVisible();
  });
});

test.describe("Alwaqf client details - reviews tab", () => {
  test("known issue: the reviews tab is a static placeholder - it never fetches or renders real review data", async ({
    page,
  }) => {
    // reviews.tsx has no useApiQuery call at all; it unconditionally renders
    // the "no reviews" illustration regardless of the client. The backend
    // mirrors this: ClientService::reviews() always returns an empty
    // Collection(), so there is no real review data to show even if the
    // frontend were wired up.
    const requestsToReviewsEndpoint: string[] = [];
    page.on("request", (req) => {
      if (/\/clients\/\d+\/reviews/.test(req.url())) {
        requestsToReviewsEndpoint.push(req.url());
      }
    });

    await openClient(page, testData.clients.active.name);
    const details = new AlwaqfDetailsPage(page);
    await details.gotoTab("reviews");

    await expect(page.getByAltText("لا توجد تقييمات")).toBeVisible();
    expect(requestsToReviewsEndpoint).toHaveLength(0);
  });
});

test.describe("Alwaqf client details - inline status change (mocked)", () => {
  // The header's status <Select> mutates immediately on change (no confirm
  // step) via PATCH /admin/clients/{id}/update, and useApiMutation() is
  // called with no onSuccess/onError - so we mock the network call rather
  // than mutate a shared seeded client's real status.

  test("changing the status sends the new value and shows the server's success toast", async ({
    page,
  }) => {
    const id = await openClient(page, testData.clients.stopped.name);
    const details = new AlwaqfDetailsPage(page);

    let capturedBody: unknown;
    await page.route(`**/admin/clients/${id}/update`, async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {},
          message: "تم تحديث حالة العميل بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await details.setStatus("نشط");

    expect(capturedBody).toEqual({ status: "active" });
    await expect(page.getByText("تم تحديث حالة العميل بنجاح")).toBeVisible();
    await expect(details.currentStatusText()).toHaveText("نشط");
  });

  test("a failed status update surfaces the server's error as a global toast", async ({
    page,
  }) => {
    // No onError -> setFormFieldErrors is wired up for this mutation (there
    // is no form at all), so any backend error message surfaces as the
    // generic global toast, per the axios response interceptor.
    const id = await openClient(page, testData.clients.stopped.name);
    const details = new AlwaqfDetailsPage(page);

    await page.route(`**/admin/clients/${id}/update`, async (route) => {
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

    await details.setStatus("نشط");

    await expect(page.getByText("قيمة الحالة غير صالحة")).toBeVisible();
  });
});

test.describe("Alwaqf client details - edge cases", () => {
  test("known issue: navigating to a non-existent client id fails silently with a blank dashboard/header instead of a not-found message", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    // GET /admin/clients/999999 and /admin/clients/999999/dashboard both
    // return HTTP 500 from the backend (ClientService::getUser() returns
    // null via BaseRepository::firstBy(), and the caller dereferences it
    // without a null check). The axios response interceptor's 500 branch is
    // a no-op (no toast), so the SPA just renders the layout with empty
    // stats/header instead of surfacing any error or redirecting away.
    // Unlike most other queries in this codebase, these two don't pass
    // `retry: false`, so react-query's default 3 retries (with exponential
    // backoff) run first - the loading spinner sits for ~10s before the page
    // finally settles into its broken empty state.
    const details = new AlwaqfDetailsPage(page);
    await details.goto(999999, "profile");

    await expect(page).toHaveURL(/\/admin\/alwaqf-list\/999999\/profile$/);
    // No crash: the tab bar and page shell still render.
    await expect(details.tabsNav).toBeVisible({ timeout: 20_000 });
    // The header itself always renders (AlwaqfHeader falls back to a
    // placeholder image), but with nothing real to show: an empty name
    // heading and a status <Select> with no selection at all - and no error
    // is ever surfaced to the admin.
    await expect(details.waqfNameHeading).toHaveText("");
    await expect(details.currentStatusText()).toHaveCount(0);
    await expect(page.locator(".ant-message-error")).toHaveCount(0);
  });

  test("known issue: a non-numeric client id behaves the same way - no route-level guard rejects it", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const details = new AlwaqfDetailsPage(page);
    await details.goto("not-a-number", "profile");

    await expect(page).toHaveURL(/\/admin\/alwaqf-list\/not-a-number\/profile$/);
    await expect(details.tabsNav).toBeVisible({ timeout: 20_000 });
    await expect(details.waqfNameHeading).toHaveText("");
    await expect(details.currentStatusText()).toHaveCount(0);
  });
});
