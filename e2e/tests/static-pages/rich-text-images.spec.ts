import { expect, test } from "@playwright/test";
import { StaticPagesListPage } from "../../pages/StaticPagesListPage";
import { StaticPageFormPage } from "../../pages/StaticPageFormPage";
import { ConfirmDialog } from "../../pages/ConfirmDialog";

// Covers richTextEditor.tsx's Tiptap "🖼️ صورة" toolbar button, which prompts
// via window.prompt() for an image URL and inserts it with
// `editor.chain().focus().setImage({ src: url }).run()`. Every page created
// here is its own new page (never one of the 3 seeded static-pages fixtures),
// cleaned up at the end of each test, per static-pages.spec.ts's rule.

const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const EXTERNAL_IMAGE_URL = "https://example.com/e2e-fixture-image.png";

test.describe("Rich text editor - image insertion", () => {
  test("inserting an image via the URL prompt adds it to the live editor", async ({ page }) => {
    const form = new StaticPageFormPage(page);
    await form.gotoNew();
    await form.setContent("some text before the image");

    await form.insertImage(EXTERNAL_IMAGE_URL);

    await expect(form.contentEditor.locator("img")).toHaveAttribute("src", EXTERNAL_IMAGE_URL);
  });

  test("an image inserted via an http(s) URL round-trips correctly: it's still there after save + reopen", async ({
    page,
  }) => {
    const uniqueSuffix = Date.now();
    const title = `E2E Image Roundtrip URL ${uniqueSuffix}`;
    const slug = `e2e-image-roundtrip-url-${uniqueSuffix}`;

    const form = new StaticPageFormPage(page);
    await form.gotoNew();
    await form.fillTitle(title);
    await form.fillSlug(slug);
    await form.setContent("some text before the image");
    await form.insertImage(EXTERNAL_IMAGE_URL);
    await form.submit();

    await expect(page).toHaveURL(/\/admin\/static-pages$/);
    const list = new StaticPagesListPage(page);
    const row = list.list.rowByText(title);
    await expect(row).toBeVisible();

    await list.editViaMenu(row);
    await expect(page).toHaveURL(/\/admin\/static-pages\/edit\/\d+$/);
    await expect(form.contentEditor.locator("img")).toHaveAttribute("src", EXTERNAL_IMAGE_URL);

    // Clean up the page this test created (we're on the edit form now).
    await page.goto("/admin/static-pages");
    await list.deleteViaMenu(list.list.rowByText(title));
    const confirmDialog = new ConfirmDialog(page);
    await confirmDialog.confirm("حذف الصفحة", "حذف");
    await expect(list.list.rowByText(title)).toHaveCount(0);
  });

  test("known issue: an image inserted via a data: URI (e.g. a pasted base64 image) vanishes the moment the page is reopened for edit", async ({
    page,
  }) => {
    // @tiptap/extension-image's `allowBase64` option defaults to `false`, and
    // richTextEditor.tsx's `Image.configure({...})` never overrides it. That
    // option only affects *parsing* HTML back into the editor (its
    // `parseHTML` tag selector is `'img[src]:not([src^="data:"])'` when
    // disabled) - so `setImage({src: dataUri})` still inserts it live (this
    // is a Node-JSON insert, not an HTML-string parse), and it's saved to the
    // backend as-is inside the page's `content` HTML. But the moment the
    // form is reopened - whether via a fresh page load on the edit route, or
    // any call to `editor.commands.setContent(value)` - Tiptap re-parses that
    // saved HTML string and silently drops the <img> node, since a data: URI
    // never matches the allowed selector. The image is gone with no error.
    const uniqueSuffix = Date.now();
    const title = `E2E Image Roundtrip DataURI ${uniqueSuffix}`;
    const slug = `e2e-image-roundtrip-datauri-${uniqueSuffix}`;

    const form = new StaticPageFormPage(page);
    await form.gotoNew();
    await form.fillTitle(title);
    await form.fillSlug(slug);
    await form.setContent("some text before the image");
    await form.insertImage(TINY_PNG_DATA_URI);
    // Confirms the live editor genuinely has the image before saving - this
    // isn't a "the button did nothing" case.
    await expect(form.contentEditor.locator("img")).toHaveCount(1);
    await form.submit();

    await expect(page).toHaveURL(/\/admin\/static-pages$/);
    const list = new StaticPagesListPage(page);
    const row = list.list.rowByText(title);
    await expect(row).toBeVisible();

    await list.editViaMenu(row);
    await expect(page).toHaveURL(/\/admin\/static-pages\/edit\/\d+$/);
    await expect(form.titleInput).toHaveValue(title);
    // The image silently disappeared - no error, no toast, just gone.
    await expect(form.contentEditor.locator("img")).toHaveCount(0);
    await expect(page.locator(".ant-message-error")).toHaveCount(0);

    // Clean up the page this test created (we're on the edit form now).
    await page.goto("/admin/static-pages");
    await list.deleteViaMenu(list.list.rowByText(title));
    const confirmDialog = new ConfirmDialog(page);
    await confirmDialog.confirm("حذف الصفحة", "حذف");
    await expect(list.list.rowByText(title)).toHaveCount(0);
  });
});
