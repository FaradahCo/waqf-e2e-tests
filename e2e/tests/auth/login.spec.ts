import { expect, test } from "@playwright/test";
import { LoginPage } from "../../pages/LoginPage";
import { env } from "../../fixtures/env";

// This file always starts logged out, regardless of the project's default
// (authenticated) storageState, since it specifically exercises the
// unauthenticated login screen and guard redirects.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login screen", () => {
  test("shows required-field errors when submitting empty", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.submit();

    await expect(login.fieldError(/يرجى إدخال البريد الإلكتروني/)).toBeVisible();
    await expect(login.fieldError("يرجى إدخال كلمة المرور")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("rejects an identifier that is neither an email nor a phone number", async ({
    page,
  }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.fillIdentifier("not-an-email-or-phone");
    await login.fillPassword("whatever1");
    await login.submit();

    await expect(
      login.fieldError("يرجى إدخال بريد إلكتروني أو رقم جوال صحيح"),
    ).toBeVisible();
  });

  test("rejects a password shorter than 6 characters", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.fillIdentifier(env.adminEmail);
    await login.fillPassword("123");
    await login.submit();

    await expect(
      login.fieldError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
    ).toBeVisible();
  });

  test("shows a server error for a wrong password without navigating away", async ({
    page,
  }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(env.adminEmail, "definitely-wrong-pass");

    await expect(page.getByText("بيانات الدخول غير صحيحة")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("shows a server error for an identifier that does not exist", async ({
    page,
  }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login("no-such-admin@waqf.test", "somepassword123");

    await expect(page.getByText("بيانات الدخول غير صحيحة")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("logs in successfully and lands on the dashboard", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(env.adminEmail, env.adminPassword);

    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.locator(".ant-layout-sider")).toBeVisible();
  });

  test("password field masks input and can be toggled visible", async ({
    page,
  }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.fillPassword("mySecretPass1");

    await expect(login.passwordInput).toHaveAttribute("type", "password");
    const passwordField = page.locator(".ant-form-item", {
      hasText: "كلمة المرور",
    });
    await passwordField.locator(".anticon-eye, .anticon-eye-invisible").click();
    await expect(login.passwordInput).toHaveAttribute("type", "text");
  });
});

test.describe("Route guards while unauthenticated", () => {
  test("redirects away from a protected admin route back to login", async ({
    page,
  }) => {
    await page.goto("/admin/alwaqf-list");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeVisible();
  });

  test("unknown top-level route falls through to the 404 page", async ({
    page,
  }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByText("404 - Page Not Found")).toBeVisible();
  });
});
