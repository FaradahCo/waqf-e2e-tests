import { expect, test } from "@playwright/test";
import { StaticPagesListPage } from "../../pages/StaticPagesListPage";
import { StaticPageFormPage } from "../../pages/StaticPageFormPage";
import { ConfirmDialog } from "../../pages/ConfirmDialog";
import { testData } from "../../fixtures/testData";

test.describe("Static pages list", () => {
  test.beforeEach(async ({ page }) => {
    const list = new StaticPagesListPage(page);
    await list.goto();
  });

  test("renders the 3 seeded pages with correct title, published/draft status tags", async ({
    page,
  }) => {
    const list = new StaticPagesListPage(page);
    expect(await list.list.rowCount()).toBeGreaterThanOrEqual(3);

    const aboutRow = list.list.rowByText(testData.staticPages.about.title);
    const termsRow = list.list.rowByText(testData.staticPages.terms.title);
    const draftRow = list.list.rowByText(testData.staticPages.draft.title);

    await expect(aboutRow).toBeVisible();
    await expect(termsRow).toBeVisible();
    await expect(draftRow).toBeVisible();

    await expect(list.statusTag(aboutRow)).toHaveText("مفعلة");
    await expect(list.statusTag(termsRow)).toHaveText("مفعلة");
    await expect(list.statusTag(draftRow)).toHaveText("غير مفعلة");
  });

  test("searches by title", async ({ page }) => {
    const list = new StaticPagesListPage(page);
    await list.list.searchByInput("عنوان الصفحة", testData.staticPages.about.title);

    expect(await list.list.rowCount()).toBe(1);
    await expect(list.list.rows.first()).toContainText(testData.staticPages.about.title);
  });

  test("a search with no matches shows the empty state", async ({ page }) => {
    const list = new StaticPagesListPage(page);
    await list.list.searchByInput("عنوان الصفحة", "no-such-static-page-zzz");
    await expect(list.list.emptyState).toBeVisible();
  });

  test("the 'صفحة جديدة' button navigates to the create form", async ({ page }) => {
    const list = new StaticPagesListPage(page);
    await list.clickAdd();
    await expect(page).toHaveURL(/\/admin\/static-pages\/new-page$/);
    await expect(page.getByText("صفحة جديدة", { exact: true })).toBeVisible();
  });

  test("known issue: filtering by status always returns an empty table, silently - the frontend sends filter[status], but PageRepository only allows an exact filter[is_published], so the backend rejects the request with a 400 the interceptor never surfaces as a toast", async ({
    page,
  }) => {
    // waqfnami/app/Repositories/Common/PageRepository.php's $allowedFilters is
    // [title, slug, is_published, scope, show_in_menu, show_in_footer,
    // show_in_registration] - there is no "status" filter at all, so Spatie's
    // QueryBuilder throws InvalidFilterQuery (HTTP 400) for
    // ?filter[status]=active|inactive (confirmed directly against the API).
    // src/interceptor.ts's response interceptor only calls message.error(...)
    // for 403/422/429 - its switch has no case for 400, so it silently falls
    // through to `default: break`. The list is left showing the normal empty
    // state, indistinguishable from "genuinely zero matches", even though 3
    // pages exist and the request actually failed.
    const list = new StaticPagesListPage(page);
    expect(await list.list.rowCount()).toBeGreaterThanOrEqual(3);

    await list.list.filterBySelect("الحالة", "مفعل");
    await expect(list.list.emptyState).toBeVisible();
    await expect(page.locator(".ant-message-error")).toHaveCount(0);
  });
});

