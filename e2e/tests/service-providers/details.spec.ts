import { expect, test, type Page } from "@playwright/test";
import { ServiceProviderListPage } from "../../pages/ServiceProviderListPage";
import { ServiceProviderDetailsPage } from "../../pages/ServiceProviderDetailsPage";
import { ConfirmDialog } from "../../pages/ConfirmDialog";
import { testData } from "../../fixtures/testData";

/** The <p> value rendered under a profile-section LabelContent's exact <label> text. */
function labelField(page: Page, label: string) {
  return page.locator("label", { hasText: label }).locator("xpath=..").locator("p");
}

/**
 * Clicks a provider's row via the list (mirroring the real UI flow) and
 * returns its numeric team id, regardless of whether the click landed on the
 * tabbed /admin/service-providers/:id/profile layout (non-review statuses)
 * or the standalone /admin/reviews/:id review page (review status - see
 * routing.spec.ts's "known issue" test for why those two differ). Both pages
 * render the exact same ActionHeader component.
 */
async function clickProviderAndGetId(page: Page, name: string): Promise<number> {
  const providers = new ServiceProviderListPage(page);
  await providers.goto();
  // Note: the "مزود الخدمة" search filter is wired to team.user.name (the
  // owner's name, e.g. "E2E Provider One Owner"), not business_name - so it
  // can't be used to search by the team/business name shown in the row.
  // Only 4 seeded providers exist, so just click the row directly.
  await providers.clickProvider(name);
  await page.waitForURL(/\/admin\/(service-providers\/\d+\/profile|reviews\/\d+)$/);
  return Number(page.url().match(/\/(\d+)(?:\/profile)?$/)?.[1]);
}

/** Same as clickProviderAndGetId, but asserts the click landed on the tabbed
 * details layout (i.e. `name` is a non-review-status provider). */
async function openProvider(page: Page, name: string) {
  const id = await clickProviderAndGetId(page, name);
  await expect(page).toHaveURL(/\/admin\/service-providers\/\d+\/profile$/);
  return id;
}

test.describe("Service provider details - profile & header", () => {
  test("shows the provider's basic info in the profile tab", async ({ page }) => {
    await openProvider(page, testData.providers.active.teamName);

    await expect(
      page.getByText(testData.providers.active.ownerEmail, { exact: true }),
    ).toBeVisible();
    const phoneField = labelField(page, "رقم الجوال");
    await expect(phoneField).toBeVisible();
    await expect(phoneField).not.toHaveText("-");

    await expect(
      labelField(page, "اسم الشركة أو الكيان بالعربية"),
    ).toHaveText(testData.providers.active.teamName);
  });

  test("the header shows a status tag (not accept/reject buttons) for a non-review provider", async ({
    page,
  }) => {
    const details = new ServiceProviderDetailsPage(page);
    await openProvider(page, testData.providers.active.teamName);

    await expect(details.statusTag).toHaveText("نشط");
    await expect(details.acceptButton).toHaveCount(0);
    await expect(details.rejectButton).toHaveCount(0);
  });

  test("tab navigation preserves the provider id in the URL across all 7 tabs", async ({
    page,
  }) => {
    const id = await openProvider(page, testData.providers.active.teamName);
    const details = new ServiceProviderDetailsPage(page);

    const tabRoutes: [Parameters<typeof details.gotoTab>[0], string][] = [
      ["services", "services"],
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
        new RegExp(`/admin/service-providers/${id}/${path}$`),
      );
    }
  });
});

