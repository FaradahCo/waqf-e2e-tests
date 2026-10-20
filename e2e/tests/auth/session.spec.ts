import { expect, test } from "@playwright/test";
import { AppLayout, SIDEBAR_LABELS } from "../../pages/AppLayout";
import { env } from "../../fixtures/env";
import { LoginPage } from "../../pages/LoginPage";

// Inherits the project's default (already-authenticated) storageState.

test("an authenticated visit to the login screen redirects straight to the dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin\/?$/);
});

test("a 401 from any API call forces logout with a session-expired message", async ({
  page,
}) => {
  await page.goto("/admin");
  const layout = new AppLayout(page);

  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unauthenticated." }),
    }),
  );

  await layout.navigateTo(SIDEBAR_LABELS.alwaqf);

  await expect(
    page.getByText("لقد انتهت صلاحيه الجلسة. يرجى تسجيل الدخول مرة أخرى"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
  expect(token).toBeNull();
});

// Logout now calls POST /auth/logout, and the backend revokes *every* token
// of that user - so these tests log in as a dedicated second admin, never the
// shared e2e admin, or every other parallel test starts getting 401s.
test.describe("logout (own session)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(env.logoutAdminEmail, env.adminPassword);
    await expect(page).toHaveURL(/\/admin\/?$/);
  });

  test("logging out clears local storage and returns to the login screen", async ({ page }) => {
    const tokenBeforeLogout = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
    expect(tokenBeforeLogout).toBeTruthy();

    await new AppLayout(page).logout();

    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => localStorage.getItem("ADMIN_token"))).toBeNull();
  });

  test("logout still ends the local session when POST /auth/logout fails", async ({ page }) => {
    // mainHeader.tsx only clears storage in the mutation's onSuccess - a
    // 5xx/network error leaves the admin stuck logged in.
    await page.route("**/auth/logout", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Server Error", status: false, code: 500 }),
      }),
    );
    await new AppLayout(page).logout();
    await expect(page).toHaveURL(/\/$/, { timeout: 5_000 });
    expect(await page.evaluate(() => localStorage.getItem("ADMIN_token"))).toBeNull();
  });

  test("logout calls POST /auth/logout and the old token is revoked server-side", async ({
    page,
    request,
  }) => {
    const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
    expect(token).toBeTruthy();

    const logoutCall = page.waitForRequest(
      (req) => req.url().includes("/auth/logout") && req.method() === "POST",
    );
    await new AppLayout(page).logout();
    await logoutCall;
    await expect(page).toHaveURL(/\/$/);

    const response = await request.get(`${env.backendApiUrl}/admin/clients`, {
      headers: { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey },
    });
    expect(response.status(), "token from before logout must be rejected").toBe(401);
  });
});
