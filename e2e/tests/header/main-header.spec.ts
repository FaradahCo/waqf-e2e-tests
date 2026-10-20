import { expect, test } from "@playwright/test";
import { AppLayout } from "../../pages/AppLayout";

// Covers mainHeader.tsx (rendered on every /admin/* page) - the sidebar
// collapse toggle, the profile <Dropdown>'s 3 menu items (logout itself is
// already thoroughly covered by auth/session.spec.ts, so it's untouched
// here), and the cart/notification/message icons. Inherits the project's
// default (already-authenticated) storageState.

test.describe("Sidebar collapse toggle", () => {
  test("collapses and expands the sidebar", async ({ page }) => {
    await page.goto("/admin");
    const layout = new AppLayout(page);
    await expect(layout.sider).toBeVisible();

    expect(await layout.isSidebarCollapsed()).toBe(false);
    const expandedBox = await layout.sider.boundingBox();

    await layout.toggleSidebar();
    await expect(layout.sider).toHaveClass(/ant-layout-sider-collapsed/);
    const collapsedBox = await layout.sider.boundingBox();
    expect(collapsedBox?.width).toBeLessThan(expandedBox?.width ?? Infinity);

    // The sidebar's own nav items still work (App shell isn't torn down).
    await expect(layout.sider).toBeVisible();

    await layout.toggleSidebar();
    expect(await layout.isSidebarCollapsed()).toBe(false);
    const reExpandedBox = await layout.sider.boundingBox();
    expect(reExpandedBox?.width).toBe(expandedBox?.width);
  });
});

test.describe("Profile dropdown", () => {
  test("shows the logged-in admin's name next to the avatar", async ({ page }) => {
    await page.goto("/admin");
    const layout = new AppLayout(page);
    // Just asserts *some* non-empty name renders - the actual seeded admin
    // display name isn't part of testData's natural keys (only the email is).
    await expect(layout.header.locator(".ant-avatar")).toBeVisible();
    await layout.expectLoggedInAs(/.+/);
  });

  test("known issue: 'الملف الشخصي' doesn't open any profile/account page - it just links back to the dashboard home, wherever you already are", async ({
    page,
  }) => {
    // mainHeader.tsx's first menu item is `<Link to={pagesRoutePath.HOME}>`,
    // i.e. "/admin" - the exact same route the sidebar's "الرئيسية" item
    // points to. There's no dedicated admin-profile/account screen; despite
    // the "الملف الشخصي" ("My Profile") label, clicking it from a *different*
    // admin page just navigates back to the dashboard.
    await page.goto("/admin/wallet");
    const layout = new AppLayout(page);
    await layout.openProfileMenu();
    await layout.profileMenuItem("الملف الشخصي").click();

    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByRole("heading", { name: "الرئيسية", exact: true })).toBeVisible();
  });

  test("known issue: 'الإعدادات' links to a literal '/profile' path that isn't registered anywhere, so it 404s and drops the entire admin shell", async ({
    page,
  }) => {
    // mainHeader.tsx's second menu item is `<Link to="/profile">` - a
    // hardcoded string, not a route constant. Grepping the app's route
    // definitions (main.routes.tsx, pages.routes.tsx, every *.routes.tsx)
    // turns up no top-level "/profile" route - main.routes.tsx's final
    // `{ path: "*", element: <NotFound/> }` catches it instead, which lives
    // *outside* the ProtectedRoute/MainLayout tree, so the sidebar/header
    // disappear too.
    await page.goto("/admin");
    const layout = new AppLayout(page);
    await layout.openProfileMenu();
    await layout.profileMenuItem("الإعدادات").click();

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText("404 - Page Not Found")).toBeVisible();
    await expect(page.locator(".ant-layout-sider")).toHaveCount(0);
    await expect(page.locator(".ant-layout-header")).toHaveCount(0);
  });
});

test.describe("Header icons (cart/notifications/messages)", () => {
  test("the decorative cart/notification/message icons were removed from the header", async ({
    page,
  }) => {
    // Removed in admin-frontend a837bc9 ("remove three icons").
    await page.goto("/admin");
    for (const src of ["cart.svg", "notifications.svg", "envolove.svg"]) {
      await expect(page.locator(`header img[src*="${src}"], .ant-layout-header img[src*="${src}"]`)).toHaveCount(0);
    }
  });
});