test.describe("Static pages - create form validation", () => {
  test.beforeEach(async ({ page }) => {
    const form = new StaticPageFormPage(page);
    await form.gotoNew();
  });

  test("requires title, slug (scope already defaults to 'both' so it never triggers), and content", async ({
    page,
  }) => {
    const form = new StaticPageFormPage(page);
    await form.submit();

    await expect(form.fieldError("يرجى إدخال عنوان الصفحة")).toBeVisible();
    await expect(form.fieldError("يرجى إدخال رابط الصفحة")).toBeVisible();
    await expect(form.fieldError("يرجى إدخال محتوى الصفحة")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/static-pages\/new-page$/);
  });

  test("rejects a slug that already exists on the server, as a global toast (no onError -> setFormFieldErrors here either)", async ({
    page,
  }) => {
    const form = new StaticPageFormPage(page);
    await form.fillTitle(`E2E Duplicate Slug Attempt ${Date.now()}`);
    await form.fillSlug(testData.staticPages.about.slug);
    await form.setContent("some valid content");
    await form.submit();

    await expect(page.getByText("slug موجود بالفعل")).toBeVisible();
    // Stays on the create form - the mutation rejected, no navigation happened.
    await expect(page).toHaveURL(/\/admin\/static-pages\/new-page$/);
  });

  test("known issue: a purely numeric slug is rejected with a message that mixes the raw English field name 'slug' into the Arabic sentence, because lang/ar/validation.php has no 'attributes' entry for it", async ({
    page,
  }) => {
    // StorePageRequest's slug rule includes not_regex:/^[0-9]+$/, and every
    // other field here (title/content) has a translated Arabic 'attributes'
    // entry in lang/ar/validation.php - slug does not, so Laravel falls back
    // to the raw attribute key "slug" verbatim inside the Arabic sentence.
    const form = new StaticPageFormPage(page);
    await form.fillTitle(`E2E Numeric Slug ${Date.now()}`);
    await form.fillSlug("12345");
    await form.setContent("some valid content");
    await form.submit();

    await expect(page.getByText("صيغة slug غير صحيحة")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/static-pages\/new-page$/);
  });

  test("known issue: the slug field has no url-safe format validation - spaces, symbols, and Arabic text are all accepted", async ({
    page,
  }) => {
    // StorePageRequest only rejects a slug that is *purely* numeric
    // (not_regex:/^[0-9]+$/) - there is no alpha_dash/regex rule requiring
    // url-safe characters, so a "slug" meant to appear in a URL can contain
    // anything except an all-digit string.
    const uniqueSuffix = Date.now();
    const weirdSlug = `e2e weird slug ${uniqueSuffix} !@# اختبار`;
    const title = `E2E Weird Slug ${uniqueSuffix}`;
    const form = new StaticPageFormPage(page);
    await form.fillTitle(title);
    await form.fillSlug(weirdSlug);
    await form.setContent("some valid content");
    await form.submit();

    await expect(page).toHaveURL(/\/admin\/static-pages$/);
    const list = new StaticPagesListPage(page);
    const row = list.list.rowByText(title);
    await expect(row).toBeVisible();

    // Clean up the page this test created.
    await list.deleteViaMenu(row);
    const confirmDialog = new ConfirmDialog(page);
    await confirmDialog.confirm("حذف الصفحة", "حذف");
    await expect(list.list.rowByText(title)).toHaveCount(0);
  });

  test("known issue: a title longer than 255 characters is only ever caught by the backend, as a global toast - the <Input> has no maxLength and no client-side max rule", async ({
    page,
  }) => {
    const form = new StaticPageFormPage(page);
    await form.fillTitle("A".repeat(256));
    await form.fillSlug(`e2e-long-title-${Date.now()}`);
    await form.setContent("some valid content");
    await form.submit();

    await expect(
      page.getByText("يجب أن لا يتجاوز طول النّص العنوان 255 حروفٍ/حرفًا"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/static-pages\/new-page$/);
  });

  test("known issue: typing content then clearing it leaves Tiptap's empty '<p></p>' wrapper, which silently bypasses the 'required' content validation on both the client and the server", async ({
    page,
  }) => {
    // RichTextEditor's onUpdate always emits editor.getHTML(), which for an
    // "empty" editor is the non-empty string "<p></p>" (not ""). antd's
    // built-in `required` rule only checks for undefined/null/'' and
    // StorePageRequest's `content` rule is just ['required','string'] with no
    // whitespace/strip_tags check - "<p></p>" satisfies both, so a page can
    // be published with completely blank visible content.
    const uniqueSuffix = Date.now();
    const title = `E2E Blank Content ${uniqueSuffix}`;
    const form = new StaticPageFormPage(page);
    await form.fillTitle(title);
    await form.fillSlug(`e2e-blank-content-${uniqueSuffix}`);
    await form.setContent("temporary text");
    // Clear it back out, leaving Tiptap's empty-paragraph HTML.
    await form.contentEditor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");

    await form.submit();

    // No inline "يرجى إدخال محتوى الصفحة" error, and the page was created.
    await expect(form.fieldError("يرجى إدخال محتوى الصفحة")).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/static-pages$/);

    const list = new StaticPagesListPage(page);
    const row = list.list.rowByText(title);
    await expect(row).toBeVisible();

    // Clean up the page this test created.
    await list.deleteViaMenu(row);
    const confirmDialog = new ConfirmDialog(page);
    await confirmDialog.confirm("حذف الصفحة", "حذف");
    await expect(list.list.rowByText(title)).toHaveCount(0);
  });
});

