import { expect, test, type Page } from "@playwright/test";
import { FollowRequestsDetailsPage } from "../../pages/FollowRequestsDetailsPage";
import { env } from "../../fixtures/env";

/**
 * Covers what landed in admin-frontend PRs #77/#78: the "المستشار" row, the
 * deliverables-based "مخرجات الخدمة" table, the two "go to ..." shortcut
 * buttons on the الوقف/مزود الخدمة boxes, and the new Chat timeline panel.
 */
async function getServiceRequest(page: Page, status: string) {
  await page.goto("/admin/follow-requests");
  const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
  const headers = { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey };
  const list = await page.request.get(`${env.backendApiUrl}/admin/service-requests`, {
    params: { "filter[status]": status, per_page: 50 },
    headers,
  });
  expect(list.status()).toBe(200);
  const match = ((await list.json()).data.data as { id: number; status: string }[]).find(
    (r) => r.status === status,
  );
  if (!match) throw new Error(`No seeded service request found in status "${status}"`);
  const show = await page.request.get(
    `${env.backendApiUrl}/admin/service-requests/${match.id}`,
    { headers },
  );
  expect(show.status()).toBe(200);
  return {
    token,
    headers,
    request: (await show.json()).data as {
      id: number;
      chat_id?: number | null;
      client: { id: number; name: string };
      service: { provider?: { id: number } };
    },
  };
}

test.describe("Follow request details - shortcut buttons", () => {
  test("'الانتقال إلى صفحة الطلب' opens the client's requests tab", async ({ page }) => {
    const { request } = await getServiceRequest(page, "in_progress");
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(request.id);

    await details.box("الوقف").getByRole("button", { name: "الانتقال إلى صفحة الطلب" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/alwaqf-list/${request.client.id}/requests$`));
    await expect(page.locator(".custom-table").first()).toBeVisible();
  });

  test("'الانتقال إلى المزود' opens the provider's details page", async ({ page }) => {
    const { request } = await getServiceRequest(page, "in_progress");
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(request.id);

    await details.box("مزود الخدمة").getByRole("button", { name: "الانتقال إلى المزود" }).click();
    await expect(page).toHaveURL(/\/admin\/service-providers\/\d+/);
    expect(page.url()).not.toMatch(/\/service-providers\/0(\/|$)/);
  });
});

test.describe("Follow request details - service section", () => {
  test("shows the new 'المستشار' row (assignee name or '-')", async ({ page }) => {
    const { request } = await getServiceRequest(page, "in_progress");
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(request.id);

    const row = details.serviceDetailsSection.locator("p.flex", { hasText: "المستشار" });
    await expect(row).toBeVisible();
    await expect(row.locator("span").last()).not.toHaveText("");
  });

  test("'مخرجات الخدمة' renders from deliverables (empty state when none)", async ({ page }) => {
    const { request } = await getServiceRequest(page, "in_progress");
    const details = new FollowRequestsDetailsPage(page);
    await details.goto(request.id);

    const outputs = details.serviceOutputsList();
    await expect(outputs.table).toBeVisible();
  });
});

test.describe("Follow request details - chat timeline", () => {
  test("renders the chat panel with its 4 tabs when the request has a chat", async ({ page }) => {
    const { request } = await getServiceRequest(page, "in_progress");
    test.skip(request.chat_id == null, "seeded request has no chat");

    const details = new FollowRequestsDetailsPage(page);
    const timeline = page.waitForResponse((r) =>
      r.url().includes(`/admin/chats/${request.chat_id}`) && r.request().method() === "GET",
    );
    await details.goto(request.id);
    expect((await timeline).status()).toBe(200);

    for (const label of ["المحادثة", "الصور", "المستندات", "الروابط"]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }
  });

  for (const [tab, type] of [
    ["الصور", "image"],
    ["المستندات", "document"],
    ["الروابط", "link"],
  ] as const) {
    test(`the '${tab}' filter tab loads from /admin/chats/:id/filter?type=${type}`, async ({ page }) => {
      const { request } = await getServiceRequest(page, "in_progress");
      test.skip(request.chat_id == null, "seeded request has no chat");

      const details = new FollowRequestsDetailsPage(page);
      await details.goto(request.id);

      const filterResponse = page.waitForResponse((r) =>
        r.url().includes(`/admin/chats/${request.chat_id}/filter`),
      );
      await page.getByRole("tab", { name: tab }).click();
      const res = await filterResponse;
      expect(res.status(), `GET ${res.url()}`).toBe(200);
      await expect(page.getByText("لا يوجد محتوى").or(page.locator("[class*=attach]")).first()).toBeVisible();
    });
  }

  test("a request with no chat hides the chat panel instead of crashing", async ({ page }) => {
    const { request } = await getServiceRequest(page, "pending");
    test.skip(request.chat_id != null, "pending request unexpectedly has a chat");

    const details = new FollowRequestsDetailsPage(page);
    await details.goto(request.id);
    await expect(details.statusTag).toBeVisible();
    await expect(page.getByRole("tab", { name: "المحادثة" })).toHaveCount(0);
  });
});

test.describe("Follow requests list - combined service/client search", () => {
  test("searching by the client's name returns their requests", async ({ page }) => {
    const { request } = await getServiceRequest(page, "in_progress");
    await page.goto("/admin/follow-requests");
    const search = page.waitForRequest((r) => r.url().includes("filter%5Bname%5D") || r.url().includes("filter[name]"));
    await page.locator(".ant-form-item", { hasText: "ابحث عن" }).locator("input").first().fill(request.client.name);
    await search;
    await page.waitForTimeout(500);
    await expect(page.locator(".custom-table tbody tr.ant-table-row").first()).toBeVisible();
    await expect(page.locator(".custom-table tbody tr.ant-table-row").first()).toContainText(request.client.name);
  });
});
