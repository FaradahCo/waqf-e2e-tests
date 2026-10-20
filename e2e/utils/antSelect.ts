import type { Locator, Page } from "@playwright/test";

/**
 * antd keeps every <Select>'s dropdown panel mounted in the DOM (appended to
 * body), toggling a "hidden" class - so when two selects sit close together
 * (or one closes while another opens), ":not(.ant-select-dropdown-hidden)"
 * can transiently match more than one panel.
 *
 * Each Select's search input carries `aria-controls="<id>_list"`, but that id
 * belongs to a zero-size accessibility shadow copy (`height:0;width:0`) used
 * for aria-activedescendant tracking - not the visible, virtualized option
 * list. The real rendered options live in that element's ancestor
 * `.ant-select-dropdown` panel, which this walks up to for a precise,
 * collision-proof scope.
 */
export async function openAntSelectListbox(
  page: Page,
  container: Locator,
): Promise<Locator> {
  await container.locator(".ant-select-selector").click();
  const combobox = container.locator('input[role="combobox"]');
  const listId = await combobox.getAttribute("aria-controls");
  if (!listId) {
    throw new Error("antd Select combobox is missing aria-controls");
  }
  const dropdown = page
    .locator(`#${listId}`)
    .locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select-dropdown ")]',
    )
    .first();
  await dropdown.waitFor({ state: "visible" });
  return dropdown;
}

export async function selectAntOption(
  page: Page,
  container: Locator,
  optionText: string | RegExp,
  options: { exact?: boolean } = {},
) {
  const listbox = await openAntSelectListbox(page, container);
  await listbox.getByText(optionText, { exact: options.exact ?? true }).click();
}