test.describe("Service provider details - services tab", () => {
  test("the data-rich (active) provider shows all of its seeded services", async ({
    page,
  }) => {
    await openProvider(page, testData.providers.active.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.gotoTab("services");

    expect(await details.list.rowCount()).toBe(
      testData.providers.active.servicesCount,
    );
    await expect(details.list.table.locator(".ant-tag").first()).toBeVisible();
  });

  test("a data-poor provider only shows its non-removed seeded services", async ({
    page,
  }) => {
    // "incomplete" is seeded with 2 services (rejected, removed), but
    // ProviderService::services() -> ServiceService's default "visible"
    // scope excludes status=removed - so only 1 of the 2 is ever shown.
    await openProvider(page, testData.providers.incomplete.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.gotoTab("services");

    expect(await details.list.rowCount()).toBe(
      testData.providers.incomplete.servicesCount,
    );
  });
});

test.describe("Service provider details - requests & consultation tabs", () => {
  test("the active provider's requests tab lists all 9 seeded service requests", async ({
    page,
  }) => {
    await openProvider(page, testData.providers.active.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.gotoTab("requests");

    expect(await details.list.rowCount()).toBe(
      testData.providers.active.serviceRequestsCount,
    );
  });

  test("the active provider's consultation tab lists all 7 seeded consultations", async ({
    page,
  }) => {
    await openProvider(page, testData.providers.active.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.gotoTab("consultation");

    expect(await details.list.rowCount()).toBe(
      testData.providers.active.consultationsCount,
    );
  });

  test("every seeded service request/consultation belongs only to the active provider, so the other 3 providers' tabs are empty", async ({
    page,
  }) => {
    for (const provider of [
      testData.providers.pending,
      testData.providers.suspended,
      testData.providers.incomplete,
    ]) {
      // "pending" is status=review, so clicking its row from the list lands
      // on /admin/reviews/:id (no tabs) rather than the tabbed layout - grab
      // its id and navigate the tabbed routes directly, since they're valid
      // regardless of how (or whether) the list links to them.
      const id = await clickProviderAndGetId(page, provider.teamName);
      const details = new ServiceProviderDetailsPage(page);

      await details.goto(id, "requests");
      await expect(details.list.emptyState).toBeVisible();

      await details.gotoTab("consultation");
      await expect(details.list.emptyState).toBeVisible();
    }
  });
});

test.describe("Service provider details - wallet tab", () => {
  test("shows the wallet balances and that provider's withdrawal history", async ({
    page,
  }) => {
    await openProvider(page, testData.providers.active.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.gotoTab("wallet");

    await expect(page.getByText("الرصيد الإجمالي")).toBeVisible();
    expect(await details.list.rowCount()).toBe(
      testData.providers.active.withdrawalsCount,
    );
  });

  test("every seeded provider has a real (non-zero) wallet, but only the active provider has withdrawals", async ({
    page,
  }) => {
    await openProvider(page, testData.providers.suspended.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.gotoTab("wallet");

    await expect(page.getByText("الرصيد المتاح")).toBeVisible();
    await expect(details.list.emptyState).toBeVisible();
  });
});

test.describe("Service provider details - invoices tab", () => {
  test("the active provider's invoice shows up in the invoices tab", async ({
    page,
  }) => {
    await openProvider(page, testData.providers.active.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.gotoTab("invoices");

    expect(await details.list.rowCount()).toBe(
      testData.providers.active.invoicesCount,
    );
    await expect(details.list.table).toContainText("E2E-INV-");
  });

  test("a provider with no invoices shows the empty state", async ({ page }) => {
    // "pending" is review-status, so reach the tabbed layout directly (see
    // the comment in the requests/consultation test above).
    const id = await clickProviderAndGetId(page, testData.providers.pending.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.goto(id, "invoices");

    await expect(details.list.emptyState).toBeVisible();
  });
});

test.describe("Service provider details - reviews tab", () => {
  test("known issue: the reviews tab is a static placeholder that never fetches or renders real review data, for every provider", async ({
    page,
  }) => {
    // reviews.tsx (serviceProvider module) has no useApiQuery/useState/props
    // at all - it's a hardcoded illustration regardless of provider, even
    // more starkly than alwaqf's reviews tab (which is at least a component
    // taking no props). ProviderService::reviews() also just returns an
    // empty Collection() server-side.
    const requestsToReviewsEndpoint: string[] = [];
    page.on("request", (req) => {
      if (/\/providers\/\d+\/reviews/.test(req.url())) {
        requestsToReviewsEndpoint.push(req.url());
      }
    });

    await openProvider(page, testData.providers.active.teamName);
    const details = new ServiceProviderDetailsPage(page);
    await details.gotoTab("reviews");

    await expect(page.getByAltText("لا توجد تقييمات")).toBeVisible();
    expect(requestsToReviewsEndpoint).toHaveLength(0);
  });
});

test.describe("Service provider details - status change actions (mocked)", () => {
  test("accepting a review-status provider sends {status:'active'} and shows the server's success toast", async ({
    page,
  }) => {
    const id = await clickProviderAndGetId(page, testData.providers.pending.teamName);
    const details = new ServiceProviderDetailsPage(page);
    // The pending fixture is status=review, so the click above landed on
    // /admin/reviews/:id (see routing.spec.ts) - which renders the exact same
    // ActionHeader, with accept/reject buttons instead of a status tag.
    await expect(details.acceptButton).toBeVisible();

    let capturedBody: unknown;
    await page.route(`**/admin/providers/${id}/update`, async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "active", status_label: "نشط" },
          message: "تم تحديث حالة المزود بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    await details.acceptButton.click();
    const confirm = new ConfirmDialog(page);
    await confirm.confirm("قبول طلب مزوّد الخدمة", "تأكيد");

    expect(capturedBody).toEqual({ status: "active" });
    await expect(page.getByText("تم تحديث حالة المزود بنجاح")).toBeVisible();
    // onSuccess replaces the cached provider data with the mocked response,
    // so the buttons are replaced by a status tag reflecting it.
    await expect(details.statusTag).toHaveText("نشط");
    await expect(details.acceptButton).toHaveCount(0);
  });

  test("rejecting requires a reason and sends it as `note` with {status:'inactive'}", async ({
    page,
  }) => {
    const id = await clickProviderAndGetId(page, testData.providers.pending.teamName);
    const details = new ServiceProviderDetailsPage(page);

    await details.rejectButton.click();
    const confirm = new ConfirmDialog(page);
    const dialog = confirm.dialogWithTitle("رفض طلب مزوّد الخدمة");
    await expect(dialog).toContainText("يرجى توضيح سبب الرفض ليتم إخطار المزوّد به");
    // Fixed in PR #78: the modal now has a required reason <TextArea>.
    const reason = dialog.locator("textarea");
    await expect(reason).toHaveCount(1);

    let capturedBody: unknown;
    await page.route(`**/admin/providers/${id}/update`, async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "inactive", status_label: "غير نشط" },
          message: "تم تحديث حالة المزود بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    // Empty reason is blocked client-side.
    await dialog.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("يرجى إدخال سبب الرفض")).toBeVisible();
    expect(capturedBody).toBeUndefined();

    await reason.fill("E2E reject reason");
    await confirm.confirm("رفض طلب مزوّد الخدمة", "تأكيد");
    expect(capturedBody).toEqual({ status: "inactive", note: "E2E reject reason" });
  });

  test("a failed status update surfaces the server's error as a global toast and leaves the confirm modal open", async ({
    page,
  }) => {
    // No onError -> setFormFieldErrors is wired for this mutation, so the
    // backend's message surfaces as the generic global toast (per the axios
    // response interceptor's 422 branch) - and since setConfirmModalOpen(null)
    // only runs in onSuccess, the modal stays open on failure.
    const id = await clickProviderAndGetId(page, testData.providers.pending.teamName);
    const details = new ServiceProviderDetailsPage(page);

    await page.route(`**/admin/providers/${id}/update`, async (route) => {
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

    await details.acceptButton.click();
    const confirm = new ConfirmDialog(page);
    await confirm.confirm("قبول طلب مزوّد الخدمة", "تأكيد");

    await expect(page.getByText("قيمة الحالة غير صالحة")).toBeVisible();
    await expect(confirm.dialogWithTitle("قبول طلب مزوّد الخدمة")).toBeVisible();
  });
});

test.describe("Service provider details - edge cases", () => {
  test("known issue: navigating to a non-existent provider id fails silently with a blank header instead of a not-found message", async ({
    page,
  }) => {
    // Unlike the alwaqf/clients equivalent, GET /admin/providers/999999
    // properly throws a 404 ApiException (ProviderService::getProviderByTeamId
    // uses findByOrFail) instead of crashing with a 500 - and the query is
    // correctly declared with retry:false, so there's no ~10s multi-retry
    // wait. But the frontend still never checks isError, so the admin still
    // sees a silently broken/empty page rather than any error message (the
    // axios interceptor's 404 branch is also a no-op).
    const details = new ServiceProviderDetailsPage(page);
    await details.goto(999999, "profile");

    await expect(page).toHaveURL(/\/admin\/service-providers\/999999\/profile$/);
    await expect(details.tabsNav).toBeVisible({ timeout: 10_000 });
    await expect(details.businessNameHeading).toHaveText("");
    await expect(page.locator(".ant-message-error")).toHaveCount(0);
  });

  test("a non-numeric provider id does not crash the app", async ({ page }) => {
    const details = new ServiceProviderDetailsPage(page);
    await details.goto("not-a-number", "profile");

    await expect(page).toHaveURL(
      /\/admin\/service-providers\/not-a-number\/profile$/,
    );
    // Whatever the exact backend response for a non-numeric {teamId} route
    // parameter, the SPA shell must survive it without a blank/crashed page.
    await expect(page.locator(".ant-layout-sider")).toBeVisible({ timeout: 10_000 });
  });
});
