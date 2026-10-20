import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";
import { env } from "../fixtures/env";

const authFile = path.resolve(import.meta.dirname, "../.auth/admin.json");

setup("authenticate as the e2e admin", async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(env.adminEmail, env.adminPassword);

  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.locator(".ant-layout-sider")).toBeVisible();

  await page.context().storageState({ path: authFile });
});
