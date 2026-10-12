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

/** Some standalone probes explicitly expose an initial "running" marker. */
export function waitForTerminalFixtureCompletion(page, timeout = 180000) {
  return page.waitForFunction(
    () => {
      const status = document.getElementById("result")?.getAttribute("data-status");
      return status !== undefined && status !== null && status !== "running";
    }, undefined, {timeout, polling: FIXTURE_COMPLETION_POLLING_MS},
  );
}

// Capture status and payload in one read; separate calls can straddle completion.
// Used only after failure. No retries, mutation, or success reinterpretation.
export function readFixtureFailureState(page) {
  return page?.locator("#result").evaluate(element => {
    const drainStart = element.getAttribute("data-drain-start-ms");
    const start = drainStart === null ? null : Number(drainStart);
    const drainWallStart = element.getAttribute("data-drain-start-wall-ms");
    const wallStart = drainWallStart === null ? null : Number(drainWallStart);
    return {
    status: element.getAttribute("data-status"), output: element.textContent,
    progress: element.getAttribute("data-progress"),
    completedCases: element.getAttribute("data-cases-completed"),
    drainWaitMs: start !== null && Number.isFinite(start) && start >= 0 ? performance.now() - start : null,
    drainTotalMs: element.getAttribute("data-drain-total-ms"),
    drainMaxMs: element.getAttribute("data-drain-max-ms"),
    drainWaitWallMs: wallStart !== null && Number.isFinite(wallStart) && wallStart >= 0 ? Date.now() - wallStart : null,
    drainTotalWallMs: element.getAttribute("data-drain-total-wall-ms"),
    workTotalWallMs: element.getAttribute("data-work-total-wall-ms"),
    workLastWallMs: element.getAttribute("data-work-last-wall-ms"),
    visibility: document.visibilityState, readyState: document.readyState,
    wordCapabilityDiagnostic: globalThis.__breditorLastWordCapability ?? null,
    resources: performance.getEntriesByType("resource").slice(-12).map(entry => ({
      path: new URL(entry.name).pathname,
      initiatorType: entry.initiatorType, duration: entry.duration,
      responseEnd: entry.responseEnd, transferSize: entry.transferSize,
    })),
    };
  }, undefined, {timeout: 5000});
}