test.describe("Static pages - full lifecycle", () => {
  test("creates a page with all fields, edits it, and deletes it", async ({ page }) => {
    const uniqueSuffix = Date.now();
    const title = `E2E Static Page ${uniqueSuffix}`;
    const slug = `e2e-static-page-${uniqueSuffix}`;
    const content = "This is the full lifecycle test content.";

    const form = new StaticPageFormPage(page);
    await form.gotoNew();
    await form.fillTitle(title);
    await form.fillSlug(slug);
    await form.setContent(content);
    await form.setCheckbox("عرض في صفحة التسجيل", true);
    await form.setCheckbox("عرض في تذييل الصفحة", true);
    await form.setCheckbox("عرض في قائمة الصفحة", false);
    await form.selectScope("عميل");
    await form.setCheckbox("نشر الصفحة", true);
    await form.submit();

    await expect(page).toHaveURL(/\/admin\/static-pages$/);
    const list = new StaticPagesListPage(page);
    const createdRow = list.list.rowByText(title);
    await expect(createdRow).toBeVisible();
    await expect(list.statusTag(createdRow)).toHaveText("مفعلة");

    // Edit: verify every field round-trips correctly.
    await list.editViaMenu(createdRow);
    await expect(page).toHaveURL(/\/admin\/static-pages\/edit\/\d+$/);
    await expect(page.getByText("تعديل الصفحة", { exact: true })).toBeVisible();
    await expect(form.titleInput).toHaveValue(title);
    await expect(form.slugInput).toHaveValue(slug);
    await expect(form.contentEditor).toContainText(content);
    await expect(form.checkboxInput("عرض في صفحة التسجيل")).toBeChecked();
    await expect(form.checkboxInput("عرض في تذييل الصفحة")).toBeChecked();
    await expect(form.checkboxInput("عرض في قائمة الصفحة")).not.toBeChecked();
    await expect(form.checkboxInput("نشر الصفحة")).toBeChecked();
    expect(await form.selectedScopeLabel()).toBe("عميل");

    // Edit: change the title and save back.
    const editedTitle = `${title} (edited)`;
    await form.fillTitle(editedTitle);
    await form.submit();
    await expect(page).toHaveURL(/\/admin\/static-pages$/);
    await expect(list.list.rowByText(editedTitle)).toBeVisible();

    // Delete: cancel first, row must survive.
    const editedRow = list.list.rowByText(editedTitle);
    await list.deleteViaMenu(editedRow);
    const confirmDialog = new ConfirmDialog(page);
    await expect(page.getByText("هل أنت متأكد من حذف هذه الصفحة؟")).toBeVisible();
    await confirmDialog.cancel("حذف الصفحة", "إلغاء");
    await expect(list.list.rowByText(editedTitle)).toBeVisible();

    // Delete: confirm this time, row must disappear.
    await list.deleteViaMenu(editedRow);
    await confirmDialog.confirm("حذف الصفحة", "حذف");
    await expect(list.list.rowByText(editedTitle)).toHaveCount(0);
  });
});

