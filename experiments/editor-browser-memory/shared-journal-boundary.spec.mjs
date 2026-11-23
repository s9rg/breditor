import { expect, test } from "@playwright/test";

test("measure the shared journal limit in the installed editor", async ({ page, browser }, testInfo) => {
  await page.goto("/shared-session.html");
  await expect(page.locator("#ready")).toHaveText("Ready");
  const originalDocument = await page.evaluate(() => window.durableSdk.a.view().documentJson);
  const client = await page.context().newCDPSession(page);
  const samples = [];
  let firstFailure = null;

  for (let round = 1; round <= 120; round++) {
    const measure = round >= 100 || [1, 25, 50, 75].includes(round);
    const result = await page.evaluate(async ({ round, measure }) => {
      const { a, b, range, sync } = window.durableSdk;
      const baseline = a.view().documentJson;
      const encode = new TextEncoder();
      const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value)),
        byte => byte.toString(16).padStart(2, "0")).join("");
      let step = "select";
      let completedEdit;
      try {
        a.select(range("deep-head", 0));
        step = "edit";
        a.core.type("x");
        step = "sync after edit";
        await sync();
        if (!b.view().documentJson.includes("xNested idea")) throw new Error("Peer edit did not arrive");
        completedEdit = a.view().documentJson;
        step = "undo";
        a.core.undo();
        step = "sync after undo";
        await sync();
        if (a.view().documentJson !== baseline) throw new Error("Undo did not restore the document");
        if (!measure) return null;
        step = "flush";
        await Promise.all([a.flush(), b.flush()]);
        step = "measure";
        const checkpoints = [a, b].map(owner => encode.encode(owner.checkpointJson()));
        return { round, checkpointBytes: checkpoints.map(bytes => bytes.length),
          checkpointDigests: await Promise.all(checkpoints.map(digest)) };
      } catch (error) {
        return { round, step, failure: String(error).slice(0, 250), code: error?.code ?? null,
          completedEditDigest: completedEdit === undefined ? null : await digest(encode.encode(completedEdit)) };
      }
    }, { round, measure });
    if (result?.failure !== undefined) {
      firstFailure = result;
      break;
    }
    if (result) {
      await client.send("HeapProfiler.collectGarbage");
      const { backingStorageSize } = await client.send("Runtime.getHeapUsage");
      samples.push({ ...result, backingStorageSize });
    }
  }

  let reopen = null;
  if (firstFailure) {
    await page.reload();
    await expect(page.locator("#ready")).toHaveText("Ready");
    reopen = await page.evaluate(async ({ originalDocument, previous, completedEdit }) => {
      const { a, b } = window.durableSdk;
      const owners = [a, b];
      const encode = new TextEncoder();
      const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value)),
        byte => byte.toString(16).padStart(2, "0")).join("");
      const checkpoints = owners.map(owner => encode.encode(owner.checkpointJson()));
      const documents = owners.map(owner => owner.view().documentJson);
      return {
        recovered: owners.map(owner => owner.recovered),
        checkpointBytes: checkpoints.map(bytes => bytes.length),
        checkpointsMatchLastCompleteRound: await Promise.all(checkpoints.map(async (bytes, index) =>
          await digest(bytes) === previous[index])),
        documentsMatchOriginal: documents.map(document => document === originalDocument),
        documentsMatchCompletedEdit: await Promise.all(documents.map(async document =>
          await digest(encode.encode(document)) === completedEdit)),
        peersConverged: documents[0] === documents[1],
      };
    }, { originalDocument, previous: samples.at(-1)?.checkpointDigests ?? [], completedEdit: firstFailure.completedEditDigest });
  }

  const report = {
    format: "breditor/installed-shared-journal-boundary",
    formatVersion: 1,
    chromeVersion: browser.version(),
    platform: process.platform,
    arch: process.arch,
    samples: samples.map(({ checkpointDigests, ...sample }) => sample),
    firstFailure: firstFailure && { round: firstFailure.round, step: firstFailure.step, failure: firstFailure.failure, code: firstFailure.code },
    reopen,
  };
  await testInfo.attach("shared-journal-boundary", {
    contentType: "application/json",
    body: JSON.stringify(report, null, 2),
  });
  console.log(JSON.stringify(report));
  expect(samples.length).toBeGreaterThan(0);
  if (firstFailure) {
    expect(firstFailure.code ?? firstFailure.failure).toMatch(
      /^(?:session_budget|feasibility budget exceeded: rich journal bytes)$/,
    );
    expect(reopen.recovered).toEqual([true, true]);
  }
});
