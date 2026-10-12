import assert from "node:assert/strict";
import {test} from "node:test";
import {runInNewContext} from "node:vm";
import {readFixtureFailureState, waitForFixtureCompletion} from "./fixture-completion.mjs";

test("failure state uses one bounded read and preserves uncompleted state", async () => {
  let calls = 0;
  const reads = [];
  const element = {getAttribute(name) {reads.push(name); return name === "data-progress" ? "initialization" : name === "data-cases-completed" ? "0" : null;},
    get textContent() {reads.push("textContent"); return "starting";}};
  const resources = Array.from({length: 15}, (_, i) => ({name: `http://127.0.0.1:1234/assets/${i}.js`, initiatorType: "script", duration: i, responseEnd: i + 1, transferSize: i * 10}));
  const page = {locator(selector) {
    assert.equal(selector, "#result");
    return {evaluate(fn, arg, options) {
      calls++;
      assert.equal(arg, undefined);
      assert.deepEqual(options, {timeout: 5000});
      return runInNewContext(`(${fn.toString()})(element)`, {element, URL,
        document: {visibilityState: "visible", readyState: "complete"},
        performance: {getEntriesByType(type) {assert.equal(type, "resource"); return resources;}},
      });
    }};
  }};
  const result = await readFixtureFailureState(page);
  assert.equal(calls, 1);
  assert.deepEqual(reads, ["data-drain-start-ms", "data-drain-start-wall-ms", "data-status", "textContent", "data-progress", "data-cases-completed", "data-drain-total-ms", "data-drain-max-ms", "data-drain-total-wall-ms", "data-work-total-wall-ms", "data-work-last-wall-ms"]);
  assert.equal(result.status, null);
  assert.equal(result.output, "starting");
  assert.equal(result.progress, "initialization");
  assert.equal(result.completedCases, "0");
  assert.equal(result.drainWaitMs, null);
  assert.equal(result.resources.length, 12);
  assert.equal(result.resources[0].path, "/assets/3.js");
  assert.equal(result.resources[11].path, "/assets/14.js");
  assert.equal(await readFixtureFailureState(undefined), undefined);
});

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

test("failure state distinguishes wall-clock and monotonic drain time", async () => {
  const attributes = {"data-drain-start-ms": "50", "data-drain-start-wall-ms": "1000",
    "data-progress": "100 items, repetition 20: drain", "data-cases-completed": "51",
    "data-drain-total-wall-ms": "350", "data-work-total-wall-ms": "12000"};
  const element = {textContent: "starting", getAttribute(name) {return attributes[name] ?? null;}};
  const page = {locator() {return {evaluate(fn) {return runInNewContext(`(${fn.toString()})(element)`, {
    element, URL, Date: {now: () => 11000},
    document: {visibilityState: "visible", readyState: "complete"},
    performance: {now: () => 51, getEntriesByType: () => []},
  });}};}};
  const state = await readFixtureFailureState(page);
  assert.equal(state.drainWaitMs, 1);
  assert.equal(state.drainWaitWallMs, 10000);
  assert.equal(state.completedCases, "51");
  assert.equal(state.status, null);
  assert.equal(state.workTotalWallMs, "12000");
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