test.describe("Static pages - editing a seeded fixture page (read-only)", () => {
  test("opening 'e2e-terms' for edit pre-fills every field correctly, including its rich text content", async ({
    page,
  }) => {
    const list = new StaticPagesListPage(page);
    await list.goto();
    const termsRow = list.list.rowByText(testData.staticPages.terms.title);
    await list.editViaMenu(termsRow);

    const form = new StaticPageFormPage(page);
    await expect(page).toHaveURL(/\/admin\/static-pages\/edit\/\d+$/);
    await expect(form.titleInput).toHaveValue(testData.staticPages.terms.title);
    await expect(form.slugInput).toHaveValue(testData.staticPages.terms.slug);
    await expect(form.contentEditor).toContainText(testData.staticPages.terms.content);
    await expect(form.checkboxInput("عرض في صفحة التسجيل")).toBeChecked();
    await expect(form.checkboxInput("عرض في تذييل الصفحة")).toBeChecked();
    await expect(form.checkboxInput("عرض في قائمة الصفحة")).not.toBeChecked();
    await expect(form.checkboxInput("نشر الصفحة")).toBeChecked();
    expect(await form.selectedScopeLabel()).toBe(testData.staticPages.terms.scopeLabel);

    // Read-only: navigate away without submitting, so the seeded fixture is
    // never touched.
  });
});

test.describe("Static pages - known issues (edge cases)", () => {
  test("known issue: the 'معاينة الصفحة' preview button is a dead stub - clicking it does nothing", async ({
    page,
  }) => {
    // staticPageForm.tsx's handlePreview callback is `// TODO: Implement
    // preview functionality` - the button renders and is clickable, but
    // produces no navigation, no modal, and no request.
    const form = new StaticPageFormPage(page);
    await form.gotoNew();
    await form.fillTitle("Preview button probe");

    let requestFired = false;
    page.on("request", (req) => {
      if (req.url().includes("/admin/pages")) requestFired = true;
    });

    await form.previewButton.click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL(/\/admin\/static-pages\/new-page$/);
    expect(requestFired).toBe(false);
    await expect(page.locator(".ant-modal-content")).toHaveCount(0);
  });

  test("known issue: navigating to edit a non-existent page id silently resets to a blank form, still titled 'تعديل الصفحة', with no error shown", async ({
    page,
  }) => {
    // getStaticPageById(999999) 404s; src/interceptor.ts's response
    // interceptor has no `case 404` (falls through to `default: break`), so
    // no toast fires. staticPageForm.tsx's `initialValues` memo only uses
    // `staticPage` when it is truthy, so it silently falls back to the
    // brand-new-page defaults (blank title/slug/content, scope "both", every
    // checkbox unchecked) while the header still reads "تعديل الصفحة" -
    // an admin has no way to tell this id doesn't exist.
    const form = new StaticPageFormPage(page);
    await form.gotoEdit(999999);

    await expect(page.getByText("تعديل الصفحة", { exact: true })).toBeVisible();
    await expect(form.titleInput).toHaveValue("");
    await expect(form.slugInput).toHaveValue("");
    await expect(page.locator(".ant-message-error")).toHaveCount(0);

    // Submitting in this state would silently PATCH /admin/pages/999999 with
    // fresh required-field errors from the blank inputs - not exercised here
    // to avoid any risk of ambiguity around exactly which id gets touched.
  });
});
