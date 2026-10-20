import type { Locator, Page } from "@playwright/test";

/**
 * Sidebar route paths, mirrored from mainLayout.tsx's menuItems so tests
 * don't hardcode strings that would drift if routes.tsx changes.
 */
export const SIDEBAR_LABELS = {
  home: "الرئيسية",
  serviceManagement: "إدارة الخدمات",
  followRequests: "متابعه الطلبات",
  serviceProviders: "مزودي الخدمات",
  alwaqf: "الإوقاف",
  wallet: "إدارة المحفظة",
  payments: "المعاملات المالية",
  balances: "الأرصدة",
  discountCodes: "أكواد الخصم",
  consultation: "الاستشارة",
  consultantsManagement: "إدارة المستشارين",
  staticPages: "الصفحات الثابتة",
  commissionSettings: "الاعدادات",
} as const;

/** The persistent shell (sidebar + header) rendered by mainLayout.tsx for every /admin/* page. */
export class AppLayout {
  readonly page: Page;
  readonly sider: Locator;
  readonly header: Locator;
  readonly profileDropdownTrigger: Locator;
  readonly collapseToggle: Locator;
  /** mainHeader.tsx's 3 purely-decorative <img> icons - no onClick/href at all. */
  readonly cartIcon: Locator;
  readonly notificationIcon: Locator;
  readonly messageIcon: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sider = page.locator(".ant-layout-sider");
    this.header = page.locator(".ant-layout-header");
    this.profileDropdownTrigger = this.header.locator(".ant-avatar").locator("..");
    this.collapseToggle = this.header.getByRole("button").first();
    this.cartIcon = this.header.getByAltText("Cart");
    this.notificationIcon = this.header.getByAltText("Notifications");
    this.messageIcon = this.header.getByAltText("Messages");
  }

  navItem(label: string): Locator {
    return this.sider.locator(".ant-menu-item", { hasText: label });
  }

  async navigateTo(label: string) {
    await this.navItem(label).click();
  }

  async openProfileMenu() {
    await this.profileDropdownTrigger.click();
  }

  async logout() {
    await this.openProfileMenu();
    await this.page.getByText("تسجيل الخروج").click();
  }

  async toggleSidebar() {
    await this.collapseToggle.click();
  }

  async expectLoggedInAs(name: string | RegExp) {
    await this.header.getByText(name).waitFor();
  }

  /** antd <Sider collapsible> toggles this class (and shrinks to
   * `collapsedWidth`, see mainLayout.tsx) whenever `collapsed` flips. */
  async isSidebarCollapsed(): Promise<boolean> {
    const classes = (await this.sider.getAttribute("class")) ?? "";
    return classes.includes("ant-layout-sider-collapsed");
  }

  /** mainHeader.tsx's profile <Dropdown> menu item, by its exact label text
   * ("الملف الشخصي" / "الإعدادات" / "تسجيل الخروج" - use `logout()` for the
   * latter, which is already wired through this class). */
  profileMenuItem(label: string): Locator {
    return this.page.locator(".ant-dropdown-menu-item", { hasText: label });
  }
}
