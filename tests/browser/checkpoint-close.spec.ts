import { expect, test } from "@playwright/test";

test("checkpoint closure during native digest ignores a shadowed status getter", async ({ page }) => {
  await page.goto("/selection-endpoint.html");
  const result = await page.evaluate(async () => {
    const url = "/checkpoint_lifecycle_probe.ts";
    const probe = await import(url) as typeof import("./harness/checkpoint_lifecycle_probe");
    return probe.probePrivateCheckpointLifecycle();
  });
  expect(result).toEqual({
    load: "session_checkpoint.connection",
    save: "session_checkpoint.connection",
    digestCalls: 2,
    publicStatusReads: 0,
  });
});

test("closing a checkpoint store settles loads queued behind a blocked database deletion", async ({ page }) => {
  await page.goto("/selection-endpoint.html");
  const result = await page.evaluate(async () => {
    const url = "/checkpoint_close_probe.ts";
    const probe = await import(url) as typeof import("./harness/checkpoint_close_probe");
    return probe.probeBlockedCheckpointClose();
  });
  expect(result).toEqual({
    settledBeforeUnblock: true,
    errors: ["session_checkpoint.connection", "session_checkpoint.connection"],
    nativeCompletion: "AbortError",
    closed: true,
  });
});
