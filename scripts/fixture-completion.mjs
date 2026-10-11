// Fixture completion is not a rendered-frame condition. Frame callbacks can
// stop while a page has already completed (for example on a locked desktop).
// Poll the same DOM marker on a timer; do not retry or reinterpret failures.
export const FIXTURE_COMPLETION_POLLING_MS = 100;

export function waitForFixtureCompletion(page, timeout = 180000) {
  return page.waitForFunction(
    () => document.getElementById("result")?.hasAttribute("data-status"),
    undefined,
    {timeout, polling: FIXTURE_COMPLETION_POLLING_MS},
  );
}
