import { expect, test, type Page } from "@playwright/test";
import { ConsultationQuestionsPage } from "../../pages/ConsultationQuestionsPage";
import { testData } from "../../fixtures/testData";
import { env } from "../../fixtures/env";

type LiveQuestion = {
  id: number;
  text: string;
  type: string;
  is_required: boolean;
  is_active: boolean;
  has_other_option: boolean;
  order: number;
  options: { id: number; option_text: string; order: number }[];
};

async function authHeaders(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("ADMIN_token"));
  return { Authorization: `Bearer ${token}`, "X-API-KEY": env.apiKey };
}

/** Question ids aren't stable across a reseed - look one up by its unique seeded text.
 * `includeInactive` mirrors the real GET /admin/questions?include_inactive=1 param the
 * admin UI itself never sends (see the "known issue" test below). */
async function getLiveQuestionByText(
  page: Page,
  text: string,
  includeInactive = false,
): Promise<LiveQuestion> {
  const headers = await authHeaders(page);
  const response = await page.request.get(`${env.backendApiUrl}/admin/questions`, {
    headers,
    params: includeInactive ? { include_inactive: 1 } : undefined,
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const match = (body.data.data as LiveQuestion[]).find((q) => q.text === text);
  if (!match) throw new Error(`No seeded question found with text "${text}"`);
  return match;
}

// This module edits the real, live pre-consultation questionnaire shown to
// every client who requests a consultation - not a disposable per-test
// fixture row. So every test below either only exercises client-side
// validation (blocked before any network call), mocks the network response
// for anything that would deactivate/reorder a real seeded question, or - for
// the one recommended real round-trip test - reads the live question first
// and restores it in a `finally` block no matter what.
test.describe("Consultation questions - read-only rendering", () => {
  test.beforeEach(async ({ page }) => {
    const questions = new ConsultationQuestionsPage(page);
    await questions.goto();
  });

  test("renders only the active seeded questions, each with its type-specific fields", async ({
    page,
  }) => {
    const questions = new ConsultationQuestionsPage(page);
    expect(await questions.panelCount()).toBe(2);

    const singlePanel = questions.panel(0);
    await expect(questions.textInput(singlePanel)).toHaveValue(testData.questions.single.text);
    await expect(
      questions.typeField(singlePanel).locator(".ant-select-selection-item"),
    ).toHaveText("اجابة واحدة");
    await expect(questions.optionInputs(singlePanel)).toHaveCount(
      testData.questions.single.options.length,
    );
    for (const [i, optionText] of testData.questions.single.options.entries()) {
      await expect(questions.optionInputs(singlePanel).nth(i)).toHaveValue(optionText);
    }

    const multiplePanel = questions.panel(1);
    await expect(questions.textInput(multiplePanel)).toHaveValue(
      testData.questions.multiple.text,
    );
    await expect(
      questions.typeField(multiplePanel).locator(".ant-select-selection-item"),
    ).toHaveText("اختيار من متعدد");
    await expect(questions.optionInputs(multiplePanel)).toHaveCount(
      testData.questions.multiple.options.length,
    );
  });

  test("known issue: an inactive question is completely invisible here, with no way to view or reactivate it from this screen", async ({
    page,
  }) => {
    // GET /admin/questions defaults to is_active=true unless the caller
    // sends `include_inactive=1` (QuestionController@index) -
    // consultationService.ts's getAllQuestions() never sends it, and
    // transformFormValues() filters to `is_active` a second time on top of
    // that - so the seeded inactive text-type question never renders as a
    // panel, and this screen offers no toggle/filter to reach it at all.
    const questions = new ConsultationQuestionsPage(page);
    expect(await questions.panelCount()).toBe(2);
    await expect(page.getByText(testData.questions.inactive.text)).toHaveCount(0);

    // Confirm it genuinely still exists (just inactive), not merely renamed/removed.
    const live = await getLiveQuestionByText(page, testData.questions.inactive.text, true);
    expect(live.is_active).toBe(false);
  });
});

test.describe("Consultation questions - adding a question (client-side validation only)", () => {
  test.beforeEach(async ({ page }) => {
    const questions = new ConsultationQuestionsPage(page);
    await questions.goto();
  });

  /** Guards every test in this group: none of them should ever reach the
   * real bulk-update endpoint, since client-side validation must block an
   * incomplete new question from being submitted. */
  function guardAgainstRealSubmit(page: Page) {
    let called = false;
    return {
      install: () =>
        page.route("**/admin/questions", async (route) => {
          if (route.request().method() === "PATCH") called = true;
          await route.fallback();
        }),
      wasCalled: () => called,
    };
  }

  test("a newly-added blank question defaults to single-choice with one empty option, and blocks submit on both the question text and the option text", async ({
    page,
  }) => {
    const questions = new ConsultationQuestionsPage(page);
    const guard = guardAgainstRealSubmit(page);
    await guard.install();

    await questions.addQuestionButton.click();
    expect(await questions.panelCount()).toBe(3);

    const newPanel = questions.panel(2);
    await expect(
      newPanel.locator(".ant-select-selection-item"),
    ).toHaveText("اجابة واحدة");
    await expect(questions.optionInputs(newPanel)).toHaveCount(1);
    await expect(questions.optionInputs(newPanel)).toHaveValue("");

    await questions.submit();

    await expect(questions.fieldError(newPanel, "يرجى ادخال السؤال")).toBeVisible();
    await expect(questions.fieldError(newPanel, "يرجى إضافة اجابة")).toBeVisible();
    expect(guard.wasCalled()).toBe(false);
  });

  test("switching the new question's type to 'نص' (text) drops the options section and its validation", async ({
    page,
  }) => {
    const questions = new ConsultationQuestionsPage(page);
    const guard = guardAgainstRealSubmit(page);
    await guard.install();

    await questions.addQuestionButton.click();
    const newPanel = questions.panel(2);
    await questions.selectType(newPanel, "نص");

    await expect(questions.optionInputs(newPanel)).toHaveCount(0);

    await questions.submit();
    await expect(questions.fieldError(newPanel, "يرجى ادخال السؤال")).toBeVisible();
    await expect(questions.fieldError(newPanel, "يرجى إضافة اجابة")).toHaveCount(0);
    expect(guard.wasCalled()).toBe(false);
  });

  test("removing a newly-added (unsaved) question only updates the form locally - no network call is made", async ({
    page,
  }) => {
    const questions = new ConsultationQuestionsPage(page);
    const guard = guardAgainstRealSubmit(page);
    await guard.install();
    let statusCallMade = false;
    await page.route("**/admin/questions/*/status", async (route) => {
      statusCallMade = true;
      await route.fallback();
    });

    await questions.addQuestionButton.click();
    expect(await questions.panelCount()).toBe(3);

    const newPanel = questions.panel(2);
    await questions.deleteQuestionButton(newPanel).click();
    await expect(questions.deleteConfirmModal).toBeVisible();
    await questions.confirmDelete();

    await expect(questions.deleteConfirmModal).toBeHidden();
    expect(await questions.panelCount()).toBe(2);
    expect(statusCallMade).toBe(false);
    expect(guard.wasCalled()).toBe(false);
  });

  test("adding a second option to a new single-choice question, then removing it, keeps only the first (non-removable) option", async ({
    page,
  }) => {
    const questions = new ConsultationQuestionsPage(page);
    await questions.addQuestionButton.click();
    const newPanel = questions.panel(2);

    await questions.addOptionButton(newPanel).click();
    await expect(questions.optionInputs(newPanel)).toHaveCount(2);

    // The first option (index 0) has no remove button - only later ones do.
    await questions.removeOptionButton(newPanel, 1).click();
    await expect(questions.optionInputs(newPanel)).toHaveCount(1);
  });
});

test.describe("Consultation questions - deactivating an existing question (mocked)", () => {
  test.beforeEach(async ({ page }) => {
    const questions = new ConsultationQuestionsPage(page);
    await questions.goto();
  });

  test("cancelling the delete confirmation leaves the question untouched", async ({ page }) => {
    const questions = new ConsultationQuestionsPage(page);
    let statusCallMade = false;
    await page.route("**/admin/questions/*/status", async (route) => {
      statusCallMade = true;
      await route.fallback();
    });

    const panel = questions.panel(0);
    await questions.deleteQuestionButton(panel).click();
    await expect(questions.deleteConfirmModal).toBeVisible();
    await questions.cancelDelete();

    await expect(questions.deleteConfirmModal).toBeHidden();
    expect(await questions.panelCount()).toBe(2);
    expect(statusCallMade).toBe(false);
  });

  test("confirming delete sends {status:false} to the question's own status endpoint and removes it from the underlying data", async ({
    page,
  }) => {
    const questions = new ConsultationQuestionsPage(page);
    const live = await getLiveQuestionByText(page, testData.questions.single.text);

    let capturedBody: unknown;
    let capturedUrl: string | undefined;
    await page.route(`**/admin/questions/${live.id}/status`, async (route) => {
      capturedBody = route.request().postDataJSON();
      capturedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { ...live, is_active: false },
          message: "تم التعديل بنجاح",
          status: true,
          code: 200,
          errors: [],
        }),
      });
    });

    const panel = questions.panel(0);
    await questions.deleteQuestionButton(panel).click();
    await questions.confirmDelete();

    expect(capturedBody).toEqual({ status: false });
    expect(capturedUrl).toContain(`/admin/questions/${live.id}/status`);
    await expect(page.getByText("تم التعديل بنجاح")).toBeVisible();

    expect(await questions.panelCount()).toBe(1);
    // The remaining panel is the "multiple" question, not the deleted "single" one.
    await expect(questions.textInput(questions.panel(0))).toHaveValue(
      testData.questions.multiple.text,
    );

    // known issue: ConsultationForm.tsx's handleDeleteQuestion updates the
    // "questions" field by calling `form.setFieldValue("questions", filtered)`
    // directly, instead of going through Form.List's own `remove()` API.
    // Form.List has no way to know *which* index was removed this way, so it
    // just drops its LAST tracked field key and keeps the first one's
    // component identity - meaning the surviving panel silently reuses the
    // deleted question's original React component/local state. Concretely:
    // the delete-confirmation Modal (whose open/closed state lives in that
    // same component) never closes, even though the deletion itself
    // succeeded and the panel below it now shows completely different data.
    await expect(questions.deleteConfirmModal).toBeVisible();

    // No real mutation ever reached the backend - the live question must
    // still be active.
    const stillLive = await getLiveQuestionByText(page, testData.questions.single.text);
    expect(stillLive.is_active).toBe(true);
  });
});

