import { expect, type Locator } from "@playwright/test";

/**
 * Observe the real dirty-to-saved publication before dispatching an action.
 * Polling only after a click returns can miss the entire 250 ms autosave window
 * on a busy worker. This read-only observer retains the edge without changing
 * application clocks, persistence, or the subsequent reload/history assertions.
 */
export async function expectAutosavedAction(
  status: Locator,
  action: () => Promise<void>,
  timeoutMs = 10_000,
): Promise<void> {
  await expect(status).toHaveText("All changes saved.", { timeout: timeoutMs });
  const observation = await status.evaluateHandle((node) => {
    const seen = { dirty: false, saved: false };
    const observer = new MutationObserver(() => {
      const message = node.textContent;
      if (message === "Unsaved changes; save scheduled." || message === "Saving changes…") {
        seen.dirty = true;
        seen.saved = false;
      } else if (seen.dirty && message === "All changes saved.") {
        seen.saved = true;
      }
    });
    observer.observe(node, { childList: true, characterData: true, subtree: true });
    return { seen, disconnect: () => observer.disconnect() };
  });
  try {
    await action();
    await expect.poll(
      () => observation.evaluate(({ seen }) => seen),
      { timeout: timeoutMs, message: "the action must publish dirty state and finish saving" },
    ).toEqual({ dirty: true, saved: true });
    await expect(status).toHaveText("All changes saved.", { timeout: timeoutMs });
  } finally {
    try {
      await observation.evaluate(({ disconnect }) => disconnect());
    } finally {
      await observation.dispose();
    }
  }
}
