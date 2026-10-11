import assert from "node:assert/strict";
import {test} from "node:test";
import {runInNewContext} from "node:vm";
import {waitForFixtureCompletion} from "./fixture-completion.mjs";

test("completion uses timer polling and preserves the deadline and rejection", async () => {
  let predicate;
  const failure = new Error("original timeout");
  const page = {waitForFunction(fn, arg, options) {
    predicate = fn;
    assert.equal(arg, undefined);
    assert.deepEqual(options, {timeout: 2345, polling: 100});
    return Promise.reject(failure);
  }};
  await assert.rejects(waitForFixtureCompletion(page, 2345), error => error === failure);
  const handle = {};
  const completed = {waitForFunction(fn, arg, options) {
    assert.equal(arg, undefined);
    assert.deepEqual(options, {timeout: 180000, polling: 100});
    return Promise.resolve(handle);
  }};
  assert.equal(await waitForFixtureCompletion(completed), handle);
  for (const status of [undefined, false, true]) {
    const document = {getElementById(id) {
      assert.equal(id, "result");
      return status === undefined ? null : {hasAttribute(name) {
        assert.equal(name, "data-status");
        return status;
      }};
    }};
    assert.equal(runInNewContext(`(${predicate.toString()})()`, {document}), status);
  }
});

test("timer completion works when animation-frame polling is suppressed", {
  skip: process.env.BREDITOR_COMPLETION_BROWSER_TEST !== "1",
}, async () => {
  // A synthetic scheduler control, not editor/native qualification.
  const {firefox} = await import("playwright-core");
  const browser = await firefox.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="result"></div>');
    await page.evaluate(() => {
      window.__completionFrameRequests = 0;
      window.requestAnimationFrame = () => {window.__completionFrameRequests++; return 1;};
      window.__completionStarted = false;
    });
    await assert.rejects(page.waitForFunction(
      () => {
        const element = document.getElementById("result");
        if (!window.__completionStarted) {
          window.__completionStarted = true;
          setTimeout(() => element.setAttribute("data-status", "passed"), 25);
        }
        return element.hasAttribute("data-status");
      },
      undefined, {timeout: 500},
    ), /Timeout/u);
    assert.ok(await page.evaluate(() => window.__completionFrameRequests) > 0);
    assert.equal(await page.locator("#result").getAttribute("data-status"), "passed");
    await page.evaluate(() => {
      const element = document.getElementById("result");
      element.removeAttribute("data-status");
      window.__completionReads = 0;
      const hasAttribute = element.hasAttribute.bind(element);
      element.hasAttribute = name => {
        window.__completionReads++;
        if (window.__completionReads === 1) {
          setTimeout(() => element.setAttribute("data-status", "passed"), 25);
        }
        return hasAttribute(name);
      };
    });
    await waitForFixtureCompletion(page, 2000);
    assert.ok(await page.evaluate(() => window.__completionReads) >= 2);
    assert.equal(await page.locator("#result").getAttribute("data-status"), "passed");
  } finally {await browser.close();}
});