test.describe("Consultation questions - real round trip", () => {
  test("toggling and restoring a question's 'is_required' flag through a real submit", async ({
    page,
  }) => {
    // This test does two full real network round trips (submit + poll +
    // submit again) against a live, shared question - give it real headroom
    // under a fully-parallel full-suite run (6 workers contending for the
    // same backend/browser resources) so a slow run doesn't hit the global
    // 30s test timeout mid-mutation and get torn down before the `finally`
    // restore below can run.
    test.setTimeout(90_000);

    const questions = new ConsultationQuestionsPage(page);
    await questions.goto();

    const original = await getLiveQuestionByText(page, testData.questions.single.text);
    // Captured now (while the page is definitely still alive) so the
    // `finally` restore below can use plain `fetch` instead of `page.request`
    // - it must not depend on the Playwright page/context surviving a slow
    // run under full-suite load.
    const headers = await authHeaders(page);
    const panel = questions.panel(0);

    try {
      // The "إمكانية تخطي هذا السؤال" checkbox is inverted: checking it sets
      // is_required=false. The seeded question starts as is_required=true,
      // so it renders unchecked.
      await expect(questions.skippableCheckbox(panel).locator("input")).not.toBeChecked();
      await questions.skippableCheckbox(panel).click();
      await expect(questions.skippableCheckbox(panel).locator("input")).toBeChecked();

      await questions.submit();

      // known issue: this bulk "create or update" endpoint's success toast
      // always reuses __('api.created_successfully') ("تم الاضافة بنجاح"),
      // even though every seeded question here already existed and was only
      // updated, not created (contrast with the commission-settings module's
      // equivalent PUT, which correctly says "تم التعديل بنجاح").
      await expect(page.getByText("تم الاضافة بنجاح")).toBeVisible();

      await expect
        .poll(async () => {
          const live = await getLiveQuestionByText(page, testData.questions.single.text);
          return live.is_required;
        })
        .toBe(false);

      // Restore: toggle back to the original is_required=true and re-submit.
      await questions.skippableCheckbox(questions.panel(0)).click();
      await expect(
        questions.skippableCheckbox(questions.panel(0)).locator("input"),
      ).not.toBeChecked();
      await questions.submit();
      await expect(page.getByText("تم الاضافة بنجاح")).toBeVisible();
    } finally {
      // Always force the live question back to exactly its original values -
      // this is the real questionnaire shown to every client, not a
      // disposable fixture row. Uses plain `fetch` with the headers captured
      // above (not `page.request`), so it still runs even if the page itself
      // got torn down by a test-level timeout.
      await fetch(`${env.backendApiUrl}/admin/questions`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: [
            {
              id: original.id,
              text: original.text,
              type: original.type,
              is_required: original.is_required,
              is_active: original.is_active,
              has_other_option: original.has_other_option,
              order: original.order,
              options: original.options,
            },
          ],
        }),
      });
    }

    const restored = await getLiveQuestionByText(page, testData.questions.single.text);
    expect(restored.is_required).toBe(original.is_required);
    expect(restored.options.map((o) => o.option_text)).toEqual(
      original.options.map((o) => o.option_text),
    );
  });
});
