import { expect, test } from "@playwright/test";
import { AlwaqfListPage } from "../../pages/AlwaqfListPage";
import { AlwaqfDetailsPage } from "../../pages/AlwaqfDetailsPage";
import { testData } from "../../fixtures/testData";

/**
 * PR #77 added an "استعراض الطلب" (eye) action column to the alwaqf
 * requests + consultation tabs.
 */
async function openClient(page: import("@playwright/test").Page, name: string) {
  const alwaqf = new AlwaqfListPage(page);
  await alwaqf.goto();
  await alwaqf.list.searchByInput("اسم المستخدم أو المنظمة", name);
  await alwaqf.list.rowByText(name).getByText(name).first().click();
  await expect(page).toHaveURL(/\/admin\/alwaqf-list\/\d+\/profile/);
  return new AlwaqfDetailsPage(page);
}

test.describe("Alwaqf client details - 'استعراض الطلب' actions", () => {
  test("requests tab: the eye button opens that request's follow-request details", async ({ page }) => {
    const details = await openClient(page, testData.clients.active.name);
    await details.gotoTab("requests");
    await details.list.waitForLoaded();
    const firstRow = details.list.row(0);
    const id = (await firstRow.locator("td").first().innerText()).trim();

    await firstRow.getByRole("button").last().click();
    await expect(page).toHaveURL(new RegExp(`/admin/follow-requests/${id}$`));
    await expect(page.getByText("تفاصيل الخدمة")).toBeVisible();
  });

  test("consultation tab: the eye button opens a real consultation details page", async ({ page }) => {
    const details = await openClient(page, testData.clients.active.name);
    await details.gotoTab("consultation");
    await details.list.waitForLoaded();
    expect(await details.list.rowCount()).toBeGreaterThan(0);

    await details.list.row(0).getByRole("button").last().click();
    // Must stay inside the admin app and not land on the router error page.
    await expect(page).toHaveURL(/\/admin\//);
    await expect(page.locator("text=/404|Not Found|Unexpected Application Error/i")).toHaveCount(0);
  });

  test("consultation tab shows the new 'الوقت المتبقي' column without duplicate-key warnings", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (m) => {
      if (/same key/i.test(m.text())) warnings.push(m.text());
    });
    const details = await openClient(page, testData.clients.active.name);
    await details.gotoTab("consultation");
    await details.list.waitForLoaded();
    await expect(details.list.table.getByRole("columnheader", { name: "الوقت المتبقي" })).toBeVisible();
    expect(warnings, warnings.join("\n")).toHaveLength(0);
  });
});
